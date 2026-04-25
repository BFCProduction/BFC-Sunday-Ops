#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createImportRun, finishImportRun } from './lib/resi-import.js'

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
const pullNow = process.argv.includes('--now')
const CHURCH_TIME_ZONE = 'America/Chicago'
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_KEY required')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

function getChurchDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CHURCH_TIME_ZONE,
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
  const weekday = parts.find(part => part.type === 'weekday')?.value
  const hour = Number(parts.find(part => part.type === 'hour')?.value)
  const minute = Number(parts.find(part => part.type === 'minute')?.value)

  if (!year || !month || !day || weekday == null || Number.isNaN(hour) || Number.isNaN(minute)) {
    throw new Error('Unable to compute church-local date parts')
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

function getChurchDateString(date = new Date()) {
  const { year, month, day } = getChurchDateParts(date)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function addDaysToDateString(dateString, daysToAdd) {
  const [year, month, day] = dateString.split('-').map(Number)
  const base = new Date(Date.UTC(year, month - 1, day))
  base.setUTCDate(base.getUTCDate() + daysToAdd)
  return base.toISOString().slice(0, 10)
}

function getTargetSundayDate(todayParts) {
  if (todayParts.weekdayIndex === 0) {
    return getChurchDateString()
  }

  const daysUntilSunday = (7 - todayParts.weekdayIndex) % 7
  return addDaysToDateString(getChurchDateString(), daysUntilSunday)
}

function parseTimeToMinutes(timeString) {
  const [hours, minutes] = timeString.split(':').map(Number)
  return (hours * 60) + minutes
}

function weatherCodeToCondition(code) {
  const map = new Map([
    [0, 'Clear'],
    [1, 'Mainly Clear'],
    [2, 'Partly Cloudy'],
    [3, 'Overcast'],
    [45, 'Fog'],
    [48, 'Depositing Rime Fog'],
    [51, 'Light Drizzle'],
    [53, 'Drizzle'],
    [55, 'Dense Drizzle'],
    [56, 'Light Freezing Drizzle'],
    [57, 'Freezing Drizzle'],
    [61, 'Light Rain'],
    [63, 'Rain'],
    [65, 'Heavy Rain'],
    [66, 'Light Freezing Rain'],
    [67, 'Freezing Rain'],
    [71, 'Light Snow'],
    [73, 'Snow'],
    [75, 'Heavy Snow'],
    [77, 'Snow Grains'],
    [80, 'Light Rain Showers'],
    [81, 'Rain Showers'],
    [82, 'Heavy Rain Showers'],
    [85, 'Light Snow Showers'],
    [86, 'Snow Showers'],
    [95, 'Thunderstorm'],
    [96, 'Thunderstorm With Hail'],
    [99, 'Severe Thunderstorm With Hail'],
  ])

  return map.get(code) || `Weather Code ${code}`
}

async function geocodeZip(zipCode) {
  const params = new URLSearchParams({
    name: zipCode,
    count: '1',
    countryCode: 'US',
    language: 'en',
    format: 'json',
  })

  const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`)
  if (!response.ok) {
    throw new Error(`Geocoding failed with status ${response.status}`)
  }

  const payload = await response.json()
  const result = payload?.results?.[0]

  if (!result?.latitude || !result?.longitude) {
    throw new Error(`Unable to geocode ZIP code ${zipCode}`)
  }

  return result
}

async function fetchWeather(latitude, longitude) {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    timezone: CHURCH_TIME_ZONE,
  })

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`)
  if (!response.ok) {
    throw new Error(`Weather fetch failed with status ${response.status}`)
  }

  const payload = await response.json()
  return payload?.current
}

function serviceTypeForSlug(slug) {
  if (slug === 'sunday-9am') return 'regular_9am'
  if (slug === 'sunday-11am') return 'regular_11am'
  if (slug === 'special') return 'special'
  return null
}

function serviceTypeSlugForEvent(event) {
  return Array.isArray(event.service_types)
    ? event.service_types[0]?.slug
    : event.service_types?.slug
}

async function writeEventWeather(event, payload) {
  const eventPayload = {
    ...payload,
    event_id: event.id,
    sunday_id: null,
  }

  const { data: existing, error: findError } = await supabase
    .from('weather')
    .select('id')
    .eq('event_id', event.id)
    .maybeSingle()

  if (findError) throw findError

  if (existing) {
    const { error } = await supabase.from('weather').update(eventPayload).eq('id', existing.id)
    if (error) throw error
  } else {
    const { error } = await supabase.from('weather').insert(eventPayload)
    if (error) throw error
  }
}

async function syncWeatherToServiceRecord(event, payload) {
  const serviceType = serviceTypeForSlug(serviceTypeSlugForEvent(event))
  if (!serviceType) return false

  const fields = {
    weather_temp_f: payload.temp_f,
    weather_condition: payload.condition,
  }

  const { data: existingByEvent, error: eventFindError } = await supabase
    .from('service_records')
    .select('id')
    .eq('event_id', event.id)
    .maybeSingle()

  if (eventFindError) throw eventFindError

  if (existingByEvent) {
    const { error } = await supabase
      .from('service_records')
      .update({
        service_date: event.event_date,
        service_type: serviceType,
        sunday_id: event.legacy_sunday_id ?? null,
        service_label: serviceType === 'special' ? event.name : null,
        ...fields,
      })
      .eq('id', existingByEvent.id)
    if (error) throw error
    return true
  }

  const { data: legacyMatches, error: legacyFindError } = await supabase
    .from('service_records')
    .select('id')
    .eq('service_date', event.event_date)
    .eq('service_type', serviceType)
    .is('event_id', null)
    .limit(1)

  if (legacyFindError) throw legacyFindError

  const legacyRow = legacyMatches?.[0] ?? null
  if (legacyRow) {
    const { error } = await supabase
      .from('service_records')
      .update({
        event_id: event.id,
        sunday_id: event.legacy_sunday_id ?? null,
        service_label: serviceType === 'special' ? event.name : null,
        ...fields,
      })
      .eq('id', legacyRow.id)
    if (error) throw error
    return true
  }

  const { error } = await supabase.from('service_records').insert({
    event_id: event.id,
    service_date: event.event_date,
    service_type: serviceType,
    sunday_id: event.legacy_sunday_id ?? null,
    service_label: serviceType === 'special' ? event.name : null,
    ...fields,
  })

  if (error) throw error
  return true
}

function isConfigDue(config, now, currentMinutes) {
  if (pullNow) return true
  if (now.weekdayIndex !== config.pull_day) return false
  return currentMinutes >= parseTimeToMinutes(config.pull_time)
}

function configLabel(config) {
  return config.location_label || `ZIP ${config.zip_code}`
}

async function run() {
  console.log('BFC Sunday Ops — Weather Import')
  console.log('================================')

  const now = getChurchDateParts()
  const currentMinutes = (now.hour * 60) + now.minute
  const targetSundayDate = getTargetSundayDate(now)
  console.log(`Target Sunday: ${targetSundayDate}`)
  const importRunId = await createImportRun(supabase, 'weather', targetSundayDate)
  let rowsWritten = 0

  try {
    const { data: events, error: eventsError } = await supabase
      .from('events')
      .select('id, name, event_date, event_time, legacy_sunday_id, service_types(slug)')
      .eq('event_date', targetSundayDate)
      .order('event_time', { ascending: true })

    if (eventsError) throw eventsError

    if (!events?.length) {
      console.log(`No events found for ${targetSundayDate}.`)
      await finishImportRun(supabase, importRunId, 'skipped', {
        rowsWritten,
        error: `No events found for ${targetSundayDate}.`,
      })
      return
    }

    const eventIds = events.map(event => event.id)

    const [{ data: configs, error: configsError }, { data: existingWeather, error: existingWeatherError }] = await Promise.all([
      supabase
        .from('weather_config')
        .select('*')
        .in('event_id', eventIds),
      supabase
        .from('weather')
        .select('event_id, fetched_at')
        .in('event_id', eventIds),
    ])

    if (configsError) throw configsError
    if (existingWeatherError) throw existingWeatherError

    const configByEvent = new Map((configs ?? []).map(config => [config.event_id, config]))
    const weatherByEvent = new Map((existingWeather ?? []).map(row => [row.event_id, row]))
    const dueEvents = []

    for (const event of events) {
      const config = configByEvent.get(event.id)
      if (!config) {
        console.log(`${event.name}: no event-level weather config saved; skipping.`)
        continue
      }

      if (!isConfigDue(config, now, currentMinutes)) {
        console.log(`${event.name}: not due yet. Configured ${DAY_NAMES[config.pull_day]} at ${config.pull_time}.`)
        continue
      }

      const existing = weatherByEvent.get(event.id)
      if (!pullNow && existing?.fetched_at) {
        console.log(`${event.name}: already imported at ${existing.fetched_at}; skipping.`)
        continue
      }

      dueEvents.push({ event, config })
    }

    if (dueEvents.length === 0) {
      console.log('No event weather imports are due.')
      await finishImportRun(supabase, importRunId, 'skipped', {
        rowsWritten,
        error: 'No event weather imports are due.',
      })
      return
    }

    const locationCache = new Map()
    const weatherCache = new Map()

    for (const { event, config } of dueEvents) {
      console.log(`${event.name}: importing weather for ${configLabel(config)}.`)

      let location = locationCache.get(config.zip_code)
      if (!location) {
        console.log(`Resolving ZIP code ${config.zip_code}...`)
        location = await geocodeZip(config.zip_code)
        locationCache.set(config.zip_code, location)
        console.log(`Resolved to ${location.name}, ${location.admin1 ?? ''}`.trim())
      }

      let current = weatherCache.get(config.zip_code)
      if (!current) {
        current = await fetchWeather(location.latitude, location.longitude)
        weatherCache.set(config.zip_code, current)
      }

      if (!current) {
        throw new Error(`Weather API did not return current conditions for ${event.name}`)
      }

      const payload = {
        temp_f: current.temperature_2m ?? null,
        condition: current.weather_code != null ? weatherCodeToCondition(current.weather_code) : null,
        wind_mph: current.wind_speed_10m ?? null,
        humidity: current.relative_humidity_2m ?? null,
        fetched_at: new Date().toISOString(),
      }

      await writeEventWeather(event, payload)
      rowsWritten++
      if (await syncWeatherToServiceRecord(event, payload)) rowsWritten++
    }

    await finishImportRun(supabase, importRunId, 'succeeded', { rowsWritten })
    console.log(`Saved event-level weather for ${targetSundayDate}. Event rows updated: ${dueEvents.length}.`)
  } catch (error) {
    await finishImportRun(supabase, importRunId, 'failed', {
      rowsWritten,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

run().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
