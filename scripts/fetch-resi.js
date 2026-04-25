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
 * Service parsing and Supabase writes are shared with import-resi-csv.js so
 * browser automation and manual fallback produce the same analytics records.
 */

import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createSign, createPrivateKey } from 'crypto'
import {
  buildResiImportSummary,
  createImportRun,
  finishImportRun,
  writeResiSummaryToSupabase,
} from './lib/resi-import.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ─── Config ───────────────────────────────────────────────────────────────────

const CHURCH_TZ     = 'America/Chicago'
const SHEET_ID      = '14mhrHNRkL6GkBxS78xIyAHKEXNrZ_Uy4-KmivuJKxfw'
const ARTIFACT_DIR  = process.env.RESI_ARTIFACT_DIR || join(__dirname, '..', 'artifacts', 'resi')

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

// ─── Google Sheets write-back ─────────────────────────────────────────────────

async function getGoogleToken() {
  const email  = process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
  if (!email || !rawKey) return null

  // Normalize the key — GitHub Secrets may deliver literal \n instead of real newlines,
  // and sometimes the value arrives with surrounding quotes or without PEM headers.
  let key = rawKey
    .replace(/^["']|["']$/g, '')   // strip wrapping quotes if any
    .replace(/\\n/g, '\n')          // convert escaped \n to real newlines
    .trim()

  // If the key is just the base64 body (no PEM headers), wrap it
  if (!key.includes('-----BEGIN')) {
    key = `-----BEGIN PRIVATE KEY-----\n${key}\n-----END PRIVATE KEY-----`
  }

  const now     = Math.floor(Date.now() / 1000)
  const payload = {
    iss: email, scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now,
  }
  const enc      = obj => Buffer.from(JSON.stringify(obj)).toString('base64url')
  const unsigned = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc(payload)}`

  // Try multiple key formats — service accounts use PKCS#8 but fall back gracefully
  let privateKey
  const keyAttempts = [
    // Standard PKCS#8 PEM (Google service account default)
    () => createPrivateKey({ key, format: 'pem' }),
    // PKCS#1 RSA PEM (older key format)
    () => createPrivateKey({
      key: key.replace('-----BEGIN PRIVATE KEY-----', '-----BEGIN RSA PRIVATE KEY-----')
               .replace('-----END PRIVATE KEY-----', '-----END RSA PRIVATE KEY-----'),
      format: 'pem',
    }),
    // Raw base64 body → DER PKCS#8
    () => {
      const body = key.replace(/-----[^-]+-----/g, '').replace(/\s/g, '')
      return createPrivateKey({ key: Buffer.from(body, 'base64'), format: 'der', type: 'pkcs8' })
    },
    // Raw base64 body → DER PKCS#1
    () => {
      const body = key.replace(/-----[^-]+-----/g, '').replace(/\s/g, '')
      return createPrivateKey({ key: Buffer.from(body, 'base64'), format: 'der', type: 'pkcs1' })
    },
  ]
  for (const attempt of keyAttempts) {
    try { privateKey = attempt(); break } catch {}
  }
  if (!privateKey) {
    console.warn('Google Sheets: could not parse private key in any supported format — skipping.')
    console.warn('Expected: the private_key value from a Google service account JSON file.')
    return null
  }
  const sig = createSign('RSA-SHA256').update(unsigned).sign(privateKey, 'base64')
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

// Maps SERVICE_NAMES → sheet tab names
const SHEET_TABS = {
  'Traditional':   '9am Service',
  'Contemporary':  '11am Service',
}

async function writeServiceToSheet(token, sheetDate, tabName, views, unique, avgSecs) {
  const encoded = encodeURIComponent(tabName)

  // Read column A to find the matching date row
  const colA = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encoded}!A:A`,
    { headers: { Authorization: `Bearer ${token}` } }
  ).then(r => r.json())

  const rowIdx = (colA.values ?? []).findIndex(r => r[0] === sheetDate)
  if (rowIdx === -1) {
    console.log(`  ${tabName}: row for ${sheetDate} not found — skipping.`)
    return
  }
  const rowNum = rowIdx + 1
  const avgMins = avgSecs != null ? Math.round(avgSecs / 60) : ''

  // Write J (Views), K (Unique Viewers), L (AVG Watch Time in minutes)
  const writeRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encoded}!J${rowNum}:L${rowNum}?valueInputOption=RAW`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [[views, unique, avgMins]] }),
    }
  )
  if (!writeRes.ok) {
    const errBody = await writeRes.json().catch(() => ({}))
    console.warn(`  ${tabName}: write failed (${writeRes.status}): ${errBody?.error?.message ?? writeRes.statusText}`)
    return
  }
  console.log(`  ${tabName} row ${rowNum}: Views=${views}, Unique=${unique}, AvgWatch=${avgMins}min`)
}

async function writeToSheet(sundayDate, eventStats) {
  try {
    const token = await getGoogleToken()
    if (!token) { console.log('No Google credentials — skipping sheet write.'); return }

    // Date format in the sheet: M/D/YYYY (no leading zeros)
    const [yyyy, mm, dd] = sundayDate.split('-')
    const sheetDate = `${parseInt(mm)}/${parseInt(dd)}/${yyyy}`

    console.log(`Writing to Google Sheets for ${sheetDate}:`)
    for (const ev of eventStats) {
      const tab = SHEET_TABS[ev.name]
      if (!tab) { console.log(`  No sheet tab mapped for service "${ev.name}" — skipping.`); continue }
      await writeServiceToSheet(token, sheetDate, tab, ev.totalViews, ev.uniqueViewers, ev.avgWatchSeconds)
    }
  } catch (err) {
    console.warn('Google Sheets write failed (non-fatal):', err.message)
  }
}

// ─── Browser automation ───────────────────────────────────────────────────────

async function downloadResiCsv(targetSunday) {
  const [yyyy, mm, dd] = targetSunday.split('-')
  const resiDate = `${mm}/${dd}/${yyyy}` // RESI date picker format: MM/DD/YYYY
  mkdirSync(ARTIFACT_DIR, { recursive: true })
  const csvArtifactPath = join(ARTIFACT_DIR, `resi-${targetSunday}.csv`)
  const screenshotPath = join(ARTIFACT_DIR, `resi-debug-${targetSunday}.png`)

  const browser = await chromium.launch({ headless: true })
  let csvText = null
  let page = null

  try {
    const context = await browser.newContext({ acceptDownloads: true })
    page = await context.newPage()
    page.setDefaultTimeout(30000)

    // ── Navigate to analytics (handles login inline if needed) ───────────────
    // RESI is a SPA — the login form renders at the target URL when the user
    // is unauthenticated (no separate /login route). We wait for EITHER the
    // login form OR the analytics elements, whichever appears first.
    console.log('Navigating to RESI analytics...')
    await page.goto('https://studio.resi.io/analytics', { waitUntil: 'load' })

    // Race: login form vs analytics page
    // The login form uses type="text" (not "email") for the username field.
    const loginInputSelector  = 'input[type="text"], input[type="email"]'
    const analyticsSelector   = '.rui-date-picker'

    const whichLoaded = await Promise.race([
      page.waitForSelector(loginInputSelector,  { state: 'visible', timeout: 25000 }).then(() => 'login'),
      page.waitForSelector(analyticsSelector,   { state: 'visible', timeout: 25000 }).then(() => 'analytics'),
    ]).catch(() => 'timeout')

    console.log(`Page state after navigation: ${whichLoaded}`)

    if (whichLoaded === 'timeout') {
      throw new Error('Neither login form nor analytics page appeared within 25 seconds.')
    }

    if (whichLoaded === 'login') {
      console.log('Login form detected, authenticating...')
      // Fill username (type="text") then password
      await page.locator('input[type="text"], input[type="email"]').first().fill(RESI_EMAIL)
      await page.locator('input[type="password"]').first().fill(RESI_PASSWORD)
      await page.locator('button[type="submit"]').click()

      // Wait for the post-login state — either lands on dashboard or stays on analytics
      await page.waitForLoadState('load').catch(() => {})
      await page.waitForTimeout(3000)

      // Navigate to analytics if redirected to dashboard
      if (!page.url().includes('analytics')) {
        console.log(`Post-login URL: ${page.url()} — navigating to analytics`)
        await page.goto('https://studio.resi.io/analytics', { waitUntil: 'load' })
      }

      // Final confirmation the analytics page is ready
      await page.waitForSelector(analyticsSelector, { timeout: 20000 })
    }

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
    await page.waitForLoadState('load').catch(() => {})
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
    writeFileSync(csvArtifactPath, csvText)
    console.log(`CSV artifact saved to ${csvArtifactPath}`)
    console.log(`Downloaded ${csvText.split('\n').length - 1} rows.`)

  } catch (err) {
    if (page) {
      try {
        await page.screenshot({ path: screenshotPath, fullPage: true })
        console.error(`Debug screenshot saved to ${screenshotPath}`)
      } catch {}
    }
    throw err
  } finally {
    await browser.close()
  }

  return { csvText, csvArtifactPath }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log('BFC Sunday Ops — RESI Analytics Import')
  console.log('========================================')

  const targetSunday = getTargetSunday()
  console.log(`Target Sunday: ${targetSunday}${dryRun ? ' [DRY RUN]' : ''}`)

  let importRunId = null
  let artifactPath = null
  let rowsParsed = 0
  let rowsWritten = 0

  if (!dryRun) {
    importRunId = await createImportRun(supabase, 'resi', targetSunday)
  }

  try {
    // ── Download + parse ──────────────────────────────────────────────────────
    const download = await downloadResiCsv(targetSunday)
    artifactPath = download.csvArtifactPath
    const summary = buildResiImportSummary(download.csvText)
    rowsParsed = summary.allRows.length

    console.log(`Parsed ${summary.allRows.length} session rows.`)
    console.log(`LIVE: ${summary.liveRows.length} rows  |  On-demand excluded: ${summary.onDemandRows.length}`)

    if (summary.liveRows.length === 0) {
      console.log('No LIVE event rows found for this Sunday. Exiting.')
      await finishImportRun(supabase, importRunId, 'skipped', {
        rowsParsed,
        rowsWritten,
        artifactPath,
        error: 'No LIVE event rows found for target date.',
      })
      return
    }

    console.log(`\nFound ${summary.eventStats.length} service event(s):`)
    for (const event of summary.eventStats) {
      console.log(
        `  ${event.name} (${event.time}): ${event.uniqueViewers} unique, ${event.totalViews} views,` +
        ` ${event.avgWatchSeconds ?? '?'}s avg watch, ${event.peakConcurrent ?? '?'} peak concurrent`
      )
    }
    console.log(`  Sunday total: ${summary.totalUnique} unique viewers, ${summary.totalViews} total views\n`)

    if (dryRun) {
      console.log('[Dry run] No data written.')
      return
    }

    // ── Supabase writes ───────────────────────────────────────────────────────
    const result = await writeResiSummaryToSupabase(supabase, targetSunday, summary)
    rowsWritten = result.rowsWritten
    console.log(`Supabase writes complete. Rows written/updated: ${rowsWritten}`)

    await finishImportRun(supabase, importRunId, 'succeeded', {
      rowsParsed,
      rowsWritten,
      artifactPath,
    })

    // ── Google Sheets ─────────────────────────────────────────────────────────
    await writeToSheet(targetSunday, summary.eventStats)
  } catch (err) {
    await finishImportRun(supabase, importRunId, 'failed', {
      rowsParsed,
      rowsWritten,
      artifactPath,
      error: err instanceof Error ? err.message : String(err),
    })
    throw err
  }

  console.log('\nDone.')
}

run().catch(err => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
