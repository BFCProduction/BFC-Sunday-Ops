#!/usr/bin/env node
/**
 * Manual RESI CSV fallback.
 *
 * Usage:
 *   node scripts/import-resi-csv.js --date YYYY-MM-DD --file path/to/resi.csv
 *   node scripts/import-resi-csv.js --date YYYY-MM-DD --file path/to/resi.csv --dry-run
 */

import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  buildResiImportSummary,
  createImportRun,
  finishImportRun,
  writeResiSummaryToSupabase,
} from './lib/resi-import.js'

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

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')

function argValue(name) {
  const idx = args.indexOf(name)
  if (idx !== -1) return args[idx + 1] ?? null
  return args.find(arg => arg.startsWith(`${name}=`))?.split('=')[1] ?? null
}

const targetDate = argValue('--date')
const filePath = argValue('--file')

if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
  console.error('Error: --date YYYY-MM-DD is required.')
  process.exit(1)
}

if (!filePath) {
  console.error('Error: --file path/to/resi.csv is required.')
  process.exit(1)
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

if (!dryRun && (!SUPABASE_URL || !SUPABASE_KEY)) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_KEY are required unless --dry-run is set.')
  process.exit(1)
}

const supabase = !dryRun ? createClient(SUPABASE_URL, SUPABASE_KEY) : null

async function run() {
  console.log('BFC Sunday Ops — Manual RESI CSV Import')
  console.log('=========================================')
  console.log(`Target date: ${targetDate}${dryRun ? ' [DRY RUN]' : ''}`)
  console.log(`CSV file: ${filePath}`)

  let importRunId = null
  let rowsParsed = 0
  let rowsWritten = 0

  if (supabase) {
    importRunId = await createImportRun(supabase, 'resi-csv', targetDate, filePath)
  }

  try {
    const csvText = readFileSync(filePath, 'utf8')
    const summary = buildResiImportSummary(csvText)
    rowsParsed = summary.allRows.length

    console.log(`Parsed ${summary.allRows.length} session rows.`)
    console.log(`LIVE: ${summary.liveRows.length} rows  |  On-demand excluded: ${summary.onDemandRows.length}`)
    console.log(`Found ${summary.eventStats.length} service event(s):`)
    for (const event of summary.eventStats) {
      console.log(
        `  ${event.name} (${event.time}): ${event.uniqueViewers} unique, ${event.totalViews} views,` +
        ` ${event.avgWatchSeconds ?? '?'}s avg watch, ${event.peakConcurrent ?? '?'} peak concurrent`
      )
    }

    if (dryRun) {
      console.log('[Dry run] No data written.')
      return
    }

    const result = await writeResiSummaryToSupabase(supabase, targetDate, summary)
    rowsWritten = result.rowsWritten
    await finishImportRun(supabase, importRunId, 'succeeded', {
      rowsParsed,
      rowsWritten,
      artifactPath: filePath,
    })

    console.log(`Supabase writes complete. Rows written/updated: ${rowsWritten}`)
  } catch (err) {
    if (supabase) {
      await finishImportRun(supabase, importRunId, 'failed', {
        rowsParsed,
        rowsWritten,
        artifactPath: filePath,
        error: err instanceof Error ? err.message : String(err),
      })
    }
    throw err
  }
}

run().catch(err => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
