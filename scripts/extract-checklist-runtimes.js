#!/usr/bin/env node
/**
 * extract-checklist-runtimes.js
 *
 * Reads every "YYYY.MM.DD - Gameday Checklist.pdf" in the Prod Doc Archive,
 * extracts service runtime, message runtime, and stage flip time from the
 * Service Data section, then upserts the values into service_records.
 *
 * Usage:
 *   node scripts/extract-checklist-runtimes.js          # dry run (print only)
 *   node scripts/extract-checklist-runtimes.js --write  # commit to Supabase
 */

import { execSync } from 'child_process'
import { readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

// ── Config ────────────────────────────────────────────────────────────────────

const ARCHIVE_DIR =
  '/Users/alanbrown/Library/CloudStorage/GoogleDrive-abrown@bethanynaz.org/' +
  'My Drive/00 BFC Production/04 Production Documentation/01 Prod Doc Archive'

const WRITE = process.argv.includes('--write')

const envPath = new URL('../.env.local', import.meta.url).pathname
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => l.split('=').map(s => s.trim()))
    .map(([k, ...v]) => [k, v.join('=')])
)

const supabase = createClient(
  env.VITE_SUPABASE_URL,
  env.SUPABASE_SERVICE_KEY || env.VITE_SUPABASE_ANON_KEY
)

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert HH:MM:SS or H:MM:SS or MM:SS or M:SS to total seconds */
function parseTime(raw) {
  if (!raw) return null
  const parts = raw.trim().split(':').map(Number)
  if (parts.some(isNaN)) return null
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return null
}

/** Extract text from a PDF using pdftotext (poppler) or python pdfplumber */
function extractPdfText(pdfPath) {
  try {
    // Try pdftotext first (fast)
    return execSync(`pdftotext "${pdfPath}" -`, { encoding: 'utf8', stdio: ['pipe','pipe','ignore'] })
  } catch {
    // Fall back to Python pdfplumber
    const script = `
import pdfplumber, sys
with pdfplumber.open(sys.argv[1]) as pdf:
    print('\\n'.join(p.extract_text() or '' for p in pdf.pages))
`
    return execSync(`python3 -c ${JSON.stringify(script)} "${pdfPath}"`, { encoding: 'utf8' })
  }
}

/**
 * Parse the Service Data section from the full PDF text.
 * Returns { runtime9am, msgRuntime9am, runtime11am, msgRuntime11am, stageFlip }
 * All values in seconds (integers), or null if not found.
 *
 * Two formats exist, detected by label content in the Service Data block:
 *
 * ── 2026+ (explicit-label format) ─────────────────────────────────────────────
 * Labels are listed first in defined order:
 *   "9am Service Runtime (HH:MM:SS)"
 *   "9am Message Runtime (HH:MM:SS)"
 *   "11am Service Runtime (HH:MM:SS)"
 *   "11amMessage Runtime (HH:MM:SS)"
 *   "Flip time (MM:SS)"
 * Then the actual values follow as standalone time lines in the same order.
 * Positional mapping: values[0]=9am svc, [1]=9am msg, [2]=11am svc,
 *                     [3]=11am msg, [4]=flip.
 * Stage flip is within the service data block (before Outside Temperature).
 *
 * ── Legacy (2021–2025, positional format) ─────────────────────────────────────
 * Row labels ("9:00:00 am Runtime…") have no time on the same line.
 * Standalone time lines in the block are positionally: [0]=9am svc, [1]=11am svc.
 * Message runtimes appear on lines containing "message" + a time.
 * Stage flip appears later in the document as "Stage Flip Time - MM:SS".
 */
function parseServiceData(text) {
  const result = {
    runtime9am:    null,
    msgRuntime9am: null,
    runtime11am:   null,
    msgRuntime11am: null,
    stageFlip:     null,
  }

  // Normalise: collapse multiple spaces, drop blank lines
  const lines = text
    .replace(/\r/g, '')
    .split('\n')
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(l => l.length > 0)

  // A line that is ONLY a time value
  const PURE_TIME = /^\d+:\d{2}(?::\d{2})?$/
  // A time value anywhere in a line
  const TIME_IN_LINE = /(\d+:\d{2}(?::\d{2})?)/

  // ── Locate the Service Data block ─────────────────────────────────────────
  const sdStart = lines.findIndex(l => /^Service\s+Data$/i.test(l))

  if (sdStart >= 0) {
    // Block ends at "Outside Temperature" (or a generous window)
    let sdEnd = lines.findIndex((l, i) => i > sdStart + 3 && /Outside\s+Temperature/i.test(l))
    if (sdEnd < 0) sdEnd = Math.min(sdStart + 60, lines.length)

    const sdLines = lines.slice(sdStart + 1, sdEnd)

    // Detect 2026+ format: explicit "9am Service Runtime" label present
    const is2026 = sdLines.some(l => /9am\s+service\s+runtime/i.test(l))

    // All standalone time values in the block, in order
    const times = []
    for (const line of sdLines) {
      if (PURE_TIME.test(line)) times.push(parseTime(line))
    }

    if (is2026) {
      // Positional mapping: [0]=9am svc, [1]=9am msg, [2]=11am svc,
      //                     [3]=11am msg, [4]=flip
      if (times[0] != null) result.runtime9am    = times[0]
      if (times[1] != null) result.msgRuntime9am = times[1]
      if (times[2] != null) result.runtime11am   = times[2]
      if (times[3] != null) result.msgRuntime11am = times[3]
      if (times[4] != null) result.stageFlip      = times[4]
    } else {
      // Legacy: [0]=9am svc, [1]=11am svc
      if (times[0] != null) result.runtime9am  = times[0]
      if (times[1] != null) result.runtime11am = times[1]

      // Message runtimes: lines containing "message" + a time, in order
      const msgTimes = []
      for (const line of sdLines) {
        if (/message/i.test(line)) {
          const m = line.match(TIME_IN_LINE)
          if (m) msgTimes.push(parseTime(m[1]))
        }
      }
      if (msgTimes[0] != null) result.msgRuntime9am  = msgTimes[0]
      if (msgTimes[1] != null) result.msgRuntime11am = msgTimes[1]
    }
  }

  // ── Stage flip (legacy): "Stage Flip Time - MM:SS" anywhere in document ───
  // (2026 flip is captured above from sdLines; skip if already found)
  if (result.stageFlip == null) {
    for (const line of lines) {
      if (/stage\s+flip/i.test(line)) {
        const m = line.match(TIME_IN_LINE)
        if (m) { result.stageFlip = parseTime(m[1]); break }
      }
    }
  }

  return result
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log('BFC Sunday Ops — extract-checklist-runtimes')
console.log('Mode:', WRITE ? 'WRITE' : 'DRY RUN')
console.log()

// Find all Gameday Checklist PDFs
const allFolders = readdirSync(ARCHIVE_DIR).filter(f => /^\d{4}\.\d{2}\.\d{2}/.test(f)).sort()
const pdfs = []
for (const folder of allFolders) {
  const folderPath = join(ARCHIVE_DIR, folder)
  let pdf = null
  try {
    const files = readdirSync(folderPath)
    pdf = files.find(f => /Gameday Checklist/i.test(f) && f.endsWith('.pdf'))
  } catch { continue }
  if (pdf) pdfs.push({ folder, date: folder.slice(0, 10).replace(/\./g, '-'), path: join(folderPath, pdf) })
}

console.log(`Found ${pdfs.length} Gameday Checklist PDFs\n`)

// Parse each PDF
const extracted = []
let parseErrors = 0

for (const { folder, date, path } of pdfs) {
  try {
    const text = extractPdfText(path)
    const data = parseServiceData(text)

    const hasAny = Object.values(data).some(v => v !== null)
    if (!hasAny) continue  // skip PDFs with no parseable time data

    extracted.push({ date, ...data })
  } catch (err) {
    console.error(`  Error parsing ${folder}: ${err.message}`)
    parseErrors++
  }
}

console.log(`Parsed ${extracted.length} PDFs with data, ${parseErrors} errors\n`)

// Print summary table
const withMsg  = extracted.filter(r => r.msgRuntime9am || r.msgRuntime11am).length
const withFlip = extracted.filter(r => r.stageFlip).length
console.log(`  With service runtimes : ${extracted.filter(r => r.runtime9am || r.runtime11am).length}`)
console.log(`  With message runtimes : ${withMsg}`)
console.log(`  With stage flip time  : ${withFlip}`)
console.log()

// Print first 5 rows as sample
console.log('Sample output (first 5):')
for (const row of extracted.slice(0, 5)) {
  const fmt = s => s == null ? '—' : `${Math.floor(s/60)}m ${s%60}s`
  console.log(
    `  ${row.date}` +
    `  9am: ${fmt(row.runtime9am)} / msg ${fmt(row.msgRuntime9am)}` +
    `  11am: ${fmt(row.runtime11am)} / msg ${fmt(row.msgRuntime11am)}` +
    `  flip: ${fmt(row.stageFlip)}`
  )
}
console.log()

if (!WRITE) {
  console.log('Dry run complete. Pass --write to upsert into Supabase.')
  process.exit(0)
}

// ── Upsert into service_records ───────────────────────────────────────────────

console.log('Upserting into service_records…')

let updated = 0
let notFound = 0
let errors = 0

for (const row of extracted) {
  // Update 9am row
  if (row.runtime9am != null || row.msgRuntime9am != null) {
    const patch9 = {}
    if (row.runtime9am    != null) patch9.service_run_time_secs  = row.runtime9am
    if (row.msgRuntime9am != null) patch9.message_run_time_secs  = row.msgRuntime9am
    if (row.stageFlip     != null) patch9.stage_flip_time_secs   = row.stageFlip

    const { error, count } = await supabase
      .from('service_records')
      .update(patch9)
      .eq('service_date', row.date)
      .eq('service_type', 'regular_9am')
      .select('id', { count: 'exact', head: true })

    if (error) { console.error(`  ${row.date} 9am error: ${error.message}`); errors++ }
    else if (count === 0) { notFound++; }
    else updated++
  }

  // Update 11am row
  if (row.runtime11am != null || row.msgRuntime11am != null) {
    const patch11 = {}
    if (row.runtime11am    != null) patch11.service_run_time_secs = row.runtime11am
    if (row.msgRuntime11am != null) patch11.message_run_time_secs = row.msgRuntime11am

    const { error, count } = await supabase
      .from('service_records')
      .update(patch11)
      .eq('service_date', row.date)
      .eq('service_type', 'regular_11am')
      .select('id', { count: 'exact', head: true })

    if (error) { console.error(`  ${row.date} 11am error: ${error.message}`); errors++ }
    else if (count === 0) { notFound++; }
    else updated++
  }
}

console.log()
console.log(`Done.`)
console.log(`  Updated : ${updated} service rows`)
console.log(`  No match: ${notFound} (date not in service_records yet)`)
console.log(`  Errors  : ${errors}`)
