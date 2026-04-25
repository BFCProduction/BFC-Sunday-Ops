#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js'
import { createSign } from 'crypto'
import { existsSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function unwrapQuotedEnvValue(value = '') {
  const trimmed = String(value).trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function loadLocalEnv() {
  const envPath = join(__dirname, '..', '.env.local')
  if (!existsSync(envPath)) return

  readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return
    const [key, ...rest] = line.split('=')
    if (!key || rest.length === 0) return
    process.env[key.trim()] = unwrapQuotedEnvValue(rest.join('='))
  })
}

function parseArgs(argv) {
  const flags = new Set()
  const values = {}

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg.startsWith('--')) continue

    const raw = arg.slice(2)
    const equalsIndex = raw.indexOf('=')
    if (equalsIndex !== -1) {
      values[raw.slice(0, equalsIndex)] = raw.slice(equalsIndex + 1)
      continue
    }

    const next = argv[index + 1]
    if (next && !next.startsWith('--')) {
      values[raw] = next
      index += 1
    } else {
      flags.add(raw)
    }
  }

  return { flags, values }
}

loadLocalEnv()

const { flags, values } = parseArgs(process.argv.slice(2))
if (!flags.has('allow-retired-summary-email')) {
  console.error('Sunday summary email is retired from Sunday Ops.')
  console.error('This script is retained only for historical reference. To run it anyway, pass --allow-retired-summary-email.')
  process.exit(1)
}

const runNow = flags.has('now')
const forceSend = flags.has('force')
const dryRun = flags.has('dry-run')
const includeEmpty = flags.has('include-empty')
const targetDateOverride = values.date
const targetEventId = values['event-id']
const testRecipientEmails = values.to
  ? values.to.split(',').map(email => email.trim()).filter(Boolean)
  : []

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL
const GOOGLE_PRIVATE_KEY = unwrapQuotedEnvValue(
  process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '',
).replace(/\\n/g, '\n')
const GMAIL_DELEGATED_USER = process.env.GMAIL_DELEGATED_USER || 'jerry@bethanynaz.org'
const REPORT_EMAIL_FROM_NAME = process.env.REPORT_EMAIL_FROM_NAME || 'BFC Sunday Ops'
const REPORT_EMAIL_FROM_ADDRESS = process.env.REPORT_EMAIL_FROM_ADDRESS || GMAIL_DELEGATED_USER
const REPORT_EMAIL_REPLY_TO = process.env.REPORT_EMAIL_REPLY_TO || 'production@bethanynaz.org'

const CHURCH_TIME_ZONE = 'America/Chicago'
const DEFAULT_SETTINGS = {
  key: 'default',
  enabled: true,
  send_day: 0,
  send_time: '15:00',
  timezone: CHURCH_TIME_ZONE,
  sender_name: 'BFC Sunday Ops',
  reply_to_email: REPORT_EMAIL_REPLY_TO,
}
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const SEVERITY_ORDER = { Critical: 0, High: 1, Medium: 2, Low: 3 }
const FEEL_ORDER = ['excellent', 'solid', 'rough_spots', 'significant_issues']
const FEEL_LABELS = {
  excellent: 'Excellent',
  solid: 'Solid',
  rough_spots: 'Had some rough spots',
  significant_issues: 'Significant issues',
}

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_KEY are required')
  process.exit(1)
}

if (!dryRun && (!GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY)) {
  console.error('Error: GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY are required')
  process.exit(1)
}

if (targetDateOverride && !/^\d{4}-\d{2}-\d{2}$/.test(targetDateOverride)) {
  console.error('Error: --date must use YYYY-MM-DD')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

function getZonedParts(date = new Date(), timeZone = CHURCH_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const year = Number(parts.find(part => part.type === 'year')?.value)
  const month = Number(parts.find(part => part.type === 'month')?.value)
  const day = Number(parts.find(part => part.type === 'day')?.value)
  const weekday = parts.find(part => part.type === 'weekday')?.value || ''
  const hour = Number(parts.find(part => part.type === 'hour')?.value)
  const minute = Number(parts.find(part => part.type === 'minute')?.value)

  if (!year || !month || !day || !weekday || Number.isNaN(hour) || Number.isNaN(minute)) {
    throw new Error('Unable to compute zoned date parts')
  }

  return {
    year,
    month,
    day,
    hour,
    minute,
    weekday,
    weekdayIndex: DAY_NAMES.indexOf(weekday),
  }
}

function getDateString(date = new Date(), timeZone = CHURCH_TIME_ZONE) {
  const { year, month, day } = getZonedParts(date, timeZone)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function addDaysToDateString(dateString, daysToAdd) {
  const [year, month, day] = dateString.split('-').map(Number)
  const base = new Date(Date.UTC(year, month - 1, day))
  base.setUTCDate(base.getUTCDate() + daysToAdd)
  return base.toISOString().slice(0, 10)
}

function getMostRecentSundayDateString(date = new Date(), timeZone = CHURCH_TIME_ZONE) {
  const parts = getZonedParts(date, timeZone)
  return addDaysToDateString(getDateString(date, timeZone), -parts.weekdayIndex)
}

function parseTimeToMinutes(timeString) {
  const [hours, minutes] = String(timeString).split(':').map(Number)
  return (hours * 60) + minutes
}

function formatDateLabel(dateString, timeZone = CHURCH_TIME_ZONE) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${dateString}T12:00:00Z`))
}

function formatShortDateLabel(dateString, timeZone = CHURCH_TIME_ZONE) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${dateString}T12:00:00Z`))
}

function formatClock(timestamp, timeZone = CHURCH_TIME_ZONE) {
  if (!timestamp) return '-'
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

function formatEventTime(timeString) {
  if (!timeString) return null
  const [rawHours, rawMinutes] = String(timeString).split(':').map(Number)
  if (Number.isNaN(rawHours) || Number.isNaN(rawMinutes)) return null
  const suffix = rawHours >= 12 ? 'PM' : 'AM'
  const hours = rawHours % 12 || 12
  return `${hours}:${String(rawMinutes).padStart(2, '0')} ${suffix}`
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function encodeHeader(value) {
  return String(value).replaceAll('\n', ' ').replaceAll('\r', ' ').trim()
}

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

function nonEmpty(value) {
  return value != null && String(value).trim() !== ''
}

function describeError(error) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object') {
    const parts = [
      error.message,
      error.details,
      error.hint,
      error.code,
    ].filter(nonEmpty)
    if (parts.length > 0) return parts.join(' | ')
    try {
      return JSON.stringify(error)
    } catch {
      return String(error)
    }
  }
  return String(error)
}

function sortIssues(issues) {
  return [...issues].sort((a, b) => {
    const severityDelta = (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99)
    return severityDelta !== 0
      ? severityDelta
      : new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
  })
}

function dedupeById(rows) {
  const seen = new Set()
  const output = []
  for (const row of rows) {
    if (!row?.id || seen.has(row.id)) continue
    seen.add(row.id)
    output.push(row)
  }
  return output
}

function serviceSortValue(event) {
  const slugOrder = { 'sunday-9am': 0, 'sunday-11am': 1, special: 2 }
  const timeValue = event.eventTime ? parseTimeToMinutes(event.eventTime) : 9999
  return (timeValue * 10) + (slugOrder[event.serviceTypeSlug] ?? 9)
}

function normalizeEventRow(row) {
  const serviceType = Array.isArray(row.service_types)
    ? row.service_types[0]
    : row.service_types

  return {
    id: row.id,
    name: row.name,
    eventDate: row.event_date,
    eventTime: row.event_time,
    legacySundayId: row.legacy_sunday_id || null,
    legacySpecialEventId: row.legacy_special_event_id || null,
    pcoPlanId: row.pco_plan_id || null,
    serviceTypeSlug: serviceType?.slug || 'special',
    serviceTypeName: serviceType?.name || 'Special Event',
    serviceTypeSortOrder: serviceType?.sort_order ?? 99,
  }
}

function eventDisplayName(event) {
  const time = formatEventTime(event.eventTime)
  return time ? `${event.name} (${time})` : event.name
}

function normalizeAttendance(row, source, event) {
  if (!row) return null
  const count = source === 'legacy_sunday'
    ? event.serviceTypeSlug === 'sunday-11am'
      ? row.service_2_count
      : row.service_1_count
    : row.service_1_count ?? row.service_2_count ?? null

  return {
    count: count ?? null,
    notes: row.notes || null,
  }
}

function normalizeLoudness(row, source, event) {
  if (!row) return null
  const useSecondService = source === 'legacy_sunday' && event.serviceTypeSlug === 'sunday-11am'
  return {
    maxA: useSecondService ? row.service_2_max_db : row.service_1_max_db,
    laeq: useSecondService ? row.service_2_laeq : row.service_1_laeq,
    maxC: useSecondService ? row.service_2_max_db_c : row.service_1_max_db_c,
    lceq: useSecondService ? row.service_2_lceq : row.service_1_lceq,
  }
}

function summarizeEvaluations(evaluations) {
  if (!evaluations.length) return 'No post-service evaluation was submitted.'

  const counts = {}
  evaluations.forEach(evaluation => {
    if (evaluation.service_feel) {
      counts[evaluation.service_feel] = (counts[evaluation.service_feel] || 0) + 1
    }
  })

  const countText = FEEL_ORDER
    .filter(feel => counts[feel])
    .map(feel => `${FEEL_LABELS[feel]} x${counts[feel]}`)
    .join(', ')

  return countText
    ? `${pluralize(evaluations.length, 'response')}: ${countText}.`
    : pluralize(evaluations.length, 'response')
}

function buildChecklistGroups(items, completions) {
  const completedIds = new Set((completions || []).map(entry => String(entry.item_id)))
  return items.filter(item => !completedIds.has(String(item.id)))
}

function hasAttendance(attendance) {
  return !!attendance && (attendance.count != null || nonEmpty(attendance.notes))
}

function hasLoudness(loudness) {
  return !!loudness && [loudness.maxA, loudness.laeq, loudness.maxC, loudness.lceq].some(value => value != null)
}

function hasReportableActivity(data) {
  return (
    data.completions.length > 0 ||
    data.issues.length > 0 ||
    hasAttendance(data.attendance) ||
    data.runtimeRows.some(row => nonEmpty(row.value)) ||
    hasLoudness(data.loudness) ||
    data.evaluations.length > 0
  )
}

async function loadEventsForRun(targetDate) {
  let query = supabase
    .from('events')
    .select(`
      id, name, event_date, event_time, legacy_sunday_id, legacy_special_event_id, pco_plan_id,
      service_types ( slug, name, sort_order )
    `)

  query = targetEventId
    ? query.eq('id', targetEventId)
    : query.eq('event_date', targetDate)

  const { data, error } = await query
  if (error) throw error

  return (data || [])
    .map(normalizeEventRow)
    .sort((a, b) => serviceSortValue(a) - serviceSortValue(b))
}

async function loadScopedSingle(table, event, select = '*') {
  const scopes = [
    { source: 'event', column: 'event_id', value: event.id },
  ]

  if (event.legacySpecialEventId) {
    scopes.push({ source: 'legacy_special', column: 'event_id', value: event.legacySpecialEventId })
  }

  if (event.legacySundayId) {
    scopes.push({ source: 'legacy_sunday', column: 'sunday_id', value: event.legacySundayId })
  }

  for (const scope of scopes) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .eq(scope.column, scope.value)
      .maybeSingle()

    if (error) throw error
    if (data) return { data, source: scope.source }
  }

  return { data: null, source: null }
}

async function loadChecklistData(event) {
  if (event.serviceTypeSlug === 'special') {
    const [{ data: items, error: itemsError }, { data: completions, error: completionsError }] = await Promise.all([
      supabase
        .from('event_checklist_items')
        .select('*')
        .eq('event_id', event.id)
        .order('sort_order', { ascending: true }),
      supabase
        .from('event_checklist_completions')
        .select('item_id, initials, completed_at')
        .eq('event_id', event.id),
    ])

    if (itemsError) throw itemsError
    if (completionsError) throw completionsError

    return {
      items: (items || []).map(item => ({
        id: item.id,
        task: item.label,
        role: 'All',
        section: item.section,
        subsection: item.subsection,
        note: item.item_notes,
        sort_order: item.sort_order,
      })),
      completions: completions || [],
    }
  }

  const [{ data: rawItems, error: itemsError }, { data: eventCompletions, error: eventCompletionsError }] = await Promise.all([
    supabase
      .from('checklist_items')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true }),
    supabase
      .from('checklist_completions')
      .select('item_id, initials, completed_at')
      .eq('event_id', event.id),
  ])

  if (itemsError) throw itemsError
  if (eventCompletionsError) throw eventCompletionsError

  let completions = eventCompletions || []
  if (completions.length === 0 && event.legacySundayId) {
    const { data, error } = await supabase
      .from('checklist_completions')
      .select('item_id, initials, completed_at')
      .eq('sunday_id', event.legacySundayId)
    if (error) throw error
    completions = data || []
  }

  const items = (rawItems || [])
    .filter(item => item.service_type_slug == null || item.service_type_slug === event.serviceTypeSlug)
    .map(item => ({
      id: item.id,
      task: item.task,
      role: item.role,
      section: item.section,
      subsection: item.subsection,
      note: item.note,
      sort_order: item.sort_order,
    }))

  return { items, completions }
}

async function loadIssues(event) {
  const queries = [
    supabase.from('issues').select('*').eq('event_id', event.id),
  ]

  if (event.legacySpecialEventId) {
    queries.push(supabase.from('issues').select('*').eq('event_id', event.legacySpecialEventId))
  }

  if (event.legacySundayId) {
    queries.push(supabase.from('issues').select('*').eq('sunday_id', event.legacySundayId))
  }

  const results = await Promise.all(queries)
  results.forEach(result => {
    if (result.error) throw result.error
  })

  return sortIssues(dedupeById(results.flatMap(result => result.data || [])))
}

async function loadEvaluations(event) {
  const { data: eventRows, error: eventError } = await supabase
    .from('evaluations')
    .select('*')
    .eq('event_id', event.id)
    .order('submitted_at', { ascending: true })

  if (eventError) throw eventError
  if (eventRows && eventRows.length > 0) return eventRows

  if (!event.legacySundayId) return []

  const { data, error } = await supabase
    .from('evaluations')
    .select('*')
    .eq('sunday_id', event.legacySundayId)
    .order('submitted_at', { ascending: true })

  if (error) throw error
  return data || []
}

async function loadRuntimeData(event) {
  const [{ data: fields, error: fieldsError }, { data: eventValues, error: eventValuesError }] = await Promise.all([
    supabase
      .from('runtime_fields')
      .select('*')
      .or(`service_type_slug.is.null,service_type_slug.eq.${event.serviceTypeSlug}`)
      .order('sort_order', { ascending: true })
      .order('pull_time', { ascending: true }),
    supabase
      .from('runtime_values')
      .select('*')
      .eq('event_id', event.id),
  ])

  if (fieldsError) throw fieldsError
  if (eventValuesError) throw eventValuesError

  let runtimeValues = eventValues || []
  if (runtimeValues.length === 0 && event.legacySundayId) {
    const { data, error } = await supabase
      .from('runtime_values')
      .select('*')
      .eq('sunday_id', event.legacySundayId)
    if (error) throw error
    runtimeValues = data || []
  }

  const runtimeValueByField = new Map(runtimeValues.map(entry => [entry.field_id, entry]))
  return {
    fields: fields || [],
    values: runtimeValues,
    rows: (fields || []).map(field => ({
      label: field.label,
      value: runtimeValueByField.get(field.id)?.value || null,
      captured_at: runtimeValueByField.get(field.id)?.captured_at || null,
    })),
  }
}

async function loadStreamAnalytics(event) {
  if (!event.legacySundayId) return null
  const { data, error } = await supabase
    .from('stream_analytics')
    .select('*')
    .eq('sunday_id', event.legacySundayId)
    .maybeSingle()

  if (error) throw error
  return data || null
}

async function loadSummaryData(event) {
  const [
    checklist,
    issues,
    attendanceResult,
    runtimes,
    loudnessResult,
    weatherResult,
    evaluations,
    analytics,
  ] = await Promise.all([
    loadChecklistData(event),
    loadIssues(event),
    loadScopedSingle('attendance', event),
    loadRuntimeData(event),
    loadScopedSingle('loudness', event),
    loadScopedSingle('weather', event),
    loadEvaluations(event),
    loadStreamAnalytics(event),
  ])

  const uncheckedItems = buildChecklistGroups(checklist.items, checklist.completions)

  return {
    event,
    checklistItems: checklist.items,
    completions: checklist.completions,
    uncheckedItems,
    checklistDone: checklist.items.length - uncheckedItems.length,
    checklistTotal: checklist.items.length,
    issues,
    attendance: normalizeAttendance(attendanceResult.data, attendanceResult.source, event),
    runtimeRows: runtimes.rows,
    runtimeValues: runtimes.values,
    loudness: normalizeLoudness(loudnessResult.data, loudnessResult.source, event),
    weather: weatherResult.data || null,
    evaluations,
    analytics,
  }
}

function buildTextBody(data, settings) {
  const {
    event,
    uncheckedItems,
    issues,
    attendance,
    runtimeRows,
    loudness,
    weather,
    analytics,
    evaluations,
  } = data

  const eventTime = formatEventTime(event.eventTime)
  const lines = [
    'BFC Sunday Ops Summary',
    eventDisplayName(event),
    formatDateLabel(event.eventDate, settings.timezone),
    eventTime ? `Scheduled time: ${eventTime}` : null,
    '',
    'TOPLINE',
    `- Checklist: ${data.checklistDone}/${data.checklistTotal} complete`,
    `- Issues logged: ${issues.length}`,
    `- Attendance: ${attendance?.count ?? 'No attendance submitted'}`,
    `- Evaluation: ${summarizeEvaluations(evaluations)}`,
    '',
    'UNCHECKED ITEMS',
  ].filter(line => line !== null)

  if (uncheckedItems.length === 0) {
    lines.push('- All checklist items were completed.')
  } else {
    uncheckedItems.forEach(item => {
      lines.push(`- [${item.role}] ${item.section}${item.subsection ? ` / ${item.subsection}` : ''}: ${item.task}`)
    })
  }

  lines.push('', 'ISSUES')
  if (issues.length === 0) {
    lines.push('- No issues logged.')
  } else {
    issues.forEach(issue => {
      lines.push(`- [${issue.severity}] ${issue.title || issue.description}`)
      if (issue.description && issue.description !== issue.title) lines.push(`  ${issue.description}`)
      if (issue.resolved_at) lines.push(`  Resolved at ${formatClock(issue.resolved_at, settings.timezone)}`)
    })
  }

  lines.push('', 'SERVICE DATA')
  if (attendance) {
    lines.push(`- Attendance: ${attendance.count ?? '-'}`)
    if (attendance.notes) lines.push(`  Notes: ${attendance.notes}`)
  } else {
    lines.push('- Attendance: not submitted')
  }

  if (runtimeRows.length > 0) {
    lines.push('- Runtimes:')
    runtimeRows.forEach(row => lines.push(`  ${row.label}: ${row.value || '-'}`))
  } else {
    lines.push('- Runtimes: no runtime fields configured')
  }

  if (loudness) {
    lines.push(`- Loudness: LAeq ${loudness.laeq ?? '-'} | Max A ${loudness.maxA ?? '-'} | LCeq ${loudness.lceq ?? '-'} | Max C ${loudness.maxC ?? '-'}`)
  } else {
    lines.push('- Loudness: not submitted')
  }

  if (weather) {
    lines.push(`- Weather: ${weather.temp_f ?? '-'}F, ${weather.condition || 'Condition unavailable'}, wind ${weather.wind_mph ?? '-'} mph, humidity ${weather.humidity ?? '-'}%`)
  } else {
    lines.push('- Weather: not imported')
  }

  if (analytics) {
    lines.push(`- Sunday-level stream analytics: YouTube peak ${analytics.youtube_peak ?? '-'}, RESI peak ${analytics.resi_peak ?? '-'}, Church Online peak ${analytics.church_online_peak ?? '-'}`)
  } else {
    lines.push('- Stream analytics: not imported')
  }

  lines.push('', 'POST-SERVICE EVALUATION')
  if (evaluations.length === 0) {
    lines.push('- No evaluation submitted.')
  } else {
    evaluations.forEach((evaluation, index) => {
      lines.push(`- Response ${index + 1}${evaluation.service_feel ? `: ${FEEL_LABELS[evaluation.service_feel] || evaluation.service_feel}` : ''}`)
      if (evaluation.broken_moment) lines.push(`  Broken moment: ${evaluation.broken_moment_detail || 'Yes'}`)
      if (evaluation.went_well) lines.push(`  Went well: ${evaluation.went_well}`)
      if (evaluation.needed_attention) lines.push(`  Needed attention: ${evaluation.needed_attention}`)
      if (evaluation.area_notes) lines.push(`  Area notes: ${evaluation.area_notes}`)
    })
  }

  return lines.join('\n')
}

function buildEvaluationMarkup(evaluations, settings) {
  if (evaluations.length === 0) {
    return '<div class="empty">No post-service evaluation was submitted.</div>'
  }

  const counts = {}
  evaluations.forEach(evaluation => {
    if (evaluation.service_feel) {
      counts[evaluation.service_feel] = (counts[evaluation.service_feel] || 0) + 1
    }
  })

  const tally = FEEL_ORDER
    .filter(feel => counts[feel])
    .map(feel => `<span class="badge neutral">${escapeHtml(FEEL_LABELS[feel])} x${counts[feel]}</span>`)
    .join('')

  const cards = evaluations.map((evaluation, index) => {
    const notes = [
      ['What Went Well', evaluation.went_well],
      ['Needs Attention', evaluation.needed_attention],
      ['Area Notes', evaluation.area_notes],
    ].filter(([, value]) => nonEmpty(value))

    return `
      <div class="row-card">
        <div class="row-top">
          <strong>Response ${index + 1}</strong>
          <span class="tiny">${escapeHtml(formatClock(evaluation.submitted_at, settings.timezone))}</span>
        </div>
        ${evaluation.service_feel ? `<div class="mb-sm"><span class="badge neutral">${escapeHtml(FEEL_LABELS[evaluation.service_feel] || evaluation.service_feel)}</span></div>` : ''}
        ${evaluation.broken_moment ? `
          <div class="note alert">
            <div class="note-title">Experience Break</div>
            <div>${escapeHtml(evaluation.broken_moment_detail || 'A moment broke the experience.')}</div>
          </div>
        ` : '<div class="muted good-line">No broken moment reported.</div>'}
        ${notes.map(([label, value]) => `
          <div class="note">
            <div class="note-title">${escapeHtml(label)}</div>
            <div>${escapeHtml(value)}</div>
          </div>
        `).join('')}
      </div>
    `
  }).join('')

  return `
    <div class="evaluation-tally">${tally || '<span class="muted">No service-feel selections submitted.</span>'}</div>
    ${cards}
  `
}

function buildHtmlBody(data, settings) {
  const {
    event,
    uncheckedItems,
    issues,
    attendance,
    runtimeRows,
    loudness,
    weather,
    analytics,
    evaluations,
  } = data

  const issueCards = issues.length === 0
    ? '<div class="empty">No issues logged.</div>'
    : issues.map(issue => `
      <div class="row-card">
        <div class="row-top">
          <strong>${escapeHtml(issue.title || issue.description)}</strong>
          <span class="badge ${String(issue.severity).toLowerCase()}">${escapeHtml(issue.severity)}</span>
        </div>
        ${issue.description && issue.description !== issue.title ? `<div class="muted">${escapeHtml(issue.description)}</div>` : ''}
        <div class="tiny">${issue.resolved_at ? `Resolved at ${escapeHtml(formatClock(issue.resolved_at, settings.timezone))}` : issue.pushed_to_monday ? 'Flagged for follow-up' : 'Logged only'} - ${escapeHtml(formatClock(issue.created_at, settings.timezone))}</div>
      </div>
    `).join('')

  const uncheckedCards = uncheckedItems.length === 0
    ? '<div class="empty">All checklist items were completed.</div>'
    : uncheckedItems.map(item => `
      <div class="row-card">
        <div class="row-top">
          <strong>${escapeHtml(item.task)}</strong>
          <span class="badge neutral">${escapeHtml(item.role)}</span>
        </div>
        <div class="muted">${escapeHtml(item.section)}${item.subsection ? ` / ${escapeHtml(item.subsection)}` : ''}</div>
      </div>
    `).join('')

  const runtimeMarkup = runtimeRows.length === 0
    ? '<div class="empty">No runtime fields configured.</div>'
    : runtimeRows.map(row => `
      <div class="metric-row">
        <span>${escapeHtml(row.label)}</span>
        <strong class="mono">${escapeHtml(row.value || '-')}</strong>
      </div>
    `).join('')

  const eventTime = formatEventTime(event.eventTime)
  const dateLabel = formatDateLabel(event.eventDate, settings.timezone)

  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:Inter,'Segoe UI',sans-serif;color:#111827;">
    <div style="padding:24px 12px;">
      <div style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:18px;overflow:hidden;box-shadow:0 20px 44px rgba(17,24,39,0.08);">
        <div style="padding:28px;background:#111827;color:#ffffff;">
          <div style="display:inline-block;padding:7px 12px;border-radius:8px;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.18);font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;">BFC Production Team</div>
          <h1 style="margin:16px 0 10px;font-size:32px;line-height:1.08;">Sunday Ops Summary</h1>
          <p style="margin:0;color:rgba(255,255,255,0.82);font-size:15px;line-height:1.55;">${escapeHtml(eventDisplayName(event))} - ${escapeHtml(dateLabel)}${eventTime ? ` - ${escapeHtml(eventTime)}` : ''}</p>
        </div>

        <div style="padding:24px;">
          <div class="stats">
            <div class="stat-card">
              <div class="tiny">Checklist</div>
              <div class="stat-value blue">${escapeHtml(`${data.checklistDone}/${data.checklistTotal}`)}</div>
              <div class="muted">Items completed</div>
            </div>
            <div class="stat-card">
              <div class="tiny">Issues</div>
              <div class="stat-value red">${escapeHtml(String(issues.length))}</div>
              <div class="muted">Logged for this service</div>
            </div>
            <div class="stat-card">
              <div class="tiny">Attendance</div>
              <div class="stat-value gold">${escapeHtml(attendance?.count ?? '-')}</div>
              <div class="muted">In-person count</div>
            </div>
            <div class="stat-card">
              <div class="tiny">Evaluation</div>
              <div class="stat-value green">${escapeHtml(String(evaluations.length))}</div>
              <div class="muted">${escapeHtml(pluralize(evaluations.length, 'response'))}</div>
            </div>
          </div>

          <div class="section">
            <div class="section-head">
              <h2>Exceptions First</h2>
              <span class="pill">Actionable Summary</span>
            </div>
            <div class="two-up">
              <div class="callout red">
                <h3>Unchecked Items</h3>
                <p class="sub">${uncheckedItems.length === 0 ? 'No checklist exceptions remained at close-out.' : `${pluralize(uncheckedItems.length, 'item')} still open.`}</p>
                ${uncheckedCards}
              </div>
              <div class="callout amber">
                <h3>Issues Logged</h3>
                <p class="sub">${issues.length === 0 ? 'No problems were logged for this service.' : `${issues.filter(issue => issue.severity === 'High' || issue.severity === 'Critical').length} high-priority issue(s) need attention.`}</p>
                ${issueCards}
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-head">
              <h2>Service Data</h2>
              <span class="pill">${escapeHtml(event.serviceTypeName)}</span>
            </div>
            <div class="data-grid">
              <div class="data-card">
                <h3>Attendance</h3>
                <div class="metric-row"><span>In-person</span><strong>${escapeHtml(attendance?.count ?? '-')}</strong></div>
                <div class="metric-row"><span>Notes</span><strong>${escapeHtml(attendance?.notes || '-')}</strong></div>
              </div>
              <div class="data-card">
                <h3>Runtimes</h3>
                ${runtimeMarkup}
              </div>
              <div class="data-card">
                <h3>Loudness</h3>
                <div class="metric-row"><span>LAeq 15</span><strong>${escapeHtml(loudness?.laeq ?? '-')}</strong></div>
                <div class="metric-row"><span>Max dB A</span><strong>${escapeHtml(loudness?.maxA ?? '-')}</strong></div>
                <div class="metric-row"><span>LCeq 15</span><strong>${escapeHtml(loudness?.lceq ?? '-')}</strong></div>
                <div class="metric-row"><span>Max dB C</span><strong>${escapeHtml(loudness?.maxC ?? '-')}</strong></div>
              </div>
              <div class="data-card">
                <h3>Weather + Stream</h3>
                <div class="metric-row"><span>Weather</span><strong>${escapeHtml(weather ? `${weather.temp_f ?? '-'}F, ${weather.condition || '-'}` : 'Not imported')}</strong></div>
                <div class="metric-row"><span>Wind / Humidity</span><strong>${escapeHtml(weather ? `${weather.wind_mph ?? '-'} mph / ${weather.humidity ?? '-'}%` : '-')}</strong></div>
                <div class="metric-row"><span>YouTube Peak</span><strong>${escapeHtml(analytics?.youtube_peak ?? '-')}</strong></div>
                <div class="metric-row"><span>RESI Peak</span><strong>${escapeHtml(analytics?.resi_peak ?? '-')}</strong></div>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-head">
              <h2>Post-Service Evaluation</h2>
              <span class="pill">Team Reflection</span>
            </div>
            ${buildEvaluationMarkup(evaluations, settings)}
          </div>
        </div>

        <div style="padding:18px 24px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.55;">
          Sent automatically by BFC Sunday Ops at ${escapeHtml(formatClock(new Date().toISOString(), settings.timezone))}. Missing data is shown honestly so the team can see what still needs attention.
        </div>
      </div>
    </div>

    <style>
      .stats { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin-bottom:16px; }
      .stat-card, .data-card { border:1px solid #e5e7eb; border-radius:8px; padding:16px; background:#ffffff; }
      .stat-value { font-size:28px; line-height:1; font-weight:800; margin:8px 0 6px; }
      .stat-value.blue { color:#2563eb; }
      .stat-value.red { color:#dc2626; }
      .stat-value.gold { color:#d97706; }
      .stat-value.green { color:#10b981; }
      .tiny { color:#6b7280; font-size:10px; font-weight:800; letter-spacing:0.08em; text-transform:uppercase; }
      .muted { color:#6b7280; font-size:12px; line-height:1.45; }
      .good-line { color:#059669; font-weight:600; margin:8px 0; }
      .section { margin-top:16px; border:1px solid #e5e7eb; border-radius:8px; padding:20px; background:rgba(255,255,255,0.94); }
      .section-head { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:14px; }
      .section-head h2 { margin:0; font-size:22px; line-height:1.05; }
      .pill { display:inline-block; padding:8px 12px; border-radius:8px; background:#f9fafb; border:1px solid #e5e7eb; font-size:11px; font-weight:800; letter-spacing:0.06em; text-transform:uppercase; }
      .two-up, .data-grid { display:grid; gap:12px; }
      .two-up { grid-template-columns:1fr 1fr; }
      .data-grid { grid-template-columns:1fr 1fr; }
      .callout { border-radius:8px; padding:16px; }
      .callout.red { background:#fef2f2; border:1px solid #fecaca; }
      .callout.amber { background:#fffbeb; border:1px solid #fde68a; }
      .callout h3, .data-card h3 { margin:0 0 4px; font-size:15px; }
      .sub { margin:0 0 12px; color:#6b7280; font-size:12px; line-height:1.45; }
      .row-card { padding:12px 14px; border-radius:8px; background:rgba(255,255,255,0.82); border:1px solid #f3f4f6; margin-top:8px; }
      .row-top { display:flex; justify-content:space-between; gap:10px; align-items:center; margin-bottom:4px; }
      .badge { display:inline-block; padding:4px 8px; border-radius:8px; font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; }
      .badge.critical, .badge.high { background:#fee2e2; color:#b91c1c; }
      .badge.medium { background:#fef3c7; color:#92400e; }
      .badge.low, .badge.neutral { background:#eff6ff; color:#1d4ed8; }
      .metric-row { display:flex; justify-content:space-between; gap:12px; padding:8px 0; border-top:1px solid #f3f4f6; font-size:12px; }
      .metric-row:first-of-type { padding-top:0; border-top:0; }
      .mono { font-family:'SFMono-Regular','Menlo',monospace; }
      .note { border-radius:8px; padding:12px; border:1px solid #e5e7eb; margin-top:10px; font-size:13px; line-height:1.55; background:#ffffff; }
      .note.alert { background:#fef2f2; border-color:#fecaca; color:#991b1b; }
      .note-title { margin-bottom:8px; font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; color:#6b7280; }
      .empty { padding:12px 14px; border-radius:8px; background:#f9fafb; color:#6b7280; font-size:12px; }
      .evaluation-tally { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:10px; }
      .mb-sm { margin:8px 0; }
      @media (max-width: 680px) {
        .stats, .two-up, .data-grid { grid-template-columns:1fr !important; }
        .section-head, .row-top { display:block; }
        .pill, .badge { margin-top:8px; }
      }
    </style>
  </body>
</html>`
}

function toBase64Url(input) {
  return Buffer.from(input).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

async function getGoogleAccessToken() {
  const header = toBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const issuedAt = Math.floor(Date.now() / 1000)
  const payload = toBase64Url(JSON.stringify({
    iss: GOOGLE_CLIENT_EMAIL,
    sub: GMAIL_DELEGATED_USER,
    scope: 'https://www.googleapis.com/auth/gmail.send',
    aud: 'https://oauth2.googleapis.com/token',
    iat: issuedAt,
    exp: issuedAt + 3600,
  }))

  const signer = createSign('RSA-SHA256')
  signer.update(`${header}.${payload}`)
  signer.end()
  const signature = signer.sign(GOOGLE_PRIVATE_KEY, 'base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')

  const assertion = `${header}.${payload}.${signature}`

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Google token request failed with ${response.status}${body ? `: ${body}` : ''}`)
  }

  const payloadJson = await response.json()
  if (!payloadJson.access_token) {
    throw new Error('Google token response did not include an access token')
  }

  return payloadJson.access_token
}

async function sendGmailMessage({ recipients, subject, textBody, htmlBody, replyTo }) {
  const boundary = `bfc-${Date.now()}`
  const mime = [
    `From: ${encodeHeader(REPORT_EMAIL_FROM_NAME)} <${encodeHeader(REPORT_EMAIL_FROM_ADDRESS)}>`,
    `To: ${encodeHeader(REPORT_EMAIL_FROM_NAME)} <${encodeHeader(REPORT_EMAIL_FROM_ADDRESS)}>`,
    `Bcc: ${recipients.map(encodeHeader).join(', ')}`,
    `Reply-To: ${encodeHeader(replyTo || REPORT_EMAIL_REPLY_TO)}`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    textBody,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    htmlBody,
    '',
    `--${boundary}--`,
  ].join('\r\n')

  const accessToken = await getGoogleAccessToken()
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: toBase64Url(mime) }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Gmail send failed with ${response.status}${body ? `: ${body}` : ''}`)
  }

  return response.json()
}

async function loadExistingRun(eventId) {
  const { data, error } = await supabase
    .from('report_email_runs')
    .select('*')
    .eq('event_id', eventId)
    .maybeSingle()

  if (error) throw error
  return data || null
}

async function writeRun(event, payload) {
  const now = new Date().toISOString()
  const existing = await loadExistingRun(event.id)
  const row = {
    event_id: event.id,
    sunday_id: event.legacySundayId,
    ...payload,
    updated_at: now,
  }

  if (existing) {
    const { error } = await supabase
      .from('report_email_runs')
      .update(row)
      .eq('id', existing.id)
    if (error) throw error
    return
  }

  const { error } = await supabase
    .from('report_email_runs')
    .insert(row)
  if (error) throw error
}

async function run() {
  console.log('BFC Sunday Ops - Summary Email')
  console.log('================================')

  const { data: settingsRow, error: settingsError } = await supabase
    .from('report_email_settings')
    .select('*')
    .eq('key', 'default')
    .maybeSingle()

  if (settingsError) throw settingsError
  const settings = {
    ...DEFAULT_SETTINGS,
    ...(settingsRow || {}),
  }

  if (!settingsRow) {
    console.log('No summary email settings found. Using default Sunday 15:00 settings until the admin UI saves a row.')
  }

  if (!settings.enabled && !runNow) {
    console.log('Summary email is disabled.')
    process.exit(0)
  }

  const { data: recipients, error: recipientsError } = await supabase
    .from('report_email_recipients')
    .select('*')
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (recipientsError) throw recipientsError

  const recipientEmails = testRecipientEmails.length > 0
    ? testRecipientEmails
    : (recipients || []).map(recipient => recipient.email).filter(Boolean)

  if (recipientEmails.length === 0 && !dryRun) {
    console.log('No active summary email recipients configured.')
    process.exit(0)
  }

  const now = getZonedParts(new Date(), settings.timezone)
  const currentMinutes = (now.hour * 60) + now.minute
  const scheduledMinutes = parseTimeToMinutes(settings.send_time)

  if (!runNow && !targetDateOverride && !targetEventId) {
    if (now.weekdayIndex !== settings.send_day) {
      console.log(`Today is ${DAY_NAMES[now.weekdayIndex]}. Configured send day is ${DAY_NAMES[settings.send_day]}.`)
      process.exit(0)
    }

    if (currentMinutes < scheduledMinutes) {
      console.log(`Current church time is before configured send time ${settings.send_time}.`)
      process.exit(0)
    }
  }

  const targetDate = targetDateOverride || getMostRecentSundayDateString(new Date(), settings.timezone)
  console.log(targetEventId ? `Target event: ${targetEventId}` : `Target date: ${targetDate}`)

  const events = await loadEventsForRun(targetDate)
  if (events.length === 0) {
    console.log(targetEventId ? 'No matching event found.' : `No events found for ${targetDate}.`)
    process.exit(0)
  }

  let sentCount = 0
  let dryRunCount = 0
  let skippedCount = 0
  const failures = []
  const shouldRecordRuns = !dryRun && testRecipientEmails.length === 0

  if (testRecipientEmails.length > 0) {
    console.log(`Test recipient override enabled (${recipientEmails.length} recipient(s)); report_email_runs will not be updated.`)
  }

  for (const event of events) {
    const label = eventDisplayName(event)

    try {
      const existingRun = shouldRecordRuns ? await loadExistingRun(event.id) : null
      if (!forceSend && existingRun?.status === 'sent') {
        console.log(`Skipping ${label}: already sent at ${existingRun.sent_at}.`)
        skippedCount += 1
        continue
      }

      const summaryData = await loadSummaryData(event)
      if (!includeEmpty && !targetEventId && !hasReportableActivity(summaryData)) {
        console.log(`Skipping ${label}: no operational activity found.`)
        skippedCount += 1
        continue
      }

      const subject = `BFC Sunday Ops Summary - ${event.name} - ${formatShortDateLabel(event.eventDate, settings.timezone)}`
      const textBody = buildTextBody(summaryData, settings)
      const htmlBody = buildHtmlBody(summaryData, settings)

      if (dryRun) {
        console.log('')
        console.log(`DRY RUN: ${subject}`)
        console.log(`Recipients: ${recipientEmails.length ? recipientEmails.join(', ') : '(none; dry run)'}`)
        console.log(textBody)
        dryRunCount += 1
        continue
      }

      const gmailResponse = await sendGmailMessage({
        recipients: recipientEmails,
        subject,
        textBody,
        htmlBody,
        replyTo: settings.reply_to_email,
      })

      if (shouldRecordRuns) {
        await writeRun(event, {
          status: 'sent',
          sent_at: new Date().toISOString(),
          recipient_count: recipientEmails.length,
          error: null,
          provider_message_id: gmailResponse.id || null,
        })
      }

      console.log(`Sent ${label} to ${recipientEmails.length} recipient(s).`)
      sentCount += 1
    } catch (error) {
      const message = describeError(error)
      failures.push(`${label}: ${message}`)

      if (shouldRecordRuns) {
        await writeRun(event, {
          status: 'failed',
          sent_at: null,
          recipient_count: recipientEmails.length,
          error: message,
          provider_message_id: null,
        }).catch(runError => {
          console.error(`Failed to write failed run for ${label}: ${describeError(runError)}`)
        })
      }

      console.error(`Failed ${label}: ${message}`)
    }
  }

  console.log('')
  console.log(`Done. Sent: ${sentCount}. Dry runs: ${dryRunCount}. Skipped: ${skippedCount}. Failed: ${failures.length}.`)

  if (failures.length > 0) {
    throw new Error(failures.join('\n'))
  }
}

run().catch(error => {
  console.error(describeError(error))
  process.exit(1)
})
