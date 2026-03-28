#!/usr/bin/env node
/**
 * migrate-existing-ops-data.js
 *
 * One-time migration: reads data already captured in Sunday Ops (attendance,
 * loudness, weather, resi_events) and merges it into service_records.
 *
 * Run AFTER import-service-records.js so that Google Sheets historical rows
 * already exist and this script fills in the gaps (loudness, weather, etc.)
 * for dates where Sunday Ops has richer data than the sheet.
 *
 * Usage:
 *   node scripts/migrate-existing-ops-data.js          # dry run (default)
 *   node scripts/migrate-existing-ops-data.js --write  # write to Supabase
 *
 * Safe to run multiple times — uses upsert throughout.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const WRITE = process.argv.includes('--write')

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
  } catch { /* env vars may already be set */ }
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

/**
 * Fetch all rows from a Supabase table, paginating through all results.
 */
async function fetchAll(table, select = '*', filters = []) {
  const PAGE = 1000
  let rows = []
  let from = 0

  while (true) {
    let q = supabase.from(table).select(select).range(from, from + PAGE - 1)
    for (const [col, val] of filters) q = q.eq(col, val)
    const { data, error } = await q
    if (error) throw new Error(`${table}: ${error.message}`)
    rows = rows.concat(data)
    if (data.length < PAGE) break
    from += PAGE
  }

  return rows
}

/**
 * Parse a runtime text value from runtime_values into seconds.
 * The relay stores values in HH:MM:SS or MM:SS format.
 */
function runtimeToSecs(text) {
  if (!text || !text.trim()) return null
  const parts = text.trim().split(':').map(Number)
  if (parts.some(isNaN)) return null
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return null
}

/**
 * Upsert a patch into service_records for a given date + type.
 * Only sets non-null fields — does not overwrite existing data with nulls.
 */
async function patchRecord(date, serviceType, patch, dryRun) {
  // Remove null values so we don't overwrite good data with nulls
  const cleanPatch = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== null && v !== undefined)
  )
  if (Object.keys(cleanPatch).length === 0) return 'skipped'

  if (dryRun) return 'would-patch'

  // Fetch existing row
  const { data: existing } = await supabase
    .from('service_records')
    .select('id')
    .eq('service_date', date)
    .eq('service_type', serviceType)
    .maybeSingle()

  if (existing) {
    // Update — only fill in null columns
    const { error } = await supabase
      .from('service_records')
      .update(cleanPatch)
      .eq('id', existing.id)
    return error ? `error: ${error.message}` : 'updated'
  } else {
    // Insert new row (e.g. a Sunday that wasn't in the sheet at all)
    const { error } = await supabase
      .from('service_records')
      .insert({ service_date: date, service_type: serviceType, ...cleanPatch })
    return error ? `error: ${error.message}` : 'inserted'
  }
}

// ── Migration steps ───────────────────────────────────────────────────────────

async function migrateAttendance(sundays) {
  console.log('\n── Attendance ──────────────────────────────────')
  const rows = await fetchAll('attendance', 'sunday_id,service_1_count,service_2_count')
  console.log(`  Found ${rows.length} attendance rows`)

  const sundayById = Object.fromEntries(sundays.map(s => [s.id, s.date]))
  let patched = 0

  for (const row of rows) {
    const date = sundayById[row.sunday_id]
    if (!date) continue

    const r1 = await patchRecord(date, 'regular_9am',  { in_person_attendance: row.service_1_count }, !WRITE)
    const r2 = await patchRecord(date, 'regular_11am', { in_person_attendance: row.service_2_count }, !WRITE)
    if (r1 !== 'skipped') patched++
    if (r2 !== 'skipped') patched++
  }

  console.log(`  Patched ${patched} service records`)
}

async function migrateLoudness(sundays) {
  console.log('\n── Loudness ────────────────────────────────────')
  const rows = await fetchAll(
    'loudness',
    'sunday_id,service_1_max_db,service_1_laeq,service_2_max_db,service_2_laeq,service_1_max_db_c,service_1_lceq,service_2_max_db_c,service_2_lceq'
  )
  console.log(`  Found ${rows.length} loudness rows`)

  const sundayById = Object.fromEntries(sundays.map(s => [s.id, s.date]))
  let patched = 0

  for (const row of rows) {
    const date = sundayById[row.sunday_id]
    if (!date) continue

    const r1 = await patchRecord(date, 'regular_9am', {
      max_db_a_slow: row.service_1_max_db,
      la_eq_15:      row.service_1_laeq,
      max_db_c_slow: row.service_1_max_db_c ?? null,
      lc_eq_15:      row.service_1_lceq    ?? null,
    }, !WRITE)

    const r2 = await patchRecord(date, 'regular_11am', {
      max_db_a_slow: row.service_2_max_db,
      la_eq_15:      row.service_2_laeq,
      max_db_c_slow: row.service_2_max_db_c ?? null,
      lc_eq_15:      row.service_2_lceq    ?? null,
    }, !WRITE)

    if (r1 !== 'skipped') patched++
    if (r2 !== 'skipped') patched++
  }

  console.log(`  Patched ${patched} service records`)
}

async function migrateWeather(sundays) {
  console.log('\n── Weather ─────────────────────────────────────')
  const rows = await fetchAll('weather', 'sunday_id,temp_f,condition')
  console.log(`  Found ${rows.length} weather rows`)

  const sundayById = Object.fromEntries(sundays.map(s => [s.id, s.date]))
  let patched = 0

  for (const row of rows) {
    const date = sundayById[row.sunday_id]
    if (!date) continue

    // Weather is the same for both services on a Sunday
    for (const serviceType of ['regular_9am', 'regular_11am']) {
      const r = await patchRecord(date, serviceType, {
        weather_temp_f:   row.temp_f,
        weather_condition: row.condition,
      }, !WRITE)
      if (r !== 'skipped') patched++
    }
  }

  console.log(`  Patched ${patched} service records`)
}

async function migrateResiEvents(sundays) {
  console.log('\n── RESI / Church Online ────────────────────────')
  const rows = await fetchAll(
    'resi_events',
    'sunday_id,service_name,service_time,unique_viewers,total_views,peak_concurrent,avg_watch_seconds'
  )
  console.log(`  Found ${rows.length} resi_events rows`)

  const sundayById = Object.fromEntries(sundays.map(s => [s.id, s.date]))
  let patched = 0
  let skipped = 0

  for (const row of rows) {
    const date = sundayById[row.sunday_id]
    if (!date) continue

    // Map service_name / service_time to our service_type
    // The RESI importer assigns 'Traditional' to the earlier service, 'Contemporary' to the later.
    // service_time may be '9:00 AM' or '11:00 AM' if set.
    let serviceType = null

    if (row.service_time) {
      if (row.service_time.startsWith('9'))  serviceType = 'regular_9am'
      if (row.service_time.startsWith('11')) serviceType = 'regular_11am'
    }

    if (!serviceType) {
      // Fall back to service_name ordering
      if (row.service_name === 'Traditional')   serviceType = 'regular_9am'
      if (row.service_name === 'Contemporary')  serviceType = 'regular_11am'
    }

    if (!serviceType) {
      console.warn(`  Could not map service for ${date} / ${row.service_name} — skipping`)
      skipped++
      continue
    }

    const r = await patchRecord(date, serviceType, {
      church_online_views:               row.total_views,
      church_online_unique_viewers:      row.unique_viewers,
      church_online_avg_watch_time_secs: row.avg_watch_seconds,
    }, !WRITE)

    if (r !== 'skipped') patched++
  }

  console.log(`  Patched ${patched} service records, ${skipped} skipped`)
}

// ── Verification query ────────────────────────────────────────────────────────

async function verify(sundays) {
  console.log('\n── Verification ────────────────────────────────')

  const { count: srCount } = await supabase
    .from('service_records')
    .select('*', { count: 'exact', head: true })

  const { count: attCount } = await supabase
    .from('attendance')
    .select('*', { count: 'exact', head: true })

  const { count: loudCount } = await supabase
    .from('loudness')
    .select('*', { count: 'exact', head: true })

  const { count: resiCount } = await supabase
    .from('resi_events')
    .select('*', { count: 'exact', head: true })

  console.log(`  service_records rows : ${srCount}`)
  console.log(`  sundays rows         : ${sundays.length}  (× 2 = ${sundays.length * 2} expected regular rows)`)
  console.log(`  attendance rows      : ${attCount}  (source — each covers 2 services)`)
  console.log(`  loudness rows        : ${loudCount}  (source — each covers 2 services)`)
  console.log(`  resi_events rows     : ${resiCount}  (source — already per-service)`)
  console.log()
  console.log('  Cross-check: attendance rows × 2 should be ≤ service_records regular rows')
  console.log(`  attendance × 2 = ${attCount * 2},  service_records = ${srCount}`)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\nBFC Sunday Ops — migrate-existing-ops-data')
  console.log(`Mode: ${WRITE ? 'WRITE' : 'DRY RUN'}\n`)

  // Load the sundays table as the date lookup
  const sundays = await fetchAll('sundays', 'id,date')
  console.log(`Loaded ${sundays.length} Sunday records`)

  await migrateAttendance(sundays)
  await migrateLoudness(sundays)
  await migrateWeather(sundays)
  await migrateResiEvents(sundays)
  await verify(sundays)

  if (!WRITE) {
    console.log('\nDry run complete. Pass --write to apply changes.')
  } else {
    console.log('\nMigration complete.')
    console.log('Next step: open Supabase → Table Editor → service_records and spot-check a few rows.')
    console.log('When satisfied, the old standalone tables can be dropped.')
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
