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

  // All event-native service_records rows missing weather, past only.
  // Legacy rows without event_id are skipped; weather is event-level now.
  const today = new Date().toISOString().slice(0, 10)
  const { data: records, error: recErr } = await supabase
    .from('service_records')
    .select('id, event_id, service_date, service_type, service_label')
    .is('weather_temp_f', null)
    .not('event_id', 'is', null)
    .lt('service_date', today)
    .order('service_date', { ascending: true })

  if (recErr) throw recErr
  if (!records?.length) {
    console.log('All past service_records already have weather — nothing to do.')
    return
  }

  const { data: configs, error: configError } = await supabase
    .from('weather_config')
    .select('*')
    .in('event_id', records.map(record => record.event_id))

  if (configError) throw configError

  const configByEvent = new Map((configs ?? []).map(config => [config.event_id, config]))
  const configuredRecords = records.filter(record => configByEvent.has(record.event_id))
  const missingConfig = records.length - configuredRecords.length

  if (configuredRecords.length === 0) {
    console.log(`${records.length} event-native row(s) need weather, but none have event-level weather config.`)
    return
  }

  if (missingConfig > 0) {
    console.log(`${missingConfig} row(s) skipped because their events do not have weather config.\n`)
  }

  // Unique date/ZIP pairs to fetch.
  const uniqueKeys = [...new Set(configuredRecords.map(record => {
    const config = configByEvent.get(record.event_id)
    return `${config.zip_code}:${record.service_date}`
  }))]

  // Exclude clearly bad dates (e.g. year 200 typo)
  const validKeys = uniqueKeys.filter(key => {
    const [, date] = key.split(':')
    const year = parseInt(date.slice(0, 4), 10)
    return year >= 2000 && date <= today
  })
  const skippedKeys = uniqueKeys.filter(key => !validKeys.includes(key))
  if (skippedKeys.length) {
    console.log(`Skipping ${skippedKeys.length} invalid date/ZIP pair(s): ${skippedKeys.join(', ')}\n`)
  }

  console.log(`${configuredRecords.length} row(s) across ${validKeys.length} date/ZIP pair(s) need weather.\n`)

  let fetchesOk = 0
  let fetchesFailed = 0
  const locationCache = new Map()
  const weatherCache = new Map() // zip:date → { temp_f, condition }

  for (const key of validKeys) {
    const [zipCode, date] = key.split(':')
    process.stdout.write(`  ${date} ${zipCode}  `)
    try {
      let location = locationCache.get(zipCode)
      if (!location) {
        location = await geocodeZip(zipCode)
        locationCache.set(zipCode, location)
      }
      const w = await fetchHistoricalWeather(location.latitude, location.longitude, date)
      weatherCache.set(key, w)
      console.log(`${w.temp_f}°F, ${w.condition}`)
      fetchesOk++
    } catch (err) {
      console.log(`FAILED — ${err instanceof Error ? err.message : err}`)
      fetchesFailed++
    }
    // Rate-limit: Open-Meteo free tier allows ~10k req/day; 300ms keeps us polite
    await new Promise(r => setTimeout(r, 300))
  }

  console.log(`\nFetched ${fetchesOk}/${validKeys.length} date/ZIP pair(s). Updating service_records...\n`)

  let rowsUpdated = 0
  let rowsSkipped = 0

  for (const rec of configuredRecords) {
    const config = configByEvent.get(rec.event_id)
    const w = weatherCache.get(`${config.zip_code}:${rec.service_date}`)
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
