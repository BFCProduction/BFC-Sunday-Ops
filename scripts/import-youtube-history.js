#!/usr/bin/env node
/**
 * BFC Sunday Ops — Historical YouTube Viewers Import
 *
 * Reads a "Stream Analytics Master - Xam Service.csv" file and upserts
 * youtube_unique_viewers into service_records for each Sunday.
 *
 * Usage:
 *   node scripts/import-youtube-history.js --file ~/Downloads/"Stream Analytics Master - 9am Service.csv" --service 9am
 *   node scripts/import-youtube-history.js --file ~/Downloads/"Stream Analytics Master - 11am Service.csv" --service 11am
 *   node scripts/import-youtube-history.js --file ... --service 9am --write --confirm-historical-import
 *
 * The CSV is expected to have:
 *   Col 0:  Date in M/D/YYYY format
 *   Col 19: YouTube unique viewers (integer)
 *
 * Rows are skipped when:
 *   - Col 0 is not a parseable date (summary/header rows)
 *   - Col 19 is empty or zero
 *   - The date is in the future
 *   - No matching Sunday Ops event exists for the date/service
 *
 * Default mode is a preview. Writes require both --write and
 * --confirm-historical-import.
 */

import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

try {
  const envPath = join(__dirname, '..', '.env.local')
  if (existsSync(envPath)) {
    readFileSync(envPath, 'utf8').split('\n').forEach(line => {
      const [key, ...rest] = line.split('=')
      if (key?.trim() && rest.length) process.env[key.trim()] = rest.join('=').trim()
    })
  }
} catch {}

const SUPABASE_URL = process.env.SUPABASE_URL  || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_KEY are required.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ─── Args ─────────────────────────────────────────────────────────────────────

const args   = process.argv.slice(2)
const write = args.includes('--write')
const dryRun = !write || args.includes('--dry-run')
const confirmedHistoricalImport = args.includes('--confirm-historical-import')

const fileArg = (() => {
  const idx = args.indexOf('--file')
  if (idx !== -1) return args[idx + 1] ?? null
  return args.find(a => a.startsWith('--file='))?.split('=')[1] ?? null
})()

const serviceArg = (() => {
  const idx = args.indexOf('--service')
  if (idx !== -1) return args[idx + 1] ?? null
  return args.find(a => a.startsWith('--service='))?.split('=')[1] ?? null
})()

if (!fileArg) {
  console.error('Usage: node scripts/import-youtube-history.js --file <path> --service <9am|11am> [--write --confirm-historical-import]')
  process.exit(1)
}

const SERVICE_TYPE_MAP = {
  '9am':  { serviceType: 'regular_9am', serviceSlug: 'sunday-9am', label: 'Sunday 9am' },
  '11am': { serviceType: 'regular_11am', serviceSlug: 'sunday-11am', label: 'Sunday 11am' },
}
const service = SERVICE_TYPE_MAP[serviceArg]
if (!service) {
  console.error('--service must be "9am" or "11am"')
  process.exit(1)
}

if (write && !confirmedHistoricalImport) {
  console.error('Historical YouTube import writes require --confirm-historical-import.')
  console.error('Run without --write first to preview event_id matches.')
  process.exit(1)
}

// ─── CSV parser ───────────────────────────────────────────────────────────────

function parseCsvLine(line) {
  const out = []
  let cur = '', inQ = false
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ }
    else if (ch === ',' && !inQ) { out.push(cur); cur = '' }
    else { cur += ch }
  }
  out.push(cur)
  return out.map(v => v.trim().replace(/^"|"$/g, ''))
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

const today = new Date()

function parseDate(raw) {
  // M/D/YYYY or MM/DD/YYYY → YYYY-MM-DD
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const [, month, day, year] = m
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

function isFuture(dateStr) {
  return new Date(dateStr + 'T12:00:00') > today
}

let serviceTypesBySlug = null

async function loadServiceTypesBySlug() {
  if (serviceTypesBySlug) return serviceTypesBySlug

  const { data, error } = await supabase
    .from('service_types')
    .select('id, slug, name')

  if (error) throw new Error(`service_types lookup: ${error.message}`)
  serviceTypesBySlug = Object.fromEntries((data ?? []).map(row => [row.slug, row]))
  return serviceTypesBySlug
}

async function resolveEvent(dateStr) {
  const serviceTypes = await loadServiceTypesBySlug()
  const serviceType = serviceTypes[service.serviceSlug]
  if (!serviceType) {
    return {
      event: null,
      reason: `service type "${service.serviceSlug}" does not exist`,
    }
  }

  const { data, error } = await supabase
    .from('events')
    .select('id, name, event_date, event_time, legacy_sunday_id')
    .eq('event_date', dateStr)
    .eq('service_type_id', serviceType.id)
    .order('event_time', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  if (error) throw new Error(`events lookup (${dateStr} ${service.serviceSlug}): ${error.message}`)

  const events = data ?? []
  if (events.length === 0) {
    return { event: null, reason: `no ${service.serviceSlug} event exists on ${dateStr}` }
  }
  if (events.length > 1) {
    return {
      event: null,
      reason: `multiple ${service.serviceSlug} events exist on ${dateStr}: ${events
        .map(event => `${event.event_time?.slice(0, 5) ?? 'time unknown'} ${event.name} (${event.id})`)
        .join('; ')}`,
    }
  }

  return { event: events[0], reason: 'single matching event' }
}

async function upsertYoutubeViewers(dateStr, viewers, event) {
  const fields = { youtube_unique_viewers: viewers }

  const { data: existing, error: findError } = await supabase
    .from('service_records')
    .select('id')
    .eq('event_id', event.id)
    .maybeSingle()

  if (findError) throw new Error(`service_records lookup (${dateStr}): ${findError.message}`)

  if (existing) {
    const { error } = await supabase
      .from('service_records')
      .update({
        service_date: dateStr,
        service_type: service.serviceType,
        sunday_id: event.legacy_sunday_id ?? null,
        event_id: event.id,
        service_label: null,
        ...fields,
      })
      .eq('id', existing.id)

    if (error) throw new Error(`service_records update (${dateStr}): ${error.message}`)
    return 'updated'
  }

  const { error } = await supabase
    .from('service_records')
    .insert({
      service_date: dateStr,
      service_type: service.serviceType,
      sunday_id: event.legacy_sunday_id ?? null,
      event_id: event.id,
      service_label: null,
      ...fields,
    })

  if (error) throw new Error(`service_records insert (${dateStr}): ${error.message}`)
  return 'inserted'
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log('BFC Sunday Ops — Historical YouTube Import')
  console.log('===========================================')
  console.log(`File:    ${fileArg}`)
  console.log(`Service: ${serviceArg} → ${service.serviceSlug}`)
  if (dryRun) console.log('Mode:    PREVIEW (pass --write --confirm-historical-import to import)\n')
  else        console.log('Mode:    LIVE WRITE\n')

  const expandedPath = fileArg.replace(/^~/, process.env.HOME)
  if (!existsSync(expandedPath)) {
    console.error(`File not found: ${expandedPath}`)
    process.exit(1)
  }

  const lines = readFileSync(expandedPath, 'utf8').trim().split('\n')

  const rows = []
  for (const line of lines) {
    const cols   = parseCsvLine(line)
    const dateStr = parseDate(cols[0])
    if (!dateStr) continue                        // header / summary row
    if (isFuture(dateStr)) continue              // future date, no data

    const raw = cols[19]?.trim()
    const viewers = raw ? parseInt(raw.replace(/,/g, ''), 10) : NaN
    if (isNaN(viewers) || viewers <= 0) continue // no YouTube data

    rows.push({ dateStr, viewers })
  }

  console.log(`Found ${rows.length} rows with YouTube data.\n`)

  let updated = 0, inserted = 0, skipped = 0, errors = 0

  for (const { dateStr, viewers } of rows) {
    const { event, reason } = await resolveEvent(dateStr)

    if (!event) {
      console.log(`  skip ${dateStr} ${service.serviceSlug}: ${reason}`)
      skipped++
      continue
    }

    if (dryRun) {
      console.log(
        `  ${dateStr}  event_id=${event.id}` +
        ` (${event.event_time?.slice(0, 5) ?? 'time unknown'} ${event.name})` +
        ` youtube_unique_viewers = ${viewers}`
      )
      continue
    }

    try {
      const result = await upsertYoutubeViewers(dateStr, viewers, event)
      if (result === 'updated') updated++
      else inserted++
      console.log(`  ✓ ${result} ${dateStr} event_id=${event.id} youtube=${viewers}`)
    } catch (err) {
      console.error(`  ERROR ${dateStr}: ${err instanceof Error ? err.message : err}`)
      errors++
    }
  }

  if (!dryRun) {
    console.log(`\nDone. Updated: ${updated}, Inserted: ${inserted}, Skipped: ${skipped}, Errors: ${errors}`)
  } else {
    console.log(`\nPreview complete. Skipped: ${skipped}. No data written.`)
  }
}

run().catch(err => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
