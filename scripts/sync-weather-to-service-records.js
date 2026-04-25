#!/usr/bin/env node
// Copies weather data from the `weather` table into the matching
// `service_records` rows (which feed the analytics/data-explorer views).
// Safe to re-run — only updates rows where weather_temp_f IS NULL.

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
      if (key && rest.length) process.env[key.trim()] = rest.join('=').trim()
    })
  }
} catch {}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_KEY required')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function run() {
  console.log('BFC Sunday Ops — Sync weather → service_records')
  console.log('=================================================')

  // Find event-native service_records rows with no weather. Weather is now
  // event-level, so legacy date-only rows are not inferred from sibling events.
  const { data: records, error: recErr } = await supabase
    .from('service_records')
    .select('id, event_id, service_date, service_type, service_label, sunday_id')
    .is('weather_temp_f', null)
    .not('event_id', 'is', null)
    .order('service_date', { ascending: true })

  if (recErr) throw recErr
  if (!records?.length) {
    console.log('All service_records already have weather data — nothing to do.')
    return
  }

  console.log(`Found ${records.length} service_records row(s) missing weather.\n`)

  // Load event-level weather rows.
  const { data: weatherRows, error: wErr } = await supabase
    .from('weather')
    .select('temp_f, condition, event_id')
    .not('event_id', 'is', null)

  if (wErr) throw wErr

  const weatherByEvent = new Map()
  for (const w of weatherRows ?? []) {
    if (w.event_id && !weatherByEvent.has(w.event_id)) {
      weatherByEvent.set(w.event_id, { temp_f: w.temp_f, condition: w.condition })
    }
  }

  let updated = 0
  let skipped = 0

  for (const rec of records) {
    const weather = weatherByEvent.get(rec.event_id)
    if (!weather) {
      console.log(`  ${rec.service_date} ${rec.service_type} — no event weather record found, skipping`)
      skipped++
      continue
    }

    const { error: upErr } = await supabase
      .from('service_records')
      .update({ weather_temp_f: weather.temp_f, weather_condition: weather.condition })
      .eq('id', rec.id)

    if (upErr) {
      console.log(`  ${rec.service_date} ${rec.service_type} — update failed: ${upErr.message}`)
      skipped++
    } else {
      console.log(`  ${rec.service_date} ${rec.service_type} — ${weather.temp_f}°F, ${weather.condition}`)
      updated++
    }
  }

  console.log(`\nDone. Updated: ${updated}  Skipped: ${skipped}`)
}

run().catch(err => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
