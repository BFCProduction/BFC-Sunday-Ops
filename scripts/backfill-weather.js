#!/usr/bin/env node
// Backfills historical weather for any events/sundays missing weather records.
// Uses Open-Meteo's free archive API (no API key required).
// Run: node scripts/backfill-weather.js

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
  const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`)
  if (!response.ok) throw new Error(`Geocoding failed: ${response.status}`)
  const payload = await response.json()
  const result = payload?.results?.[0]
  if (!result?.latitude || !result?.longitude) throw new Error(`Unable to geocode ZIP ${zipCode}`)
  return result
}

// Fetches hourly historical weather for a date, returns the 9am reading.
async function fetchHistoricalWeather(latitude, longitude, date) {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    start_date: date,
    end_date: date,
    hourly: 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    timezone: 'America/Chicago',
  })

  const response = await fetch(`https://archive-api.open-meteo.com/v1/archive?${params}`)
  if (!response.ok) throw new Error(`Archive fetch failed: ${response.status}`)
  const payload = await response.json()

  const hours = payload?.hourly?.time ?? []
  // Prefer the 9am reading; fall back to the nearest available hour
  const targetHour = `${date}T09:00`
  let idx = hours.indexOf(targetHour)
  if (idx === -1) idx = 0

  return {
    temp_f:    payload.hourly.temperature_2m?.[idx] ?? null,
    humidity:  payload.hourly.relative_humidity_2m?.[idx] ?? null,
    condition: payload.hourly.weather_code?.[idx] != null
      ? weatherCodeToCondition(payload.hourly.weather_code[idx])
      : null,
    wind_mph:  payload.hourly.wind_speed_10m?.[idx] ?? null,
  }
}

async function run() {
  console.log('BFC Sunday Ops — Weather Backfill')
  console.log('===================================')

  // Load weather config for ZIP code / location
  const { data: config, error: configError } = await supabase
    .from('weather_config')
    .select('*')
    .eq('key', 'default')
    .maybeSingle()

  if (configError || !config) {
    console.error('No weather config found. Save weather settings in the admin UI first.')
    process.exit(1)
  }

  console.log(`Location: ${config.location_label ?? config.zip_code} (${config.zip_code})`)

  // Find all events that have no matching weather record
  const today = new Date().toISOString().slice(0, 10)

  const { data: events, error: eventsError } = await supabase
    .from('events')
    .select('id, event_date, name, legacy_sunday_id')
    .lt('event_date', today)   // only past events — can't backfill the future
    .order('event_date', { ascending: true })

  if (eventsError) throw eventsError

  // Fetch existing weather rows (by event_id and by sunday_id)
  const { data: existingByEvent } = await supabase
    .from('weather')
    .select('event_id')
    .not('event_id', 'is', null)

  const { data: existingBySunday } = await supabase
    .from('weather')
    .select('sunday_id')
    .not('sunday_id', 'is', null)

  const coveredEventIds  = new Set((existingByEvent  ?? []).map(r => r.event_id))
  const coveredSundayIds = new Set((existingBySunday ?? []).map(r => r.sunday_id))

  const missing = (events ?? []).filter(ev => {
    if (coveredEventIds.has(ev.id)) return false
    if (ev.legacy_sunday_id && coveredSundayIds.has(ev.legacy_sunday_id)) return false
    return true
  })

  // Deduplicate by date — one weather fetch per calendar date is enough
  const datesSeen = new Set()
  const toFetch = missing.filter(ev => {
    if (datesSeen.has(ev.event_date)) return false
    datesSeen.add(ev.event_date)
    return true
  })

  if (toFetch.length === 0) {
    console.log('No missing weather records found — nothing to do.')
    return
  }

  console.log(`\nFound ${missing.length} event(s) across ${toFetch.length} date(s) missing weather:\n`)
  toFetch.forEach(ev => console.log(`  ${ev.event_date}  ${ev.name}`))

  console.log('\nGeocoding ZIP code...')
  const location = await geocodeZip(config.zip_code)
  console.log(`Resolved to ${location.name}, ${location.admin1 ?? ''}`.trim())

  let inserted = 0
  let failed   = 0

  for (const ev of toFetch) {
    process.stdout.write(`\nFetching ${ev.event_date}... `)
    try {
      const weather = await fetchHistoricalWeather(location.latitude, location.longitude, ev.event_date)

      // Insert one weather row linked to the event_id (preferred) or sunday_id (legacy fallback)
      const row = {
        event_id:   ev.id,
        sunday_id:  ev.legacy_sunday_id ?? null,
        temp_f:     weather.temp_f,
        condition:  weather.condition,
        wind_mph:   weather.wind_mph,
        humidity:   weather.humidity,
        fetched_at: new Date().toISOString(),
      }

      const { error: insertError } = await supabase.from('weather').insert(row)
      if (insertError) throw insertError

      // Also update any other events on the same date that had no weather
      const siblings = missing.filter(
        m => m.event_date === ev.event_date && m.id !== ev.id
      )
      for (const sibling of siblings) {
        await supabase.from('weather').insert({
          ...row,
          event_id:  sibling.id,
          sunday_id: sibling.legacy_sunday_id ?? null,
        })
      }

      console.log(`${weather.temp_f}°F, ${weather.condition}, wind ${weather.wind_mph} mph, humidity ${weather.humidity}%`)
      inserted++
    } catch (err) {
      console.log(`FAILED — ${err instanceof Error ? err.message : err}`)
      failed++
    }

    // Be polite to the API
    await new Promise(r => setTimeout(r, 300))
  }

  console.log(`\nDone. Inserted: ${inserted}  Failed: ${failed}`)
}

run().catch(err => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
