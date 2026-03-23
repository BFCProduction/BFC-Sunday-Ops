#!/usr/bin/env node

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

async function getOrCreateSunday(dateString) {
  const { data: existing, error: existingError } = await supabase
    .from('sundays')
    .select('id, date')
    .eq('date', dateString)
    .maybeSingle()

  if (existingError) throw existingError
  if (existing) return existing

  const { data: created, error: createError } = await supabase
    .from('sundays')
    .insert({ date: dateString })
    .select('id, date')
    .single()

  if (createError) throw createError
  return created
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

async function run() {
  console.log('BFC Sunday Ops — Weather Import')
  console.log('================================')

  const { data: config, error: configError } = await supabase
    .from('weather_config')
    .select('*')
    .eq('key', 'default')
    .maybeSingle()

  if (configError) {
    console.log('Unable to read weather config:', configError.message, '— skipping.')
    process.exit(0)
  }

  if (!config) {
    console.log('No weather config found. Save weather settings in the admin UI first.')
    process.exit(0)
  }

  const now = getChurchDateParts()
  const currentMinutes = (now.hour * 60) + now.minute
  const scheduledMinutes = parseTimeToMinutes(config.pull_time)

  if (!pullNow) {
    if (now.weekdayIndex !== config.pull_day) {
      console.log(`Today is ${DAY_NAMES[now.weekdayIndex]}. Configured pull day is ${DAY_NAMES[config.pull_day]}.`)
      process.exit(0)
    }

    if (currentMinutes < scheduledMinutes) {
      console.log(`Current church time is before configured pull time ${config.pull_time}.`)
      process.exit(0)
    }
  }

  const targetSundayDate = getTargetSundayDate(now)
  console.log(`Target Sunday: ${targetSundayDate}`)

  const sunday = await getOrCreateSunday(targetSundayDate)

  const { data: existingWeather, error: existingWeatherError } = await supabase
    .from('weather')
    .select('fetched_at')
    .eq('sunday_id', sunday.id)
    .maybeSingle()

  if (existingWeatherError) throw existingWeatherError

  if (!pullNow && existingWeather?.fetched_at) {
    console.log(`Weather already imported for ${targetSundayDate} at ${existingWeather.fetched_at}.`)
    process.exit(0)
  }

  console.log(`Resolving ZIP code ${config.zip_code}...`)
  const location = await geocodeZip(config.zip_code)
  console.log(`Resolved to ${location.name}, ${location.admin1 ?? ''}`.trim())

  const current = await fetchWeather(location.latitude, location.longitude)
  if (!current) {
    throw new Error('Weather API did not return current conditions')
  }

  const payload = {
    sunday_id: sunday.id,
    temp_f: current.temperature_2m ?? null,
    condition: current.weather_code != null ? weatherCodeToCondition(current.weather_code) : null,
    wind_mph: current.wind_speed_10m ?? null,
    humidity: current.relative_humidity_2m ?? null,
    fetched_at: new Date().toISOString(),
  }

  const { error: upsertError } = await supabase
    .from('weather')
    .upsert(payload, { onConflict: 'sunday_id' })

  if (upsertError) throw upsertError

  console.log(`Saved weather for ${targetSundayDate}.`)
}

run().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
