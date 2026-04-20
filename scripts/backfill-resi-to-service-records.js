#!/usr/bin/env node
/**
 * BFC Sunday Ops — Backfill church_online columns from resi_events → service_records
 *
 * Reads existing resi_events rows for one or more Sundays and writes
 * church_online_views / church_online_unique_viewers / church_online_avg_watch_time_secs
 * into the matching service_records rows.  Safe to re-run — only updates
 * the three church_online columns, leaves everything else untouched.
 *
 * Usage:
 *   node scripts/backfill-resi-to-service-records.js --date 2026-03-29
 *   node scripts/backfill-resi-to-service-records.js --date 2026-03-29 --date 2026-04-05 --date 2026-04-12
 *   node scripts/backfill-resi-to-service-records.js --dry-run --date 2026-03-29
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

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_KEY are required.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// Maps resi_events.service_name → service_records.service_type
const SERVICE_TYPE_MAP = {
  'Traditional':  'regular_9am',
  'Contemporary': 'regular_11am',
}

const args   = process.argv.slice(2)
const dryRun = args.includes('--dry-run')

// Collect all --date values
const dates = []
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--date' && args[i + 1]) {
    dates.push(args[i + 1])
    i++
  } else if (args[i].startsWith('--date=')) {
    dates.push(args[i].split('=')[1])
  }
}

if (dates.length === 0) {
  console.error('Usage: node scripts/backfill-resi-to-service-records.js --date YYYY-MM-DD [--date YYYY-MM-DD ...]')
  process.exit(1)
}

for (const d of dates) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    console.error(`Invalid date format: "${d}" — expected YYYY-MM-DD`)
    process.exit(1)
  }
}

async function backfillDate(dateStr) {
  console.log(`\n── ${dateStr}${dryRun ? ' [DRY RUN]' : ''} ──`)

  // Get the sundays row for this date
  const { data: sunday, error: sundayErr } = await supabase
    .from('sundays')
    .select('id')
    .eq('date', dateStr)
    .maybeSingle()
  if (sundayErr) throw new Error(`sundays lookup: ${sundayErr.message}`)
  if (!sunday) {
    console.log('  No sundays row found — skipping.')
    return
  }

  // Fetch resi_events rows for this sunday
  const { data: resiRows, error: resiErr } = await supabase
    .from('resi_events')
    .select('service_name, total_views, unique_viewers, avg_watch_seconds')
    .eq('sunday_id', sunday.id)
  if (resiErr) throw new Error(`resi_events fetch: ${resiErr.message}`)
  if (!resiRows || resiRows.length === 0) {
    console.log('  No resi_events rows found — skipping.')
    return
  }

  for (const row of resiRows) {
    const serviceType = SERVICE_TYPE_MAP[row.service_name]
    if (!serviceType) {
      console.log(`  "${row.service_name}": no service_records mapping — skipping.`)
      continue
    }

    const churchOnlineFields = {
      church_online_views:               row.total_views,
      church_online_unique_viewers:      row.unique_viewers,
      church_online_avg_watch_time_secs: row.avg_watch_seconds,
    }

    console.log(
      `  ${row.service_name} → ${serviceType}:` +
      ` views=${row.total_views}, unique=${row.unique_viewers}, avg_watch=${row.avg_watch_seconds ?? '?'}s`
    )

    if (dryRun) continue

    const { data: existing } = await supabase
      .from('service_records')
      .select('id')
      .eq('service_date', dateStr)
      .eq('service_type', serviceType)
      .maybeSingle()

    let writeErr
    if (existing) {
      ;({ error: writeErr } = await supabase
        .from('service_records').update(churchOnlineFields).eq('id', existing.id))
      if (!writeErr) console.log(`    Updated existing row ${existing.id}`)
    } else {
      ;({ error: writeErr } = await supabase
        .from('service_records').insert({
          service_date: dateStr,
          service_type: serviceType,
          sunday_id:    sunday.id,
          ...churchOnlineFields,
        }))
      if (!writeErr) console.log(`    Inserted new row.`)
    }
    if (writeErr) throw new Error(`service_records write (${serviceType}): ${writeErr.message}`)
  }
}

async function run() {
  console.log('BFC Sunday Ops — Backfill RESI → service_records')
  console.log('==================================================')
  for (const d of dates) {
    await backfillDate(d)
  }
  console.log('\nDone.')
}

run().catch(err => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
