#!/usr/bin/env node
/**
 * import-service-records.js
 *
 * Imports historical Sunday service data from the "Stream Analytics Master"
 * Google Sheet into the service_records Supabase table.
 *
 * Sources:
 *   - 9am Service tab  (gid=0)
 *   - 11am Service tab (gid=1117196527)
 *   - Special Services tab (gid=1704937366)
 *
 * Usage:
 *   node scripts/import-service-records.js          # dry run (default)
 *   node scripts/import-service-records.js --write --confirm-historical-import
 *
 * Requires in .env.local:
 *   VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import { parse } from 'csv-parse/sync'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Config ────────────────────────────────────────────────────────────────────

const SHEET_ID = '14mhrHNRkL6GkBxS78xIyAHKEXNrZ_Uy4-KmivuJKxfw'
const TABS = {
  '9am':     { gid: '0',          serviceType: 'regular_9am'  },
  '11am':    { gid: '1117196527', serviceType: 'regular_11am' },
  'special': { gid: '1704937366', serviceType: 'special'      },
}

const WRITE = process.argv.includes('--write')
const CONFIRMED_HISTORICAL_IMPORT = process.argv.includes('--confirm-historical-import')

if (WRITE && !CONFIRMED_HISTORICAL_IMPORT) {
  console.error('Historical service_records import writes require --confirm-historical-import.')
  console.error('Run without --write first to preview, and prefer event-native importers for new data.')
  process.exit(1)
}

// ── Env ───────────────────────────────────────────────────────────────────────

function loadEnv() {
  try {
    const raw = readFileSync(resolve(__dirname, '../.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
      if (!process.env[key]) process.env[key] = val
    }
  } catch {
    // env vars may already be set in CI
  }
}

loadEnv()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── Helpers ───────────────────────────────────────────────────────────────────

function csvUrl(gid) {
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`
}

async function fetchCsv(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)
  return res.text()
}

/**
 * Parse a date string from the sheet (e.g. "1/2/2022", "3/15/2020 7:00 PM").
 * Returns an ISO date string "YYYY-MM-DD" or null if unparseable.
 */
function parseDate(raw) {
  if (!raw || !raw.trim()) return null
  // Strip any time component
  const datePart = raw.trim().split(' ')[0]
  // Expect M/D/YYYY
  const match = datePart.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!match) return null
  const [, m, d, y] = match
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

/**
 * Parse a runtime string from the sheet into seconds.
 * Sheet values look like "1:04:32", "0:38:14", or empty.
 */
function parseRuntime(raw) {
  if (!raw || !raw.trim()) return null
  const parts = raw.trim().split(':').map(Number)
  if (parts.some(isNaN)) return null
  if (parts.length === 3) return Math.round(parts[0] * 3600 + parts[1] * 60 + parts[2])
  if (parts.length === 2) return Math.round(parts[0] * 60 + parts[1])
  return null
}

function parseNum(raw) {
  if (!raw || !raw.trim()) return null
  const n = Number(raw.replace(/,/g, '').trim())
  return isNaN(n) ? null : Math.round(n)
}

function parseFloat2(raw) {
  if (!raw || !raw.trim()) return null
  const n = parseFloat(raw.trim())
  return isNaN(n) ? null : n
}

/**
 * Parse weather from a cell like "75 Sunny", "32°F Clear", "90's Sunny", "83 cloudy/windy".
 * Returns { temp_f, condition } — temp may be null if not parseable.
 */
function parseWeather(raw) {
  if (!raw || !raw.trim()) return { temp_f: null, condition: null }
  const clean = raw.trim()
  // Match leading number (possibly "90's" style)
  const tempMatch = clean.match(/^(\d+)/)
  const temp_f = tempMatch ? Number(tempMatch[1]) : null
  // Everything after the number (and optional degree symbol / apostrophe-s) is the condition
  const condition = clean.replace(/^\d+['°s]*\s*/i, '').trim() || null
  return { temp_f, condition }
}

// ── 9am / 11am tab parser ─────────────────────────────────────────────────────
//
// The sheet has two header rows at the top, then aggregate summary rows
// (Total, Average, Highest Sunday, Lowest Sunday, YYYY Total, YYYY Average,
// YYYY Median, YYYY Highest, YYYY Lowest) before the per-Sunday data rows.
//
// Column layout (0-indexed) as observed:
//   A(0)  Date
//   B(1)  9am+11am Total
//   C(2)  9am+11am In Person
//   D(3)  9am+11am Online
//   E(4)  9am Total  (or 11am Total on the 11am tab)
//   F(5)  9am Online Total (or 11am Online Total)
//   G(6)  In Person Attendance (for this service)
//   H(7)  Service Run Time
//   I(8)  Weather
//   J(9)  Church Online Views
//   K(10) Church Online Unique Viewers
//   L(11) Church Online AVG Watch Time (minutes — convert to seconds)

const SKIP_LABELS = new Set([
  'total', 'average', 'median',
  'highest sunday', 'lowest sunday',
  '2025 total', '2025 average', '2025 median', '2025 highest', '2025 lowest',
  '2024 total', '2024 average', '2024 median', '2024 highest', '2024 lowest',
  '2023 total', '2023 average', '2023 median', '2023 highest', '2023 lowest',
  '2022 total', '2022 average', '2022 median', '2022 highest', '2022 lowest',
  '2021 total', '2021 average', '2021 median', '2021 highest', '2021 lowest',
  '2020 total', '2020 average', '2020 median', '2020 highest', '2020 lowest',
  '2020 lowest', '2019 total', '2019 average',
])

function parseRegularTab(rows, serviceType) {
  const records = []

  for (const row of rows) {
    const rawDate = row[0] || ''

    // Skip blank rows and aggregate/header rows
    if (!rawDate.trim()) continue
    if (SKIP_LABELS.has(rawDate.trim().toLowerCase())) continue

    const date = parseDate(rawDate)
    if (!date) continue

    // Skip rows that look like future placeholders (no attendance data at all)
    const inPerson = parseNum(row[6])
    const coViews  = parseNum(row[9])
    const coUnique = parseNum(row[10])
    if (inPerson === null && coViews === null && coUnique === null) continue

    // AVG Watch Time in sheet is in minutes — convert to seconds
    const avgWatchMin = parseFloat2(row[11])
    const avgWatchSecs = avgWatchMin !== null ? Math.round(avgWatchMin * 60) : null

    const { temp_f, condition } = parseWeather(row[8])

    records.push({
      service_date:                      date,
      service_type:                      serviceType,
      service_label:                     null,
      in_person_attendance:              inPerson,
      church_online_views:               coViews,
      church_online_unique_viewers:      coUnique,
      church_online_avg_watch_time_secs: avgWatchSecs,
      youtube_unique_viewers:            parseNum(row[12]) ?? null, // col M if present
      service_run_time_secs:             parseRuntime(row[7]),
      message_run_time_secs:             null, // not in sheet
      stage_flip_time_secs:              null, // not in sheet
      weather_temp_f:                    temp_f,
      weather_condition:                 condition,
      max_db_a_slow:                     null, // not in sheet
      la_eq_15:                          null, // not in sheet
      max_db_c_slow:                     null,
      lc_eq_15:                          null,
    })
  }

  return records
}

// ── Special Services tab parser ───────────────────────────────────────────────
//
// The Special Services tab has a more irregular structure — services are grouped
// by event with blank rows between them. Each row has a date+time in col A.
// Column layout (observed):
//   A(0)  Date (may include time, e.g. "12/23/2021 7:00 PM")
//   B(1)  Total
//   C(2)  Total In Person
//   D(3)  Total Online
//   E(4)  In Person Attendance
//   F(5)  Service Run Time
//   G(6)  Weather
//   H(7)  Church Online Views  (starts around row 9 in the actual sheet)
//   I(8)  Church Online Unique Viewers
//   J(9)  Church Online AVG Watch Time
//   K(10) YouTube (if present)

function parseSpecialTab(rows) {
  const records = []

  for (const row of rows) {
    const rawDate = row[0] || ''
    if (!rawDate.trim()) continue

    // Skip any header/aggregate rows
    if (SKIP_LABELS.has(rawDate.trim().toLowerCase())) continue
    if (rawDate.trim().toLowerCase() === 'date') continue
    if (rawDate.trim().toLowerCase() === 'total') continue

    const date = parseDate(rawDate)
    if (!date) continue

    // Build a service label from the date + time (e.g. "12/23/2021 7:00 PM" → "7:00 PM")
    const timePart = rawDate.trim().split(' ').slice(1).join(' ').trim()
    const service_label = timePart || 'Special Service'

    const inPerson = parseNum(row[4])
    const coViews  = parseNum(row[7])
    const coUnique = parseNum(row[8])
    if (inPerson === null && coViews === null && coUnique === null) continue

    const avgWatchMin = parseFloat2(row[9])
    const avgWatchSecs = avgWatchMin !== null ? Math.round(avgWatchMin * 60) : null

    const { temp_f, condition } = parseWeather(row[6])

    records.push({
      service_date:                      date,
      service_type:                      'special',
      service_label:                     service_label,
      in_person_attendance:              inPerson,
      church_online_views:               coViews,
      church_online_unique_viewers:      coUnique,
      church_online_avg_watch_time_secs: avgWatchSecs,
      youtube_unique_viewers:            parseNum(row[10]) ?? null,
      service_run_time_secs:             parseRuntime(row[5]),
      message_run_time_secs:             null,
      stage_flip_time_secs:              null,
      weather_temp_f:                    temp_f,
      weather_condition:                 condition,
      max_db_a_slow:                     null,
      la_eq_15:                          null,
      max_db_c_slow:                     null,
      lc_eq_15:                          null,
    })
  }

  return records
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nBFC Sunday Ops — import-service-records`)
  console.log(`Mode: ${WRITE ? 'WRITE' : 'DRY RUN'}\n`)

  let allRecords = []

  for (const [tabName, { gid, serviceType }] of Object.entries(TABS)) {
    console.log(`Fetching ${tabName} tab (gid=${gid})…`)
    const csv = await fetchCsv(csvUrl(gid))

    // Skip the first two header rows before parsing
    const rows = parse(csv, { relax_column_count: true, skip_empty_lines: false })
    const dataRows = rows.slice(2) // rows 0 and 1 are section/column headers

    const records = tabName === 'special'
      ? parseSpecialTab(dataRows)
      : parseRegularTab(dataRows, serviceType)

    console.log(`  → parsed ${records.length} records`)
    allRecords = allRecords.concat(records)
  }

  console.log(`\nTotal records parsed: ${allRecords.length}`)

  // Show a sample
  console.log('\nSample (first 3 records):')
  for (const r of allRecords.slice(0, 3)) {
    console.log(
      `  ${r.service_date} [${r.service_type}]` +
      ` in_person=${r.in_person_attendance}` +
      ` co_unique=${r.church_online_unique_viewers}` +
      (r.service_label ? ` label="${r.service_label}"` : '')
    )
  }

  if (!WRITE) {
    console.log('\nDry run complete. Pass --write to insert into Supabase.')
    return
  }

  // Upsert in batches of 100
  const BATCH = 100
  let inserted = 0
  let errors = 0

  for (let i = 0; i < allRecords.length; i += BATCH) {
    const batch = allRecords.slice(i, i + BATCH)
    // ignoreDuplicates generates ON CONFLICT DO NOTHING (no target needed),
    // which works with partial unique indexes and makes re-runs safe.
    const { error } = await supabase
      .from('service_records')
      .upsert(batch, { ignoreDuplicates: true })

    if (error) {
      console.error(`  Batch ${i}–${i + batch.length} error:`, error.message)
      errors += batch.length
    } else {
      inserted += batch.length
      process.stdout.write(`\r  Upserted ${inserted} / ${allRecords.length}…`)
    }
  }

  console.log(`\n\nDone. ${inserted} upserted, ${errors} errors.`)

  if (errors > 0) {
    console.error('\nSome rows failed. Check output above.')
    process.exit(1)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
