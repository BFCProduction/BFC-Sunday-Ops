#!/usr/bin/env node
/**
 * BFC Sunday Ops — ProPresenter Relay Script
 *
 * Reads clock values from ProPresenter's local network API and writes
 * them to the Supabase service_runtimes table.
 *
 * Usage:
 *   node scripts/propresenter-relay.js         # waits until configured pull time
 *   node scripts/propresenter-relay.js --now   # pulls immediately (for testing)
 *
 * Requires:
 *   SUPABASE_URL and SUPABASE_ANON_KEY in environment or .env.local
 */

const { createClient } = require('@supabase/supabase-js')
const https = require('https')
const http = require('http')

// Load .env.local if present
try {
  const fs = require('fs')
  const path = require('path')
  const envPath = path.join(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n')
    for (const line of lines) {
      const [key, ...rest] = line.split('=')
      if (key && rest.length) process.env[key.trim()] = rest.join('=').trim()
    }
  }
} catch {}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_ANON_KEY are required.')
  console.error('Add them to .env.local or set as environment variables.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const pullNow = process.argv.includes('--now')

function formatSeconds(totalSeconds) {
  if (totalSeconds == null || isNaN(totalSeconds)) return null
  const secs = Math.round(Math.abs(totalSeconds))
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http
    const req = lib.get(url, { timeout: 5000 }, res => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch (e) { reject(new Error(`Invalid JSON from ${url}`)) }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')) })
  })
}

function msUntil(hhmm) {
  const [hh, mm] = hhmm.split(':').map(Number)
  const now = new Date()
  const target = new Date()
  target.setHours(hh, mm, 0, 0)
  if (target <= now) target.setDate(target.getDate() + 1)
  return target - now
}

function todayDayOfWeek() {
  return new Date().getDay() // 0=Sunday
}

async function run() {
  console.log('BFC Sunday Ops — ProPresenter Relay')
  console.log('====================================')

  // Load config from Supabase
  console.log('Loading config from Supabase...')
  const { data: config, error: configErr } = await supabase
    .from('propresenter_config')
    .select('*')
    .eq('id', 1)
    .single()

  if (configErr || !config) {
    console.error('Could not load ProPresenter config from Supabase:', configErr?.message)
    process.exit(1)
  }

  console.log(`  ProPresenter: ${config.host}:${config.port}`)
  console.log(`  Pull schedule: ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][config.pull_day]} at ${config.pull_time}`)
  console.log(`  Clock mappings:`)
  console.log(`    9am Service Runtime  → clock ${config.clock_service1_runtime ?? '(not set)'}`)
  console.log(`    9am Message Runtime  → clock ${config.clock_service1_message ?? '(not set)'}`)
  console.log(`    11am Service Runtime → clock ${config.clock_service2_runtime ?? '(not set)'}`)
  console.log(`    11am Message Runtime → clock ${config.clock_service2_message ?? '(not set)'}`)
  console.log(`    Flip Time            → clock ${config.clock_flip_time ?? '(not set)'}`)

  if (!config.host) {
    console.error('\nError: ProPresenter host not configured. Set it in the Sunday Ops admin settings.')
    process.exit(1)
  }

  if (!pullNow) {
    const todayDow = todayDayOfWeek()
    if (todayDow !== config.pull_day) {
      const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
      console.log(`\nToday is ${days[todayDow]}. Configured to run on ${days[config.pull_day]}. Exiting.`)
      console.log('Run with --now to pull immediately regardless of day.')
      process.exit(0)
    }

    const waitMs = msUntil(config.pull_time)
    const waitMin = Math.round(waitMs / 60000)
    if (waitMs > 0) {
      console.log(`\nWaiting ${waitMin} minute${waitMin !== 1 ? 's' : ''} until ${config.pull_time}...`)
      console.log('(Keep this terminal open — Ctrl+C to cancel)')
      await new Promise(resolve => setTimeout(resolve, waitMs))
    }
  } else {
    console.log('\n--now flag set, pulling immediately')
  }

  // Get today's sunday_id from Supabase
  const today = new Date().toISOString().split('T')[0]
  console.log(`\nLooking up Sunday record for ${today}...`)
  const { data: sunday } = await supabase
    .from('sundays')
    .select('id')
    .eq('date', today)
    .single()

  if (!sunday) {
    console.error('No Sunday record found for today. Has the Sunday Ops Hub been opened today?')
    process.exit(1)
  }

  // Fetch clocks from ProPresenter
  const ppBase = `http://${config.host}:${config.port}/v1`
  console.log(`Connecting to ProPresenter at ${ppBase}...`)

  let clocks
  try {
    clocks = await fetchJSON(`${ppBase}/clocks`)
    if (!Array.isArray(clocks)) throw new Error('Unexpected response — is ProPresenter running?')
    console.log(`Found ${clocks.length} clock${clocks.length !== 1 ? 's' : ''}:`)
    clocks.forEach((c, i) => {
      const t = formatSeconds(c.current_time ?? c.time?.seconds)
      console.log(`  [${i + 1}] ${c.name ?? 'Unnamed'} — ${t ?? 'no time'}`)
    })
  } catch (err) {
    console.error(`\nCould not reach ProPresenter: ${err.message}`)
    console.error(`Make sure:`)
    console.error(`  1. ProPresenter is open and running`)
    console.error(`  2. Network API is enabled (Preferences → Network)`)
    console.error(`  3. IP ${config.host} and port ${config.port} are correct`)
    console.error(`  4. This computer is on the same network`)
    process.exit(1)
  }

  function getClockValue(clockNumber) {
    if (!clockNumber) return null
    const clock = clocks[clockNumber - 1]
    if (!clock) {
      console.warn(`  Warning: clock ${clockNumber} not found (only ${clocks.length} clocks available)`)
      return null
    }
    const secs = clock.current_time ?? clock.time?.seconds
    return formatSeconds(secs)
  }

  const runtimes = {
    sunday_id: sunday.id,
    service_1_runtime: getClockValue(config.clock_service1_runtime),
    service_1_message_runtime: getClockValue(config.clock_service1_message),
    service_2_runtime: getClockValue(config.clock_service2_runtime),
    service_2_message_runtime: getClockValue(config.clock_service2_message),
    flip_time: getClockValue(config.clock_flip_time),
    saved_at: new Date().toISOString(),
  }

  console.log('\nCaptured values:')
  console.log(`  9am Service Runtime  : ${runtimes.service_1_runtime ?? '—'}`)
  console.log(`  9am Message Runtime  : ${runtimes.service_1_message_runtime ?? '—'}`)
  console.log(`  11am Service Runtime : ${runtimes.service_2_runtime ?? '—'}`)
  console.log(`  11am Message Runtime : ${runtimes.service_2_message_runtime ?? '—'}`)
  console.log(`  Flip Time            : ${runtimes.flip_time ?? '—'}`)

  console.log('\nWriting to Supabase...')
  const { error: upsertErr } = await supabase
    .from('service_runtimes')
    .upsert(runtimes, { onConflict: 'sunday_id' })

  if (upsertErr) {
    console.error('Error writing to Supabase:', upsertErr.message)
    process.exit(1)
  }

  console.log('Done! Runtimes saved to Sunday Ops Hub.')
}

run().catch(err => {
  console.error('Unexpected error:', err.message)
  process.exit(1)
})
