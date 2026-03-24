#!/usr/bin/env node
// One-shot import of historical loudness data from the BFC Audio Loudness Log Google Sheet.
// The sheet is publicly accessible; this script fetches it as CSV and upserts into Supabase.
//
// Usage:
//   node scripts/import-loudness-history.js          # dry run (prints what would be imported)
//   node scripts/import-loudness-history.js --write  # actually write to Supabase

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
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
const DRY_RUN = !process.argv.includes('--write')

const SHEET_CSV_URL =
  'https://docs.google.com/spreadsheets/d/1B9jZmZ8MknPQ8nrvRZRnUM2u8qcOB6TnUsfZlOKc7x8/export?format=csv&gid=0'

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_KEY (or VITE_SUPABASE_ANON_KEY) required')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// Parse "March 26, 2023" → "2023-03-26"
function parseDate(raw) {
  const d = new Date(raw.trim())
  if (isNaN(d.getTime())) return null
  // Force interpretation in local time to avoid UTC-offset shifting the date
  const parts = raw.trim().split(/[\s,]+/)
  // parts: ["March", "26", "2023"]
  const months = {
    January: '01', February: '02', March: '03', April: '04',
    May: '05', June: '06', July: '07', August: '08',
    September: '09', October: '10', November: '11', December: '12',
  }
  const month = months[parts[0]]
  const day = parts[1].padStart(2, '0')
  const year = parts[2]
  if (!month || !day || !year) return null
  return `${year}-${month}-${day}`
}

function parseNum(val) {
  if (!val || val.trim() === '') return null
  const n = parseFloat(val.trim())
  return isNaN(n) ? null : n
}

async function main() {
  console.log(DRY_RUN ? '--- DRY RUN (pass --write to import) ---\n' : '--- WRITING TO SUPABASE ---\n')

  // Fetch CSV
  console.log('Fetching sheet...')
  const res = await fetch(SHEET_CSV_URL)
  if (!res.ok) throw new Error(`Failed to fetch sheet: ${res.status} ${res.statusText}`)
  const csv = await res.text()

  // Parse CSV properly — handles quoted fields (dates contain a comma: "March 26, 2023")
  function parseCSVLine(line) {
    const cols = []
    let cur = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') { inQuotes = !inQuotes }
      else if (ch === ',' && !inQuotes) { cols.push(cur); cur = '' }
      else { cur += ch }
    }
    cols.push(cur)
    return cols
  }

  // Sheet layout: row 0 = blank, 1 = title, 2 = averages, 3 = column headers, 4+ = data
  // Data columns: 0=blank, 1=Date, 2=9am Max, 3=9am LAeq, 4=11am Max, 5=11am LAeq
  const lines = csv.split('\n')
  const dataLines = lines.slice(4)

  const rows = []
  for (const line of dataLines) {
    const clean = line.replace(/\r$/, '')
    if (!clean.trim()) continue
    const cols = parseCSVLine(clean)
    const dateRaw = cols[1]?.trim()
    if (!dateRaw) continue

    const date = parseDate(dateRaw)
    if (!date) continue

    const s1Max  = parseNum(cols[2])
    const s1LAeq = parseNum(cols[3])
    const s2Max  = parseNum(cols[4])
    const s2LAeq = parseNum(cols[5])

    // Skip rows with no readings at all (future placeholder dates)
    if (s1Max === null && s1LAeq === null && s2Max === null && s2LAeq === null) {
      console.log(`  skip  ${date}  (no readings)`)
      continue
    }

    rows.push({ date, s1Max, s1LAeq, s2Max, s2LAeq })
  }

  console.log(`\nFound ${rows.length} rows with data.\n`)

  if (DRY_RUN) {
    for (const r of rows) {
      console.log(`  ${r.date}  9am: ${r.s1Max ?? '—'} / ${r.s1LAeq ?? '—'}  11am: ${r.s2Max ?? '—'} / ${r.s2LAeq ?? '—'}`)
    }
    console.log('\nRun with --write to import.')
    return
  }

  // Write to Supabase
  let imported = 0
  let errors = 0

  for (const r of rows) {
    // Upsert sunday row
    const { data: sunday, error: sundayErr } = await supabase
      .from('sundays')
      .upsert({ date: r.date }, { onConflict: 'date' })
      .select('id')
      .single()

    if (sundayErr || !sunday) {
      console.error(`  ERROR creating sunday ${r.date}: ${sundayErr?.message}`)
      errors++
      continue
    }

    // Upsert loudness row
    const { error: loudnessErr } = await supabase
      .from('loudness')
      .upsert({
        sunday_id: sunday.id,
        service_1_max_db: r.s1Max,
        service_1_laeq:   r.s1LAeq,
        service_2_max_db: r.s2Max,
        service_2_laeq:   r.s2LAeq,
        logged_at: new Date().toISOString(),
      }, { onConflict: 'sunday_id' })

    if (loudnessErr) {
      console.error(`  ERROR writing loudness ${r.date}: ${loudnessErr?.message}`)
      errors++
    } else {
      console.log(`  OK  ${r.date}`)
      imported++
    }
  }

  console.log(`\nDone. ${imported} imported, ${errors} errors.`)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
