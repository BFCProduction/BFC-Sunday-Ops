#!/usr/bin/env node
/**
 * BFC Sunday Ops - Review Sunday-level issues/evaluations for event assignment.
 *
 * Default mode exports a CSV + JSON review artifact. It does not mutate data.
 * Alan can fill in assigned_event_id for rows that can be confidently assigned,
 * then run the same script against the reviewed CSV.
 *
 * Usage:
 *   node scripts/review-session-assignments.js
 *   node scripts/review-session-assignments.js --from 2026-01-01 --to 2026-04-30
 *   node scripts/review-session-assignments.js --table issues --out artifacts/reviews/issues-review
 *   node scripts/review-session-assignments.js --reviewed artifacts/reviews/session-assignment-review.csv --dry-run
 *   node scripts/review-session-assignments.js --reviewed artifacts/reviews/session-assignment-review.csv --apply
 *   node scripts/review-session-assignments.js --reviewed artifacts/reviews/session-assignment-review.csv --delete-unassigned --dry-run
 *   node scripts/review-session-assignments.js --reviewed artifacts/reviews/session-assignment-review.csv --delete-unassigned --apply
 *   node scripts/review-session-assignments.js --reviewed artifacts/reviews/session-assignment-review.csv --delete-unassigned --apply --use-anon-key
 */

import { createClient } from '@supabase/supabase-js'
import { parse as parseCsv } from 'csv-parse/sync'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, extname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CHURCH_TZ = 'America/Chicago'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function loadLocalEnv() {
  const envPath = join(__dirname, '..', '.env.local')
  if (!existsSync(envPath)) return

  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[key]) process.env[key] = value
  }
}

function parseArgs(argv) {
  const flags = new Set()
  const values = {}

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (!arg.startsWith('--')) continue

    const raw = arg.slice(2)
    const eq = raw.indexOf('=')
    if (eq !== -1) {
      values[raw.slice(0, eq)] = raw.slice(eq + 1)
      continue
    }

    const next = argv[i + 1]
    if (next && !next.startsWith('--')) {
      values[raw] = next
      i += 1
    } else {
      flags.add(raw)
    }
  }

  return { flags, values }
}

function validateDate(name, value) {
  if (!value) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    console.error(`Error: --${name} must be YYYY-MM-DD.`)
    process.exit(1)
  }
  return value
}

function csvEscape(value) {
  if (value == null) return ''
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function writeCsv(path, rows) {
  const headers = [
    'table',
    'row_id',
    'sunday_id',
    'date',
    'title',
    'detail',
    'severity_or_feel',
    'created_or_submitted_at',
    'candidate_events',
    'suggested_event_id',
    'suggestion_confidence',
    'suggestion_reason',
    'assigned_event_id',
    'review_notes',
  ]

  const lines = [
    headers.join(','),
    ...rows.map(row => headers.map(header => csvEscape(row[header])).join(',')),
  ]
  writeFileSync(path, `${lines.join('\n')}\n`)
}

function outputPaths(outArg) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const fallback = join(__dirname, '..', 'artifacts', 'reviews', `session-assignment-review-${stamp}`)
  const base = outArg || fallback
  const ext = extname(base)

  if (ext === '.csv') return { csvPath: base, jsonPath: base.replace(/\.csv$/i, '.json') }
  if (ext === '.json') return { csvPath: base.replace(/\.json$/i, '.csv'), jsonPath: base }
  return { csvPath: `${base}.csv`, jsonPath: `${base}.json` }
}

function localDateString(isoString) {
  if (!isoString) return ''
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CHURCH_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(isoString))
}

function textForRecord(record) {
  return `${record.title || ''} ${record.detail || ''}`.toLowerCase()
}

function detectServiceSlugCue(record) {
  const text = textForRecord(record)
  const cues = new Set()

  if (/\b(9|09)(:00)?\s*(a\.?m\.?)\b/.test(text)) cues.add('sunday-9am')
  if (/\btraditional\b|\bfirst service\b|\bservice\s*1\b|\bs1\b/.test(text)) cues.add('sunday-9am')

  if (/\b11(:00)?\s*(a\.?m\.?)\b/.test(text)) cues.add('sunday-11am')
  if (/\bcontemporary\b|\bsecond service\b|\bservice\s*2\b|\bs2\b/.test(text)) cues.add('sunday-11am')

  return cues.size === 1 ? [...cues][0] : null
}

function suggestAssignment(record, candidates) {
  if (candidates.length === 0) return null

  if (candidates.length === 1) {
    return {
      eventId: candidates[0].id,
      confidence: 'high',
      reason: 'Only one event exists on this date.',
    }
  }

  const serviceSlug = detectServiceSlugCue(record)
  if (serviceSlug) {
    const matches = candidates.filter(candidate => candidate.service_slug === serviceSlug)
    if (matches.length === 1) {
      return {
        eventId: matches[0].id,
        confidence: 'high',
        reason: `Text appears to reference ${serviceSlug}.`,
      }
    }
  }

  return null
}

function describeCandidate(event) {
  const time = event.event_time ? event.event_time.slice(0, 5) : 'time unknown'
  return `${time} ${event.name} [${event.service_slug}] ${event.id}`
}

function chunk(values, size = 100) {
  const output = []
  for (let i = 0; i < values.length; i += size) output.push(values.slice(i, i + size))
  return output
}

async function fetchInBatches(table, select, column, values) {
  if (values.length === 0) return []
  const rows = []

  for (const batch of chunk(values)) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .in(column, batch)

    if (error) throw new Error(`${table} lookup: ${error.message}`)
    rows.push(...(data || []))
  }

  return rows
}

function normalizeIssue(row, sundayDate) {
  return {
    table: 'issues',
    row_id: row.id,
    sunday_id: row.sunday_id,
    date: sundayDate || '',
    title: row.title || '(untitled issue)',
    detail: row.description || '',
    severity_or_feel: row.severity || '',
    created_or_submitted_at: row.created_at || '',
  }
}

function normalizeEvaluation(row, sundayDate) {
  const detailParts = [
    row.broken_moment ? `Broken moment: ${row.broken_moment_detail || 'yes'}` : '',
    row.went_well ? `Went well: ${row.went_well}` : '',
    row.needed_attention ? `Needed attention: ${row.needed_attention}` : '',
    row.area_notes ? `Area notes: ${row.area_notes}` : '',
  ].filter(Boolean)

  return {
    table: 'evaluations',
    row_id: row.id,
    sunday_id: row.sunday_id,
    date: sundayDate || '',
    title: 'Evaluation response',
    detail: detailParts.join(' | '),
    severity_or_feel: row.service_feel || (row.broken_moment ? 'broken_moment' : ''),
    created_or_submitted_at: row.submitted_at || '',
  }
}

async function exportReview({ fromDate, toDate, tableFilter, outArg }) {
  const includeIssues = tableFilter === 'all' || tableFilter === 'issues'
  const includeEvaluations = tableFilter === 'all' || tableFilter === 'evaluations'

  const [issueRows, evaluationRows] = await Promise.all([
    includeIssues
      ? supabase
        .from('issues')
        .select('id,sunday_id,title,description,severity,created_at,event_id')
        .is('event_id', null)
        .not('sunday_id', 'is', null)
        .order('created_at', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    includeEvaluations
      ? supabase
        .from('evaluations')
        .select('id,sunday_id,submitted_at,service_feel,broken_moment,broken_moment_detail,went_well,needed_attention,area_notes,event_id')
        .is('event_id', null)
        .not('sunday_id', 'is', null)
        .order('submitted_at', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ])

  if (issueRows.error) throw new Error(`issues fetch: ${issueRows.error.message}`)
  if (evaluationRows.error) throw new Error(`evaluations fetch: ${evaluationRows.error.message}`)

  const rawRows = [
    ...(issueRows.data || []).map(row => ({ kind: 'issue', row })),
    ...(evaluationRows.data || []).map(row => ({ kind: 'evaluation', row })),
  ]

  const sundayIds = [...new Set(rawRows.map(({ row }) => row.sunday_id).filter(Boolean))]
    .filter(id => UUID_RE.test(id))
  const sundays = await fetchInBatches('sundays', 'id,date', 'id', sundayIds)
  const sundayDateById = new Map(sundays.map(row => [row.id, row.date]))

  const dates = [...new Set(sundays.map(row => row.date).filter(Boolean))]
  const [events, serviceTypes] = await Promise.all([
    fetchInBatches('events', 'id,name,event_date,event_time,service_type_id,legacy_sunday_id,created_at', 'event_date', dates),
    supabase.from('service_types').select('id,slug,name'),
  ])

  if (serviceTypes.error) throw new Error(`service_types lookup: ${serviceTypes.error.message}`)
  const serviceTypeById = new Map((serviceTypes.data || []).map(row => [row.id, row]))
  const eventsByDate = new Map()

  for (const event of events) {
    const serviceType = serviceTypeById.get(event.service_type_id)
    const enriched = {
      ...event,
      service_slug: serviceType?.slug || 'unknown',
      service_type_name: serviceType?.name || 'Unknown service type',
    }
    if (!eventsByDate.has(event.event_date)) eventsByDate.set(event.event_date, [])
    eventsByDate.get(event.event_date).push(enriched)
  }

  for (const eventList of eventsByDate.values()) {
    eventList.sort((a, b) => {
      const timeA = a.event_time || '99:99:99'
      const timeB = b.event_time || '99:99:99'
      return timeA.localeCompare(timeB) || a.name.localeCompare(b.name)
    })
  }

  const records = rawRows
    .map(({ kind, row }) => {
      const sundayDate = sundayDateById.get(row.sunday_id) || localDateString(row.created_at || row.submitted_at)
      const base = kind === 'issue'
        ? normalizeIssue(row, sundayDate)
        : normalizeEvaluation(row, sundayDate)

      const candidates = eventsByDate.get(base.date) || []
      const suggestion = suggestAssignment(base, candidates)

      return {
        ...base,
        candidate_events: candidates.map(describeCandidate).join(' | '),
        suggested_event_id: suggestion?.eventId || '',
        suggestion_confidence: suggestion?.confidence || '',
        suggestion_reason: suggestion?.reason || '',
        assigned_event_id: '',
        review_notes: '',
        candidates: candidates.map(candidate => ({
          id: candidate.id,
          name: candidate.name,
          event_date: candidate.event_date,
          event_time: candidate.event_time,
          service_slug: candidate.service_slug,
          service_type_name: candidate.service_type_name,
        })),
        suggestion,
      }
    })
    .filter(record => !fromDate || record.date >= fromDate)
    .filter(record => !toDate || record.date <= toDate)
    .sort((a, b) =>
      a.date.localeCompare(b.date) ||
      a.table.localeCompare(b.table) ||
      a.created_or_submitted_at.localeCompare(b.created_or_submitted_at)
    )

  const { csvPath, jsonPath } = outputPaths(outArg)
  mkdirSync(dirname(csvPath), { recursive: true })
  mkdirSync(dirname(jsonPath), { recursive: true })

  writeCsv(csvPath, records)
  writeFileSync(jsonPath, `${JSON.stringify({
    generated_at: new Date().toISOString(),
    timezone: CHURCH_TZ,
    filter: { fromDate, toDate, table: tableFilter },
    instructions: {
      review: 'Fill assigned_event_id only when Alan has verified the row belongs to that event.',
      applyDryRun: `node scripts/review-session-assignments.js --reviewed ${csvPath} --dry-run`,
      applyWrite: `node scripts/review-session-assignments.js --reviewed ${csvPath} --apply`,
      deleteReviewedUnassignedDryRun: `node scripts/review-session-assignments.js --reviewed ${csvPath} --delete-unassigned --dry-run`,
      deleteReviewedUnassignedApply: `node scripts/review-session-assignments.js --reviewed ${csvPath} --delete-unassigned --apply`,
    },
    records,
  }, null, 2)}\n`)

  const suggested = records.filter(record => record.suggested_event_id).length
  console.log('BFC Sunday Ops - Session Assignment Review Export')
  console.log('==================================================')
  console.log(`Rows exported: ${records.length}`)
  console.log(`High-confidence suggestions: ${suggested}`)
  console.log(`CSV:  ${csvPath}`)
  console.log(`JSON: ${jsonPath}`)
  console.log('\nReview the artifact, copy a suggested_event_id into assigned_event_id only when it is correct, then run apply mode.')
}

async function applyReviewedCsv({ reviewedPath, apply, deleteUnassigned }) {
  if (!existsSync(reviewedPath)) throw new Error(`Reviewed CSV not found: ${reviewedPath}`)

  const rows = parseCsv(readFileSync(reviewedPath, 'utf8'), {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    trim: true,
  })

  const assignments = rows
    .map((row, index) => ({
      index: index + 2,
      table: row.table,
      rowId: row.row_id,
      date: row.date,
      eventId: row.assigned_event_id,
    }))
    .filter(row => row.eventId)

  const deleteCandidates = deleteUnassigned
    ? rows
      .map((row, index) => ({
        index: index + 2,
        table: row.table,
        rowId: row.row_id,
        date: row.date,
      }))
      .filter(row => {
        const source = rows[row.index - 2]
        return !source.assigned_event_id
      })
    : []

  console.log('BFC Sunday Ops - Session Assignment Apply')
  console.log('==========================================')
  console.log(`Reviewed CSV: ${reviewedPath}`)
  console.log(`Mode: ${apply ? 'WRITE' : 'DRY RUN'}`)
  console.log(`Assignments requested: ${assignments.length}\n`)
  if (deleteUnassigned) {
    console.log(`Delete reviewed unassigned rows: ${deleteCandidates.length}\n`)
  }

  if (assignments.length === 0 && deleteCandidates.length === 0) {
    console.log('No assigned_event_id values or delete candidates found. Nothing to do.')
    return
  }

  const badRows = assignments.filter(row =>
    !['issues', 'evaluations'].includes(row.table) ||
    !UUID_RE.test(row.rowId || '') ||
    !UUID_RE.test(row.eventId || '')
  )
  if (badRows.length > 0) {
    badRows.forEach(row => console.error(`Invalid row ${row.index}: table/row_id/assigned_event_id is not valid.`))
    throw new Error('Reviewed CSV has invalid assignment rows.')
  }

  const badDeleteRows = deleteCandidates.filter(row =>
    !['issues', 'evaluations'].includes(row.table) ||
    !UUID_RE.test(row.rowId || '')
  )
  if (badDeleteRows.length > 0) {
    badDeleteRows.forEach(row => console.error(`Invalid row ${row.index}: table/row_id is not valid for deletion.`))
    throw new Error('Reviewed CSV has invalid delete rows.')
  }

  const eventIds = [...new Set(assignments.map(row => row.eventId))]
  const events = await fetchInBatches('events', 'id,name,event_date,event_time', 'id', eventIds)
  const eventById = new Map(events.map(event => [event.id, event]))

  let applied = 0
  let deleted = 0
  let skipped = 0

  for (const assignment of assignments) {
    const event = eventById.get(assignment.eventId)
    if (!event) {
      console.error(`  row ${assignment.index}: event ${assignment.eventId} was not found - skipping.`)
      skipped += 1
      continue
    }

    if (assignment.date && event.event_date !== assignment.date) {
      console.error(
        `  row ${assignment.index}: event date ${event.event_date} does not match row date ${assignment.date} - skipping.`
      )
      skipped += 1
      continue
    }

    const label = `${assignment.table} ${assignment.rowId} -> ${event.event_time?.slice(0, 5) || 'time unknown'} ${event.name} (${event.id})`
    if (!apply) {
      console.log(`  [dry-run] would assign ${label}`)
      applied += 1
      continue
    }

    const { data, error } = await supabase
      .from(assignment.table)
      .update({ event_id: assignment.eventId })
      .eq('id', assignment.rowId)
      .is('event_id', null)
      .select('id')
      .maybeSingle()

    if (error) {
      console.error(`  ERROR ${label}: ${error.message}`)
      skipped += 1
    } else if (!data) {
      console.error(`  skipped ${label}: row not found or already assigned.`)
      skipped += 1
    } else {
      console.log(`  assigned ${label}`)
      applied += 1
    }
  }

  for (const candidate of deleteCandidates) {
    const label = `${candidate.table} ${candidate.rowId}${candidate.date ? ` (${candidate.date})` : ''}`

    if (!apply) {
      console.log(`  [dry-run] would delete reviewed unassigned ${label}`)
      deleted += 1
      continue
    }

    const { count, error } = await supabase
      .from(candidate.table)
      .delete({ count: 'exact' })
      .eq('id', candidate.rowId)
      .is('event_id', null)
      .not('sunday_id', 'is', null)

    if (error) {
      console.error(`  ERROR deleting ${label}: ${error.message}`)
      skipped += 1
    } else if (!count) {
      console.error(`  skipped ${label}: row not found, already assigned, or not Sunday-level.`)
      skipped += 1
    } else {
      console.log(`  deleted reviewed unassigned ${label}`)
      deleted += 1
    }
  }

  console.log(`\nDone. ${apply ? 'Applied' : 'Previewed'} assignments: ${applied}. Deleted: ${deleted}. Skipped: ${skipped}.`)
}

loadLocalEnv()
const { flags, values } = parseArgs(process.argv.slice(2))
const reviewedPath = values.reviewed
const apply = flags.has('apply')
const dryRun = flags.has('dry-run') || !apply
const deleteUnassigned = flags.has('delete-unassigned')
const useAnonKey = flags.has('use-anon-key')
const fromDate = validateDate('from', values.from)
const toDate = validateDate('to', values.to)
const tableFilter = values.table || 'all'

if (!['all', 'issues', 'evaluations'].includes(tableFilter)) {
  console.error('Error: --table must be all, issues, or evaluations.')
  process.exit(1)
}

if (reviewedPath && apply && flags.has('dry-run')) {
  console.error('Error: use either --apply or --dry-run, not both.')
  process.exit(1)
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = useAnonKey
  ? process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  : process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Error: SUPABASE_URL and a Supabase key are required.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

try {
  if (reviewedPath) {
    await applyReviewedCsv({ reviewedPath, apply: !dryRun ? apply : false, deleteUnassigned })
  } else {
    await exportReview({ fromDate, toDate, tableFilter, outArg: values.out })
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
}
