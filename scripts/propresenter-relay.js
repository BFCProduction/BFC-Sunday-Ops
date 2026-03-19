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
    const req = get(url, { timeout: 5000 }, res => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
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

// ─── Probe ProPresenter to find working API path ─────────────────────────────

async function probeProPresenter(host, port) {
  const base = `http://${host}:${port}`
  const paths = [
    '/v1/timers/current',
    '/v1/timers',
    '/v1/timer',
    '/v1/clocks',
    '/v1/',
    '/',
  ]
  console.log(`\nProbing ${base} for ProPresenter API...`)
  for (const p of paths) {
    try {
      const result = await fetchRaw(`${base}${p}`)
      console.log(`  ${p} → HTTP ${result.status}: ${result.body.slice(0, 200)}`)
    } catch (err) {
      console.log(`  ${p} → Error: ${err.message}`)
    }
  }
}

function fetchRaw(url) {
  return new Promise((resolve, reject) => {
    const get = url.startsWith('https') ? httpsGet : httpGet
    const req = get(url, { timeout: 3000 }, res => {
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
    try {
      let raw
      try {
        raw = await fetchJSON(`${ppBase}/v1/timers/current`)
      } catch {
        raw = await fetchJSON(`${ppBase}/v1/timers`)
      }
      timers = Array.isArray(raw) ? raw : raw?.timers ?? raw?.data ?? []
      if (!Array.isArray(timers)) throw new Error('Unexpected response format')
      console.log(`  Found ${timers.length} timer${timers.length !== 1 ? 's' : ''}`)
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
      const value = extractTime(timer)
      const timerName = timer.id?.name ?? timer.name ?? 'Unnamed'
      console.log(`  "${field.label}" → timer index ${field.clock_number} (${timerName}) = ${value ?? 'no time'}`)
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
  const today = getChurchDateString()

  const { data: allFields, error: fieldsErr } = await supabase
    .from('runtime_fields')
    .select('*')
    .order('pull_time', { ascending: true })

  if (fieldsErr || !allFields) {
    console.error('Could not load runtime fields:', fieldsErr?.message)
    process.exit(1)
  }

  const todayFields = pullNow
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

  const { data: sunday } = await supabase
    .from('sundays')
    .select('id')
    .eq('date', today)
    .single()

  if (!sunday) {
    console.error(`\nNo Sunday record found for ${today}.`)
    console.error('Make sure the Sunday Ops Hub has been opened today to create the daily record.')
    process.exit(1)
  }

  if (process.argv.includes('--probe')) {
    const hosts = [...new Set(autoFields.map(f => `${f.host}:${f.port}`))]
    for (const h of hosts) {
      const [host, port] = h.split(':')
      await probeProPresenter(host, parseInt(port))
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
