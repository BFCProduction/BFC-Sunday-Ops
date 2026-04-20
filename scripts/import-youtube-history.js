#!/usr/bin/env node
/**
 * BFC Sunday Ops — Historical YouTube Viewers Import
 *
 * Reads a "Stream Analytics Master - Xam Service.csv" file and upserts
 * youtube_unique_viewers into service_records for each Sunday.
 *
 * Usage:
 *   node scripts/import-youtube-history.js --file ~/Downloads/"Stream Analytics Master - 9am Service.csv" --service 9am
 *   node scripts/import-youtube-history.js --file ~/Downloads/"Stream Analytics Master - 11am Service.csv" --service 11am
 *   node scripts/import-youtube-history.js --file ... --service 9am --dry-run
 *
 * The CSV is expected to have:
 *   Col 0:  Date in M/D/YYYY format
 *   Col 19: YouTube unique viewers (integer)
 *
 * Rows are skipped when:
 *   - Col 0 is not a parseable date (summary/header rows)
 *   - Col 19 is empty or zero
 *   - The date is in the future
 */

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
      if (key?.trim() && rest.length) process.env[key.trim()] = rest.join('=').trim()
    })
  }
} catch {}

const SUPABASE_URL = process.env.SUPABASE_URL  || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_KEY are required.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ─── Args ─────────────────────────────────────────────────────────────────────

const args   = process.argv.slice(2)
const dryRun = args.includes('--dry-run')

const fileArg = (() => {
  const idx = args.indexOf('--file')
  if (idx !== -1) return args[idx + 1] ?? null
  return args.find(a => a.startsWith('--file='))?.split('=')[1] ?? null
})()

const serviceArg = (() => {
  const idx = args.indexOf('--service')
  if (idx !== -1) return args[idx + 1] ?? null
  return args.find(a => a.startsWith('--service='))?.split('=')[1] ?? null
})()

if (!fileArg) {
  console.error('Usage: node scripts/import-youtube-history.js --file <path> --service <9am|11am> [--dry-run]')
  process.exit(1)
}

const SERVICE_TYPE_MAP = { '9am': 'regular_9am', '11am': 'regular_11am' }
const serviceType = SERVICE_TYPE_MAP[serviceArg]
if (!serviceType) {
  console.error('--service must be "9am" or "11am"')
  process.exit(1)
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

// ─── Date helpers ─────────────────────────────────────────────────────────────

const today = new Date()

function parseDate(raw) {
  // M/D/YYYY or MM/DD/YYYY → YYYY-MM-DD
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const [, month, day, year] = m
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

function isFuture(dateStr) {
  return new Date(dateStr + 'T12:00:00') > today
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log('BFC Sunday Ops — Historical YouTube Import')
  console.log('===========================================')
  console.log(`File:    ${fileArg}`)
  console.log(`Service: ${serviceArg} → ${serviceType}`)
  if (dryRun) console.log('Mode:    DRY RUN\n')
  else        console.log('Mode:    LIVE\n')

  const expandedPath = fileArg.replace(/^~/, process.env.HOME)
  if (!existsSync(expandedPath)) {
    console.error(`File not found: ${expandedPath}`)
    process.exit(1)
  }

  const lines = readFileSync(expandedPath, 'utf8').trim().split('\n')

  const rows = []
  for (const line of lines) {
    const cols   = parseCsvLine(line)
    const dateStr = parseDate(cols[0])
    if (!dateStr) continue                        // header / summary row
    if (isFuture(dateStr)) continue              // future date, no data

    const raw = cols[19]?.trim()
    const viewers = raw ? parseInt(raw.replace(/,/g, ''), 10) : NaN
    if (isNaN(viewers) || viewers <= 0) continue // no YouTube data

    rows.push({ dateStr, viewers })
  }

  console.log(`Found ${rows.length} rows with YouTube data.\n`)

  let updated = 0, inserted = 0, errors = 0

  for (const { dateStr, viewers } of rows) {
    if (dryRun) {
      console.log(`  ${dateStr}  ${serviceType}  youtube_unique_viewers = ${viewers}`)
      continue
    }

    // Look up existing sunday_id for FK
    const { data: sunday } = await supabase
      .from('sundays').select('id').eq('date', dateStr).maybeSingle()

    const { data: existing } = await supabase
      .from('service_records')
      .select('id')
      .eq('service_date', dateStr)
      .eq('service_type', serviceType)
      .maybeSingle()

    if (existing) {
      const { error } = await supabase
        .from('service_records')
        .update({ youtube_unique_viewers: viewers })
        .eq('id', existing.id)
      if (error) {
        console.error(`  ERROR ${dateStr}: ${error.message}`)
        errors++
      } else {
        console.log(`  ✓ updated  ${dateStr}  youtube=${viewers}`)
        updated++
      }
    } else {
      const { error } = await supabase
        .from('service_records')
        .insert({
          service_date:           dateStr,
          service_type:           serviceType,
          sunday_id:              sunday?.id ?? null,
          youtube_unique_viewers: viewers,
        })
      if (error) {
        console.error(`  ERROR ${dateStr}: ${error.message}`)
        errors++
      } else {
        console.log(`  ✓ inserted ${dateStr}  youtube=${viewers}`)
        inserted++
      }
    }
  }

  if (!dryRun) {
    console.log(`\nDone. Updated: ${updated}, Inserted: ${inserted}, Errors: ${errors}`)
  }
}

run().catch(err => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
