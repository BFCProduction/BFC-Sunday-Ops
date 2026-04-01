#!/usr/bin/env node
/**
 * BFC Sunday Ops — ProPresenter Relay Script
 *
 * Reads clock values from one or more ProPresenter computers and writes
 * them to Supabase at their individually configured pull times.
 *
 * Usage:
 *   node scripts/propresenter-relay.js         # waits and pulls at each configured time
 *   node scripts/propresenter-relay.js --now   # pulls all fields immediately (testing)
 *
 * Requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local
 */

import { createClient } from '@supabase/supabase-js'
import { get as httpGet } from 'http'
import { get as httpsGet } from 'https'
import net from 'net'
import { existsSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load .env.local
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
  console.error('Error: SUPABASE_URL and SUPABASE_ANON_KEY required in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const pullNow = process.argv.includes('--now')
const dumpTimers = process.argv.includes('--dump-timers')
const REQUEST_TIMEOUT_MS = 3500
const PROBE_HTTP_PATHS = [
  '/v1/timers/current',
  '/v1/timers',
  '/v1/timer',
  '/v1/clocks',
  '/v1/',
  '/',
]
const TIMER_ENDPOINTS = ['v1/timers/current', 'v1/timers']

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatSeconds(totalSeconds) {
  if (totalSeconds == null || isNaN(totalSeconds)) return null
  const secs = Math.round(Math.abs(totalSeconds))
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

// Parse a time string like "25:00", "1:05:30", or "-0:00:15" into total seconds.
// Returns null if unparseable.
function parseTimeString(str) {
  if (!str) return null
  const clean = str.replace(/^-/, '').trim()
  const parts = clean.split(':').map(Number)
  if (parts.some(isNaN)) return null
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return null
}

// Add a countdown target to an overrun value and return the total as a formatted string.
// e.g. target="25:00", overrun="0:15" → "25:15"
// If the captured value is negative or zero (timer didn't overrun), just return the target.
// If either value can't be parsed, returns the raw captured value unchanged.
function addCountdownTarget(target, captured) {
  const targetSecs = parseTimeString(target)
  if (targetSecs == null) return captured
  const capturedSecs = parseTimeString(captured)
  if (capturedSecs == null) return captured
  return formatSeconds(targetSecs + capturedSecs)
}

// ProPresenter returns time as a pre-formatted string e.g. "1:15:32" or "45:30"
// Fall back to converting seconds if it's a number
function extractTime(timerObj) {
  const t = timerObj.time
  if (typeof t === 'string' && t.length > 0) return t
  const secs = timerObj.current_time ?? timerObj.elapsed ?? timerObj.seconds
  return formatSeconds(secs)
}

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const get = url.startsWith('https') ? httpsGet : httpGet
    const req = get(url, { timeout: REQUEST_TIMEOUT_MS }, res => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}`))
          return
        }
        try { resolve(JSON.parse(data)) }
        catch {
          console.error(`  Raw response from ${url} (status ${res.statusCode}):`)
          console.error(`  ${data.slice(0, 500)}`)
          reject(new Error(`Invalid JSON from ${url}`))
        }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Connection timed out')) })
  })
}

function summarizeError(error) {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

function extractTimers(payload) {
  if (Array.isArray(payload)) {
    return payload
  }

  const candidates = [
    payload?.timers,
    payload?.data,
    payload?.data?.timers,
    payload?.response,
    payload?.response?.timers,
  ]

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate
    }
  }

  return null
}

function connectSocket(host, port, timeoutMs = REQUEST_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now()
    const socket = net.createConnection({ host, port })
    let settled = false

    const finish = (callback) => value => {
      if (settled) return
      settled = true
      socket.setTimeout(0)
      callback(value)
    }

    socket.setTimeout(timeoutMs)
    socket.once('connect', finish(() => resolve({ socket, latencyMs: Date.now() - startedAt })))
    socket.once('timeout', finish(() => {
      socket.destroy()
      reject(new Error(`TCP connect timed out after ${timeoutMs}ms`))
    }))
    socket.once('error', finish(error => {
      socket.destroy()
      reject(error)
    }))
  })
}

async function testTcpConnectivity(host, port, timeoutMs = REQUEST_TIMEOUT_MS) {
  const { socket, latencyMs } = await connectSocket(host, port, timeoutMs)
  socket.end()
  socket.destroy()
  return latencyMs
}

function sendTcpApiRequest(host, port, url, timeoutMs = REQUEST_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port })
    let settled = false
    let buffer = ''

    const finish = (callback) => value => {
      if (settled) return
      settled = true
      socket.setTimeout(0)
      socket.end()
      socket.destroy()
      callback(value)
    }

    socket.setTimeout(timeoutMs)

    socket.once('connect', () => {
      socket.write(`${JSON.stringify({ url })}\r\n`)
    })

    socket.on('data', chunk => {
      buffer += chunk.toString('utf8')
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue

        try {
          const payload = JSON.parse(trimmed)
          finish(resolve)(payload)
          return
        } catch {
          finish(reject)(new Error(`Invalid TCP/IP API JSON for ${url}`))
          return
        }
      }
    })

    socket.once('timeout', finish(() => reject(new Error(`TCP/IP API timed out after ${timeoutMs}ms for ${url}`))))
    socket.once('error', finish(error => reject(error)))
    socket.once('end', finish(() => reject(new Error(`TCP/IP API closed without data for ${url}`))))
  })
}

async function tryHttpTimerEndpoints(host, port) {
  const errors = []

  for (const endpoint of TIMER_ENDPOINTS) {
    try {
      const payload = await fetchJSON(`http://${host}:${port}/${endpoint}`)
      const timers = extractTimers(payload)
      if (timers) {
        return { transport: 'http', endpoint, timers }
      }
      errors.push(`${endpoint}: response did not contain a timer list`)
    } catch (error) {
      errors.push(`${endpoint}: ${summarizeError(error)}`)
    }
  }

  throw new Error(`HTTP timer fetch failed (${errors.join('; ')})`)
}

async function tryTcpTimerEndpoints(host, port) {
  const errors = []

  for (const endpoint of TIMER_ENDPOINTS) {
    try {
      const payload = await sendTcpApiRequest(host, port, endpoint)
      if (payload?.error) {
        errors.push(`${endpoint}: ${payload.error}`)
        continue
      }

      const timers = extractTimers(payload)
      if (timers) {
        return { transport: 'tcp', endpoint, timers }
      }
      errors.push(`${endpoint}: response did not contain a timer list`)
    } catch (error) {
      errors.push(`${endpoint}: ${summarizeError(error)}`)
    }
  }

  throw new Error(`TCP/IP timer fetch failed (${errors.join('; ')})`)
}

async function loadTimers(host, port) {
  const failures = []

  try {
    return await tryHttpTimerEndpoints(host, port)
  } catch (error) {
    failures.push(summarizeError(error))
  }

  try {
    return await tryTcpTimerEndpoints(host, port)
  } catch (error) {
    failures.push(summarizeError(error))
  }

  throw new Error(failures.join(' | '))
}

function msUntil(hhmm) {
  const [hh, mm] = hhmm.split(':').map(Number)
  const target = new Date()
  target.setHours(hh, mm, 0, 0)
  const now = new Date()
  if (target <= now) return 0
  return target - now
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function getChurchDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const year = parts.find(part => part.type === 'year')?.value
  const month = parts.find(part => part.type === 'month')?.value
  const day = parts.find(part => part.type === 'day')?.value

  if (!year || !month || !day) {
    throw new Error('Unable to format church date')
  }

  return `${year}-${month}-${day}`
}

function getChurchDayOfWeek(date = new Date()) {
  const dayName = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'long',
  }).format(date)

  return DAY_NAMES.indexOf(dayName)
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function addDaysToDateString(dateString, daysToAdd) {
  const [year, month, day] = dateString.split('-').map(Number)
  const base = new Date(Date.UTC(year, month - 1, day))
  base.setUTCDate(base.getUTCDate() + daysToAdd)
  return base.toISOString().slice(0, 10)
}

function getOperationalSundayDateString(date = new Date()) {
  const dayOfWeek = getChurchDayOfWeek(date)

  if (dayOfWeek === 0) {
    return getChurchDateString(date)
  }

  const daysUntilSunday = (7 - dayOfWeek) % 7
  return addDaysToDateString(getChurchDateString(date), daysUntilSunday)
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

// ─── Probe ProPresenter to find working API path ─────────────────────────────

async function probeProPresenter(host, port) {
  const base = `http://${host}:${port}`
  console.log(`\nProbing ${base} for ProPresenter API...`)

  try {
    const latencyMs = await testTcpConnectivity(host, port)
    console.log(`  TCP socket connect → OK (${latencyMs}ms)`)
  } catch (err) {
    console.log(`  TCP socket connect → Error: ${err.message}`)
  }

  for (const p of PROBE_HTTP_PATHS) {
    try {
      const result = await fetchRaw(`${base}${p}`)
      console.log(`  ${p} → HTTP ${result.status}: ${result.body.slice(0, 200)}`)
    } catch (err) {
      console.log(`  ${p} → Error: ${err.message}`)
    }
  }

  for (const endpoint of TIMER_ENDPOINTS) {
    try {
      const payload = await sendTcpApiRequest(host, port, endpoint)
      const timers = extractTimers(payload)
      if (payload?.error) {
        console.log(`  TCP ${endpoint} → API error: ${payload.error}`)
      } else if (timers) {
        console.log(`  TCP ${endpoint} → OK (${timers.length} timer${timers.length !== 1 ? 's' : ''})`)
      } else {
        console.log(`  TCP ${endpoint} → Response received, but no timer list found`)
      }
    } catch (err) {
      console.log(`  TCP ${endpoint} → Error: ${err.message}`)
    }
  }
}

function fetchRaw(url) {
  return new Promise((resolve, reject) => {
    const get = url.startsWith('https') ? httpsGet : httpGet
    const req = get(url, { timeout: REQUEST_TIMEOUT_MS }, res => {
      let body = ''
      res.on('data', chunk => body += chunk)
      res.on('end', () => resolve({ status: res.statusCode, body }))
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('timed out')) })
  })
}

// ─── Pull a group of fields that share the same pull_time ─────────────────────

async function pullFields(fields, sundayId) {
  const byHost = {}
  for (const field of fields) {
    if (!field.host) continue
    const key = `${field.host}:${field.port}`
    if (!byHost[key]) byHost[key] = { host: field.host, port: field.port, fields: [] }
    byHost[key].fields.push(field)
  }

  for (const { host, port, fields: hostFields } of Object.values(byHost)) {
    const ppBase = `http://${host}:${port}`
    console.log(`\n  Connecting to ${ppBase}...`)

    let timers
    let transport
    let endpoint
    try {
      const result = await loadTimers(host, port)
      timers = result.timers
      transport = result.transport
      endpoint = result.endpoint
      console.log(`  Found ${timers.length} timer${timers.length !== 1 ? 's' : ''}`)
      console.log(`  Loaded via ${transport.toUpperCase()} ${endpoint}`)
      timers.forEach((t, i) => {
        const name = t.id?.name ?? t.name ?? 'Unnamed'
        const time = extractTime(t)
        console.log(`    [${i}] ${name} — ${time ?? 'no time'} (${t.state ?? ''})`)
      })
    } catch (err) {
      console.error(`  Could not reach ProPresenter at ${host}:${port}: ${err.message}`)
      console.error(`  Skipping ${hostFields.length} field(s) on this host`)
      continue
    }

    const upserts = []
    for (const field of hostFields) {
      const timer = timers[field.clock_number]
      if (!timer) {
        console.warn(`  Warning: timer index ${field.clock_number} not found for "${field.label}" (only ${timers.length} available)`)
        continue
      }
      const rawValue = extractTime(timer)
      const timerName = timer.id?.name ?? timer.name ?? 'Unnamed'
      let value = rawValue
      if (field.countdown_target && rawValue != null) {
        value = addCountdownTarget(field.countdown_target, rawValue)
        console.log(`  "${field.label}" → timer index ${field.clock_number} (${timerName}) = ${rawValue} + target ${field.countdown_target} = ${value}`)
      } else {
        console.log(`  "${field.label}" → timer index ${field.clock_number} (${timerName}) = ${value ?? 'no time'}`)
      }
      upserts.push({
        sunday_id: sundayId,
        field_id: field.id,
        value,
        captured_at: new Date().toISOString(),
      })
    }

    if (upserts.length > 0) {
      const { error } = await supabase
        .from('runtime_values')
        .upsert(upserts, { onConflict: 'sunday_id,field_id' })
      if (error) console.error(`  Supabase write error: ${error.message}`)
      else console.log(`  Saved ${upserts.length} value(s) to Supabase`)
    }
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function run() {
  console.log('BFC Sunday Ops — ProPresenter Relay')
  console.log('====================================')

  const todayDow = getChurchDayOfWeek()
  const targetSundayDate = getOperationalSundayDateString()

  const { data: allFields, error: fieldsErr } = await supabase
    .from('runtime_fields')
    .select('*')
    .order('pull_time', { ascending: true })

  if (fieldsErr || !allFields) {
    console.error('Could not load runtime fields:', fieldsErr?.message)
    process.exit(1)
  }

  const todayFields = (pullNow || dumpTimers)
    ? allFields
    : allFields.filter(f => f.pull_day === todayDow)
  const autoFields = todayFields.filter(f => f.host)
  const manualOnlyFields = todayFields.filter(f => !f.host)

  if (todayFields.length === 0) {
    if (pullNow) {
      console.log('No runtime fields configured. Add some in the Sunday Ops admin settings.')
    } else {
      console.log(`No fields configured for ${DAY_NAMES[todayDow]}. Run with --now to pull all fields regardless of day.`)
    }
    process.exit(0)
  }

  console.log(`\nFields configured (${pullNow ? 'all' : DAY_NAMES[todayDow]}):`)
  todayFields.forEach(f => {
    if (f.host) {
      console.log(`  ${pullNow ? '' : f.pull_time + ' · '}"${f.label}" · ${f.host}:${f.port} clock index ${f.clock_number}`)
    } else {
      console.log(`  ${pullNow ? '' : f.pull_time + ' · '}"${f.label}" · manual entry only`)
    }
  })

  if (manualOnlyFields.length > 0) {
    console.log(`\nManual-only fields: ${manualOnlyFields.length}`)
  }

  if (autoFields.length === 0) {
    console.log('\nNo connected ProPresenter fields to pull. Manual-only runtimes must be entered in the app.')
    process.exit(0)
  }

  const sunday = await getOrCreateSunday(targetSundayDate)

  if (process.argv.includes('--probe')) {
    const hosts = [...new Set(autoFields.map(f => `${f.host}:${f.port}`))]
    for (const h of hosts) {
      const [host, port] = h.split(':')
      await probeProPresenter(host, parseInt(port))
    }
    return
  }

  if (dumpTimers) {
    console.log('\nDumping full timer objects from all connected ProPresenter hosts...')
    const hosts = [...new Set(autoFields.map(f => `${f.host}:${f.port}`))]
    for (const h of hosts) {
      const [host, port] = h.split(':')
      console.log(`\n--- ${host}:${port} ---`)
      try {
        const { timers } = await loadTimers(host, parseInt(port))
        console.log(JSON.stringify(timers, null, 2))
      } catch (err) {
        console.error(`  Error: ${err.message}`)
      }
    }
    return
  }

  if (pullNow) {
    console.log('\nPulling all connected fields now...')
    await pullFields(autoFields, sunday.id)
    console.log('\nDone.')
    return
  }

  const byTime = {}
  for (const field of autoFields) {
    if (!byTime[field.pull_time]) byTime[field.pull_time] = []
    byTime[field.pull_time].push(field)
  }

  const pullTimes = Object.keys(byTime).sort()
  console.log(`\nScheduled pulls: ${pullTimes.join(', ')}`)
  console.log('Waiting... (keep this terminal open, Ctrl+C to cancel)\n')

  for (const pullTime of pullTimes) {
    const waitMs = msUntil(pullTime)
    if (waitMs > 0) {
      const waitMin = Math.round(waitMs / 60000)
      console.log(`Waiting ${waitMin} minute${waitMin !== 1 ? 's' : ''} until ${pullTime}...`)
      await sleep(waitMs)
    } else {
      console.log(`Pull time ${pullTime} has passed — pulling now`)
    }

    console.log(`\n[${pullTime}] Pulling ${byTime[pullTime].length} field(s):`)
    byTime[pullTime].forEach(f => console.log(`  · ${f.label}`))
    await pullFields(byTime[pullTime], sunday.id)
  }

  console.log('\nAll pulls complete.')
}

run().catch(err => {
  console.error('Unexpected error:', err.message)
  process.exit(1)
})
