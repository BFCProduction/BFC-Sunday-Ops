#!/usr/bin/env node
// Fetches historical weather from Open-Meteo archive API and writes it
// directly into service_records.weather_temp_f / weather_condition for
// all rows that are missing weather data.
//
// Works for all historical dates regardless of whether an events row exists.
// Run: node scripts/backfill-service-records-weather.js

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

function weatherCodeToCondition(code) {
  const map = new Map([
    [0, 'Clear'], [1, 'Mainly Clear'], [2, 'Partly Cloudy'], [3, 'Overcast'],
    [45, 'Fog'], [48, 'Depositing Rime Fog'],
    [51, 'Light Drizzle'], [53, 'Drizzle'], [55, 'Dense Drizzle'],
    [56, 'Light Freezing Drizzle'], [57, 'Freezing Drizzle'],
    [61, 'Light Rain'], [63, 'Rain'], [65, 'Heavy Rain'],
    [66, 'Light Freezing Rain'], [67, 'Freezing Rain'],
    [71, 'Light Snow'], [73, 'Snow'], [75, 'Heavy Snow'], [77, 'Snow Grains'],
    [80, 'Light Rain Showers'], [81, 'Rain Showers'], [82, 'Heavy Rain Showers'],
    [85, 'Light Snow Showers'], [86, 'Snow Showers'],
    [95, 'Thunderstorm'], [96, 'Thunderstorm With Hail'], [99, 'Severe Thunderstorm With Hail'],
  ])
  return map.get(code) || `Weather Code ${code}`
}

async function geocodeZip(zipCode) {
  const params = new URLSearchParams({
    name: zipCode, count: '1', countryCode: 'US', language: 'en', format: 'json',
  })
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`)
  if (!res.ok) throw new Error(`Geocoding failed: ${res.status}`)
  const payload = await res.json()
  const result = payload?.results?.[0]
  if (!result?.latitude || !result?.longitude) throw new Error(`Unable to geocode ZIP ${zipCode}`)
  return result
}

// Open-Meteo archive only goes back to 1940, but requests must be in the past.
// Fetches hourly data for a single date and returns the 9am reading.
async function fetchHistoricalWeather(lat, lon, date) {
  const params = new URLSearchParams({
    latitude:         String(lat),
    longitude:        String(lon),
    start_date:       date,
    end_date:         date,
    hourly:           'temperature_2m,weather_code',
    temperature_unit: 'fahrenheit',
    timezone:         'America/Chicago',
  })

  const res = await fetch(`https://archive-api.open-meteo.com/v1/archive?${params}`)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Archive API ${res.status}: ${body.slice(0, 120)}`)
  }
  const payload = await res.json()

  const hours = payload?.hourly?.time ?? []
  const temps = payload?.hourly?.temperature_2m ?? []
  const codes = payload?.hourly?.weather_code ?? []

  // Prefer 9am; fall back to first available reading
  const targetHour = `${date}T09:00`
  let idx = hours.indexOf(targetHour)
  if (idx === -1) idx = 0

  return {
    temp_f:    temps[idx] != null ? Math.round(temps[idx] * 10) / 10 : null,
    condition: codes[idx]  != null ? weatherCodeToCondition(codes[idx]) : null,
  }
}

async function run() {
  console.log('BFC Sunday Ops — Historical weather backfill for service_records')
  console.log('==================================================================')

  const { data: config, error: configError } = await supabase
    .from('weather_config')
    .select('*')
    .eq('key', 'default')
    .maybeSingle()

  if (configError || !config) {
    console.error('No weather config found. Save weather settings in the admin UI first.')
    process.exit(1)
  }

  console.log(`Location: ${config.location_label ?? config.zip_code} (${config.zip_code})\n`)

  // All service_records rows missing weather, past only
  const today = new Date().toISOString().slice(0, 10)
  const { data: records, error: recErr } = await supabase
    .from('service_records')
    .select('id, service_date, service_type, service_label')
    .is('weather_temp_f', null)
    .lt('service_date', today)
    .order('service_date', { ascending: true })

  if (recErr) throw recErr
  if (!records?.length) {
    console.log('All past service_records already have weather — nothing to do.')
    return
  }

  // Unique dates to fetch (one API call per date covers all services that day)
  const uniqueDates = [...new Set(records.map(r => r.service_date))]

  // Exclude clearly bad dates (e.g. year 200 typo)
  const validDates = uniqueDates.filter(d => {
    const year = parseInt(d.slice(0, 4), 10)
    return year >= 2000 && d <= today
  })
  const skippedDates = uniqueDates.filter(d => !validDates.includes(d))
  if (skippedDates.length) {
    console.log(`Skipping ${skippedDates.length} invalid date(s): ${skippedDates.join(', ')}\n`)
  }

  console.log(`${records.length} row(s) across ${validDates.length} date(s) need weather.\n`)

  console.log('Geocoding ZIP code...')
  const location = await geocodeZip(config.zip_code)
  console.log(`Resolved: ${location.name}, ${location.admin1 ?? ''}`.trim())
  console.log(`Coordinates: ${location.latitude}, ${location.longitude}\n`)

  let datesOk = 0
  let datesFailed = 0
  const weatherCache = new Map() // date → { temp_f, condition }

  for (const date of validDates) {
    process.stdout.write(`  ${date}  `)
    try {
      const w = await fetchHistoricalWeather(location.latitude, location.longitude, date)
      weatherCache.set(date, w)
      console.log(`${w.temp_f}°F, ${w.condition}`)
      datesOk++
    } catch (err) {
      console.log(`FAILED — ${err instanceof Error ? err.message : err}`)
      datesFailed++
    }
    // Rate-limit: Open-Meteo free tier allows ~10k req/day; 300ms keeps us polite
    await new Promise(r => setTimeout(r, 300))
  }

  console.log(`\nFetched ${datesOk}/${validDates.length} dates. Updating service_records...\n`)

  let rowsUpdated = 0
  let rowsSkipped = 0

  for (const rec of records) {
    const w = weatherCache.get(rec.service_date)
    if (!w) { rowsSkipped++; continue }

    const { error: upErr } = await supabase
      .from('service_records')
      .update({ weather_temp_f: w.temp_f, weather_condition: w.condition })
      .eq('id', rec.id)

    if (upErr) {
      console.log(`  FAILED updating ${rec.service_date} ${rec.service_type}: ${upErr.message}`)
      rowsSkipped++
    } else {
      rowsUpdated++
    }
  }

  console.log(`Done. Rows updated: ${rowsUpdated}  Rows skipped: ${rowsSkipped}`)
}

run().catch(err => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
