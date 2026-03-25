#!/usr/bin/env node
/**
 * BFC Sunday Ops — RESI Analytics Import
 *
 * Logs into RESI, downloads the session-level analytics CSV for the target
 * Sunday, computes per-service stats, and writes them to Supabase.
 * Optionally writes Church Online unique viewer totals back to the Google Sheet.
 *
 * Usage:
 *   node scripts/fetch-resi.js              # most recent Sunday
 *   node scripts/fetch-resi.js --now        # this calendar Sunday (good for testing)
 *   node scripts/fetch-resi.js --date 2026-03-22   # specific Sunday
 *   node scripts/fetch-resi.js --dry-run    # parse and print, no DB or sheet writes
 *
 * Required env:
 *   RESI_EMAIL, RESI_PASSWORD
 *   SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_SERVICE_KEY
 *
 * Optional env (Google Sheets write-back):
 *   GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL
 *   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
 *
 * Service names are assigned by temporal order of viewer sessions:
 *   1st event (earliest timestamps) → 'Traditional'
 *   2nd event                       → 'Contemporary'
 * Adjust SERVICE_NAMES below if your service order or names differ.
 */

import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createSign } from 'crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ─── Config ───────────────────────────────────────────────────────────────────

const SERVICE_NAMES = ['Traditional', 'Contemporary']
const SERVICE_TIMES = ['9:00 AM', '11:00 AM']
const CHURCH_TZ     = 'America/Chicago'
const SHEET_ID      = '14mhrHNRkL6GkBxS78xIyAHKEXNrZ_Uy4-KmivuJKxfw'

// ─── Bootstrap ────────────────────────────────────────────────────────────────

try {
  const envPath = join(__dirname, '..', '.env.local')
  if (existsSync(envPath)) {
    readFileSync(envPath, 'utf8').split('\n').forEach(line => {
      const [key, ...rest] = line.split('=')
      if (key?.trim() && rest.length) process.env[key.trim()] = rest.join('=').trim()
    })
  }
} catch {}

const SUPABASE_URL  = process.env.SUPABASE_URL  || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
const RESI_EMAIL    = process.env.RESI_EMAIL
const RESI_PASSWORD = process.env.RESI_PASSWORD

const args    = process.argv.slice(2)
const dryRun  = args.includes('--dry-run')
const pullNow = args.includes('--now')
const dateArg = (() => {
  const idx = args.indexOf('--date')
  if (idx !== -1) return args[idx + 1] ?? null
  return args.find(a => a.startsWith('--date='))?.split('=')[1] ?? null
})()

if (!RESI_EMAIL || !RESI_PASSWORD) {
  console.error('Error: RESI_EMAIL and RESI_PASSWORD are required.')
  process.exit(1)
}
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_KEY are required.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ─── Date helpers ─────────────────────────────────────────────────────────────

function toChurchDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CHURCH_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date)
}

function getTargetSunday() {
  if (dateArg) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) {
      console.error('--date must be YYYY-MM-DD'); process.exit(1)
    }
    return dateArg
  }

  const now     = new Date()
  const parts   = new Intl.DateTimeFormat('en-US', {
    timeZone: CHURCH_TZ, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const dow = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(
    parts.find(p => p.type === 'weekday')?.value ?? ''
  )

  if (pullNow || dow === 0) return toChurchDateString()

  // Most recent Sunday
  const d = new Date(now)
  d.setDate(d.getDate() - dow)
  return toChurchDateString(d)
}

// ─── CSV parser ───────────────────────────────────────────────────────────────

function parseCsvLine(line) {
  const out = []
  let cur = '', inQ = false
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ }
    else if (ch === ',' && !inQ) { out.push(cur); cur = '' }
    else { cur += ch }
  }
  out.push(cur)
  return out.map(v => v.trim().replace(/^"|"$/g, ''))
}

function parseCSV(text) {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []
  const headers = parseCsvLine(lines[0])
  return lines.slice(1)
    .map(line => Object.fromEntries(headers.map((h, i) => [h, parseCsvLine(line)[i] ?? ''])))
    .filter(row => row.eventId)
}

// ─── Stats ────────────────────────────────────────────────────────────────────

function computeStats(rows) {
  const uniqueViewers = new Set(rows.map(r => r.clientId).filter(Boolean)).size
  const totalViews    = rows.length
  const durations     = rows.map(r => parseInt(r.totalTimeWatchedSeconds)).filter(n => n > 0)
  const avgWatchSeconds = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : null

  // Peak concurrent via sweep line.
  // Assumes timestamp = session end; session start = timestamp − totalTimeWatchedSeconds.
  // If RESI's timestamp turns out to be session start, swap the sign below.
  const events = []
  for (const row of rows) {
    const endMs  = new Date(row.timestamp).getTime()
    const durMs  = (parseInt(row.totalTimeWatchedSeconds) || 0) * 1000
    if (isNaN(endMs) || durMs <= 0) continue
    events.push([endMs - durMs, +1])
    events.push([endMs,         -1])
  }
  events.sort((a, b) => a[0] - b[0])
  let peak = 0, cur = 0
  for (const [, delta] of events) { cur += delta; if (cur > peak) peak = cur }

  return { uniqueViewers, totalViews, avgWatchSeconds, peakConcurrent: peak || null }
}

// ─── Supabase ─────────────────────────────────────────────────────────────────

async function getOrCreateSunday(dateString) {
  const { data: existing } = await supabase
    .from('sundays').select('id, date').eq('date', dateString).maybeSingle()
  if (existing) return existing
  const { data, error } = await supabase
    .from('sundays').insert({ date: dateString }).select('id, date').single()
  if (error) throw error
  return data
}

// ─── Google Sheets write-back ─────────────────────────────────────────────────

async function getGoogleToken() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL
  const key   = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!email || !key) return null

  const now     = Math.floor(Date.now() / 1000)
  const payload = {
    iss: email, scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now,
  }
  const enc     = obj => Buffer.from(JSON.stringify(obj)).toString('base64url')
  const unsigned = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc(payload)}`
  const sig = createSign('RSA-SHA256').update(unsigned).sign(key, 'base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  const res  = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${sig}`,
    }),
  })
  const json = await res.json()
  return json.access_token ?? null
}

async function writeToSheet(sundayDate, totalViews, totalUnique) {
  try {
    const token = await getGoogleToken()
    if (!token) { console.log('No Google credentials — skipping sheet write.'); return }

    // Date format in the sheet: M/D/YYYY (no leading zeros)
    const [yyyy, mm, dd] = sundayDate.split('-')
    const sheetDate = `${parseInt(mm)}/${parseInt(dd)}/${yyyy}`

    // Find the row index
    const colA = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Sheet1!A:A`,
      { headers: { Authorization: `Bearer ${token}` } }
    ).then(r => r.json())

    const rowIdx = (colA.values ?? []).findIndex(r => r[0] === sheetDate)
    if (rowIdx === -1) {
      console.log(`Sheet row for ${sheetDate} not found — skipping.`)
      return
    }
    const rowNum = rowIdx + 1

    // Write Church Online Views (col J) and Unique Viewers (col K)
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Sheet1!J${rowNum}:K${rowNum}?valueInputOption=RAW`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [[totalViews, totalUnique]] }),
      }
    )
    console.log(`Google Sheet row ${rowNum} updated: Views=${totalViews}, UniqueViewers=${totalUnique}`)
  } catch (err) {
    console.warn('Google Sheets write failed (non-fatal):', err.message)
  }
}

// ─── Browser automation ───────────────────────────────────────────────────────

async function downloadResiCsv(targetSunday) {
  const [yyyy, mm, dd] = targetSunday.split('-')
  const resiDate = `${mm}/${dd}/${yyyy}` // RESI date picker format: MM/DD/YYYY

  const browser = await chromium.launch({ headless: true })
  let csvText = null
  let page = null

  try {
    const context = await browser.newContext({ acceptDownloads: true })
    page = await context.newPage()
    page.setDefaultTimeout(30000)

    // ── Navigate to analytics (handles login inline if needed) ───────────────
    // RESI is a SPA that renders the login form at the destination URL when
    // unauthenticated, rather than redirecting to a /login route.
    console.log('Navigating to RESI analytics...')
    await page.goto('https://studio.resi.io/analytics', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    // Detect login form — fill credentials if present
    const emailInput = page.locator('input[type="email"], input[name="email"]').first()
    if (await emailInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('Login form detected, authenticating...')
      await emailInput.fill(RESI_EMAIL)
      await page.locator('input[type="password"], input[name="password"]').first().fill(RESI_PASSWORD)
      await page.locator('button[type="submit"]').click()

      // Wait for post-login redirect (may go to dashboard first)
      await page.waitForTimeout(5000)
      await page.waitForLoadState('domcontentloaded')

      // If login sent us to the dashboard, navigate back to analytics
      if (!page.url().includes('analytics')) {
        console.log(`Post-login URL: ${page.url()} — navigating to analytics`)
        await page.goto('https://studio.resi.io/analytics', { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(2000)
      }
    }

    // Wait for the analytics page elements (confirms successful auth + render)
    await page.waitForSelector('.rui-date-picker', { timeout: 20000 })
    console.log(`Analytics page ready at ${page.url()}`)

    // ── Set date range to target Sunday ───────────────────────────────────────
    // The date picker contains two text inputs (start, end) with MM/DD/YYYY format.
    // We set both to the same Sunday date to get just that day's data.
    console.log(`Setting date range to ${resiDate}...`)
    const dateInputs = page.locator('.rui-date-picker input[placeholder="MM/DD/YYYY"]')

    // Fill start date
    await dateInputs.nth(0).click()
    await dateInputs.nth(0).selectText()
    await dateInputs.nth(0).fill(resiDate)
    await page.keyboard.press('Tab')
    await page.waitForTimeout(300)

    // Fill end date
    await dateInputs.nth(1).click()
    await dateInputs.nth(1).selectText()
    await dateInputs.nth(1).fill(resiDate)
    await page.keyboard.press('Tab')

    // Wait for data to reload after date change
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(2000)
    console.log('Date range set.')

    // Make sure we're on the Embed Player tab (default, but be explicit)
    const embedTab = page.locator('button:has-text("Embed Player")').first()
    if (await embedTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await embedTab.click()
      await page.waitForTimeout(1000)
    }

    // ── Download CSV ──────────────────────────────────────────────────────────
    console.log('Clicking Export Data...')
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30000 }),
      page.locator('button[aria-label="Export Data"]').first().click(),
    ])

    const dlPath = await download.path()
    if (!dlPath) throw new Error('Download path is null — file may not have saved correctly.')
    csvText = readFileSync(dlPath, 'utf8')
    console.log(`Downloaded ${csvText.split('\n').length - 1} rows.`)

  } catch (err) {
    if (page) {
      try {
        await page.screenshot({ path: '/tmp/resi-debug.png', fullPage: true })
        console.error('Debug screenshot saved to /tmp/resi-debug.png')
      } catch {}
    }
    throw err
  } finally {
    await browser.close()
  }

  return csvText
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log('BFC Sunday Ops — RESI Analytics Import')
  console.log('========================================')

  const targetSunday = getTargetSunday()
  console.log(`Target Sunday: ${targetSunday}${dryRun ? ' [DRY RUN]' : ''}`)

  // ── Download + parse ────────────────────────────────────────────────────────
  const csvText = await downloadResiCsv(targetSunday)
  const allRows = parseCSV(csvText)
  console.log(`Parsed ${allRows.length} session rows.`)

  const liveRows = allRows.filter(r => r.eventType === 'LIVE')
  const odRows   = allRows.filter(r => r.eventType !== 'LIVE')
  console.log(`LIVE: ${liveRows.length} rows  |  On-demand excluded: ${odRows.length}`)

  if (liveRows.length === 0) {
    console.log('No LIVE event rows found for this Sunday. Exiting.')
    process.exit(0)
  }

  // ── Group by eventId, sort by earliest timestamp ────────────────────────────
  const byEvent = new Map()
  for (const row of liveRows) {
    if (!byEvent.has(row.eventId)) byEvent.set(row.eventId, [])
    byEvent.get(row.eventId).push(row)
  }

  const sortedEvents = [...byEvent.entries()]
    .map(([eventId, rows]) => {
      const ts = rows.map(r => new Date(r.timestamp).getTime()).filter(t => !isNaN(t))
      ts.sort((a, b) => a - b)
      return { eventId, rows, earliestTs: ts[0] ?? Infinity }
    })
    .sort((a, b) => a.earliestTs - b.earliestTs)

  // ── Compute stats ───────────────────────────────────────────────────────────
  console.log(`\nFound ${sortedEvents.length} service event(s):`)
  const eventStats = sortedEvents.map(({ rows }, i) => {
    const name  = SERVICE_NAMES[i] ?? `Service ${i + 1}`
    const time  = SERVICE_TIMES[i] ?? ''
    const stats = computeStats(rows)
    console.log(
      `  ${name} (${time}): ${stats.uniqueViewers} unique, ${stats.totalViews} views,` +
      ` ${stats.avgWatchSeconds ?? '?'}s avg watch, ${stats.peakConcurrent ?? '?'} peak concurrent`
    )
    return { name, time, ...stats }
  })

  const totalViews  = eventStats.reduce((s, e) => s + e.totalViews, 0)
  const totalUnique = eventStats.reduce((s, e) => s + e.uniqueViewers, 0)
  const maxPeak     = Math.max(...eventStats.map(e => e.peakConcurrent ?? 0)) || null
  console.log(`  Sunday total: ${totalUnique} unique viewers, ${totalViews} total views\n`)

  if (dryRun) {
    console.log('[Dry run] No data written.')
    return
  }

  // ── Supabase writes ─────────────────────────────────────────────────────────
  const sunday = await getOrCreateSunday(targetSunday)

  for (const ev of eventStats) {
    const { error } = await supabase.from('resi_events').upsert({
      sunday_id:         sunday.id,
      service_name:      ev.name,
      service_time:      ev.time,
      unique_viewers:    ev.uniqueViewers,
      total_views:       ev.totalViews,
      peak_concurrent:   ev.peakConcurrent,
      avg_watch_seconds: ev.avgWatchSeconds,
      pulled_at:         new Date().toISOString(),
    }, { onConflict: 'sunday_id,service_name' })
    if (error) throw new Error(`resi_events upsert (${ev.name}): ${error.message}`)
  }
  console.log('resi_events written.')

  // Update stream_analytics rollup (only resi columns — leaves youtube untouched)
  const { error: saErr } = await supabase.from('stream_analytics').upsert({
    sunday_id:         sunday.id,
    resi_peak:         maxPeak,
    resi_unique_total: totalUnique,
    pulled_at:         new Date().toISOString(),
  }, { onConflict: 'sunday_id' })
  if (saErr) console.warn('stream_analytics upsert warning:', saErr.message)
  else       console.log('stream_analytics rollup updated.')

  // ── Google Sheets ───────────────────────────────────────────────────────────
  await writeToSheet(targetSunday, totalViews, totalUnique)

  console.log('\nDone.')
}

run().catch(err => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
