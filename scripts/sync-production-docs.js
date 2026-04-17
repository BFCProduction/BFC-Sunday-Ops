#!/usr/bin/env node
/**
 * sync-production-docs.js
 *
 * Reads the "01 Sunday Mornings" Google Drive folder, matches files to Sunday
 * Ops events by the BFC filename convention (YYYY.MM.DD.S - Description), then
 * copies each file into Supabase Storage and records it in production_docs.
 *
 * Google Sheets are exported as PDFs so they render inline without any
 * additional auth in the browser.
 *
 * Usage:
 *   node scripts/sync-production-docs.js              # sync current week's files
 *   node scripts/sync-production-docs.js --dry-run    # preview without writing
 *   node scripts/sync-production-docs.js --force      # re-sync already-synced files
 *
 * Required environment variables:
 *   SUPABASE_URL                          (or VITE_SUPABASE_URL)
 *   SUPABASE_SERVICE_KEY                  (service role key — not the anon key)
 *   GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL
 *   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
 *
 * The Google Drive service account must have at least Viewer access to the
 * "00 Production Documents for this week" folder (and its subfolders).
 *
 * Folder ID hard-coded below — change SUNDAY_MORNINGS_FOLDER_ID if the folder
 * ever moves, or override via the DRIVE_SUNDAY_MORNINGS_FOLDER_ID env var.
 */

import { createClient }      from '@supabase/supabase-js'
import { google }            from 'googleapis'
import { createPrivateKey }  from 'crypto'
import { existsSync, readFileSync } from 'fs'
import { join, dirname }     from 'path'
import { fileURLToPath }     from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Load .env.local — walk up from script dir until we find one ───────────────
try {
  let dir = __dirname
  for (let i = 0; i < 5; i++) {
    const envPath = join(dir, '.env.local')
    if (existsSync(envPath)) {
      const raw = readFileSync(envPath, 'utf8')
      // Parse carefully: values may span multiple lines if quoted, or contain
      // literal \n sequences. We read line-by-line and accumulate quoted values.
      let currentKey = null
      let currentVal = []
      let inMultiline = false

      for (const line of raw.split('\n')) {
        if (inMultiline) {
          // Inside a double-quoted value spanning multiple lines
          if (line.endsWith('"')) {
            currentVal.push(line.slice(0, -1))
            process.env[currentKey] = currentVal.join('\n')
            inMultiline = false; currentKey = null; currentVal = []
          } else {
            currentVal.push(line)
          }
        } else {
          const eqIdx = line.indexOf('=')
          if (eqIdx < 1) continue
          const key = line.slice(0, eqIdx).trim()
          let val = line.slice(eqIdx + 1).trim()
          if (val.startsWith('"') && !val.endsWith('"')) {
            // Multi-line quoted value
            inMultiline = true; currentKey = key; currentVal = [val.slice(1)]
          } else {
            // Strip surrounding quotes if present
            if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
            // Convert literal \n sequences to real newlines (common in private keys)
            val = val.replace(/\\n/g, '\n')
            process.env[key] = val
          }
        }
      }
      break
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
} catch {}

// ── Config ────────────────────────────────────────────────────────────────────

const SUPABASE_URL  = process.env.SUPABASE_URL  || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_KEY

// "00 Production Documents for this week" parent folder.
// The script will automatically find and enter the "01 Sunday Mornings" subfolder.
const PRODUCTION_DOCS_FOLDER_ID =
  process.env.DRIVE_PRODUCTION_DOCS_FOLDER_ID || '18plcuCDNDNSu-TXf92NOE7Qd74JbgQJ_'

const SUNDAY_MORNINGS_SUBFOLDER = '01 Sunday Mornings'

const DRY_RUN = process.argv.includes('--dry-run')
const FORCE   = process.argv.includes('--force')

// ── Validation ────────────────────────────────────────────────────────────────

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_KEY are required.')
  process.exit(1)
}

function maybeJsonParse(value) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function unwrapQuotedEnvValue(raw) {
  let value = raw.trim()
  const parsed = maybeJsonParse(value)
  if (typeof parsed === 'string') return parsed
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1)
  }
  return value
}

function decodeBase64ServiceAccount(value) {
  const compact = value.replace(/\s/g, '')
  if (!compact || compact.includes('-----BEGIN')) return null
  if (!/^[A-Za-z0-9+/=]+$/.test(compact)) return null

  try {
    const decoded = Buffer.from(compact, 'base64').toString('utf8').trim()
    return decoded.includes('-----BEGIN') || decoded.startsWith('{') ? decoded : null
  } catch {
    return null
  }
}

function readServiceAccountCredentials() {
  const rawEmail = process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL?.trim()
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
  const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS

  let jsonCandidate = rawJson ? unwrapQuotedEnvValue(rawJson) : null
  if (!jsonCandidate && rawKey) {
    const unwrappedKey = unwrapQuotedEnvValue(rawKey)
    const decoded = decodeBase64ServiceAccount(unwrappedKey)
    const maybeJson = decoded ?? unwrappedKey
    if (maybeJson.trim().startsWith('{')) jsonCandidate = maybeJson
  }

  const parsedJson = jsonCandidate ? maybeJsonParse(jsonCandidate) : null
  const email = rawEmail || parsedJson?.client_email
  const keySource = parsedJson?.private_key || rawKey

  if (!keySource) return { email, key: null }

  let key = unwrapQuotedEnvValue(keySource)
  key = decodeBase64ServiceAccount(key) ?? key

  const parsedKeyJson = key.trim().startsWith('{') ? maybeJsonParse(key) : null
  if (parsedKeyJson?.private_key) {
    return {
      email: email || parsedKeyJson.client_email,
      key: parsedKeyJson.private_key.replace(/\\n/g, '\n').trim(),
    }
  }

  return {
    email,
    key: key.replace(/\\n/g, '\n').trim(),
  }
}

const { email: SA_EMAIL, key: SA_KEY } = readServiceAccountCredentials()

if (!SA_EMAIL || !SA_KEY) {
  console.error(
    'Error: GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY are required.\n' +
    'The service account must have Viewer access to the Sunday Mornings folder in Google Drive.'
  )
  process.exit(1)
}

try {
  createPrivateKey(SA_KEY)
} catch (err) {
  console.error(
    'Error: GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY could not be parsed as a private key.\n' +
    'Store either the service-account JSON private_key value, the full service-account JSON in GOOGLE_SERVICE_ACCOUNT_JSON, ' +
    'or a base64-encoded version of one of those values.\n' +
    `OpenSSL said: ${err.message}`
  )
  process.exit(1)
}

// ── Clients ───────────────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const auth = new google.auth.JWT(SA_EMAIL, null, SA_KEY, [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
])
const drive  = google.drive({ version: 'v3', auth })
const sheets = google.sheets({ version: 'v4', auth })

// ── Filename parsing ──────────────────────────────────────────────────────────

/**
 * Parse a BFC production filename.
 *
 * Convention: YYYY.MM.DD.S - Description[.ext]
 *   S = 1 → sunday-9am
 *   S = 2 → sunday-11am
 *
 * When no service number is present (e.g. "YYYY.MM.DD - IO"), the file applies
 * to all services on that date and will be synced to each one.
 *
 * Examples:
 *   "2026.06.12.1 - Stage Plot.pdf"
 *   "2026.06.12.2 - Stage Plot.pdf"
 *   "2026.06.12 - IO"                  ← Google Sheet with tabs per service
 *   "2026.06.12.1 - Run Sheet - V2.pdf"
 */
function parseFilename(name) {
  // Strip extension for parsing (Google files often have none)
  const base = name.replace(/\.\w{2,4}$/, '')

  // Try with service number first
  const matchWithService = base.match(/^(\d{4})\.(\d{2})\.(\d{2})\.(\d+)\s*-\s*(.+)$/)
  if (matchWithService) {
    const [, year, month, day, serviceNum, description] = matchWithService
    const serviceSlug = serviceNum === '1' ? 'sunday-9am'
                      : serviceNum === '2' ? 'sunday-11am'
                      : null
    if (!serviceSlug) return null
    return {
      date:        `${year}-${month}-${day}`,
      serviceSlugs: [serviceSlug],
      description: description.trim(),
      docType:     inferDocType(description.trim()),
      allServices: false,
    }
  }

  // Try without service number — applies to all services on that date
  const matchNoService = base.match(/^(\d{4})\.(\d{2})\.(\d{2})\s*-\s*(.+)$/)
  if (matchNoService) {
    const [, year, month, day, description] = matchNoService
    return {
      date:        `${year}-${month}-${day}`,
      serviceSlugs: ['sunday-9am', 'sunday-11am'],
      description: description.trim(),
      docType:     inferDocType(description.trim()),
      allServices: true,
    }
  }

  return null
}

function inferDocType(description) {
  const l = description.toLowerCase()
  if (l.includes('stage plot'))                              return 'stage_plot'
  if (l.includes('input list') || l.includes('input sheet')) return 'input_list'
  if (l === 'io' || l.startsWith('io ') || l.endsWith(' io')) return 'input_list'
  if (l.includes('run sheet')  || l.includes('runsheet'))    return 'run_sheet'
  return 'other'
}

// ── Event lookup ──────────────────────────────────────────────────────────────

async function findEventId(date, serviceSlug) {
  const { data, error } = await supabase
    .from('events')
    .select('id, service_types!inner(slug)')
    .eq('event_date', date)
    .eq('service_types.slug', serviceSlug)
    .maybeSingle()

  if (error) {
    console.warn(`  DB lookup error for ${date} / ${serviceSlug}: ${error.message}`)
    return null
  }
  return data?.id ?? null
}

async function findEventIds(date, serviceSlugs) {
  const results = []
  for (const slug of serviceSlugs) {
    const id = await findEventId(date, slug)
    if (id) results.push({ id, slug })
  }
  return results
}

// ── Already synced check ──────────────────────────────────────────────────────

async function alreadySynced(eventId, driveFileId) {
  const { data } = await supabase
    .from('production_docs')
    .select('id')
    .eq('event_id', eventId)
    .eq('gdrive_file_id', driveFileId)
    .maybeSingle()
  return !!data
}

// ── Download from Drive ───────────────────────────────────────────────────────

const GOOGLE_SHEET_MIME       = 'application/vnd.google-apps.spreadsheet'
const GOOGLE_SHORTCUT_MIME    = 'application/vnd.google-apps.shortcut'
const GOOGLE_WORKSPACE_PREFIX = 'application/vnd.google-apps.'

/**
 * Download a file from Drive as a buffer.
 * For Google Sheets: exports the entire sheet as PDF (used for single-service sheets).
 */
async function downloadFile(fileId, mimeType) {
  if (mimeType.startsWith(GOOGLE_WORKSPACE_PREFIX)) {
    // All Google Workspace files (Sheets, Docs, Slides, etc.) must use export
    const res = await drive.files.export(
      { fileId, mimeType: 'application/pdf' },
      { responseType: 'arraybuffer' }
    )
    return { buffer: Buffer.from(res.data), contentType: 'application/pdf', ext: 'pdf' }
  }

  // Binary download (PDF, images, etc.)
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  )
  const ext = mimeType === 'application/pdf' ? 'pdf'
            : mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'bin'
  return { buffer: Buffer.from(res.data), contentType: mimeType, ext }
}

/**
 * For a multi-tab Google Sheet (IO sheet), fetch each tab's GID, match tabs to
 * services by name, and export each as its own PDF.
 *
 * Tab matching (case-insensitive):
 *   9am  → tab name contains "9"
 *   11am → tab name contains "11"
 * Falls back to tab order (first=9am, second=11am) if names don't match.
 *
 * Returns: [{ serviceSlug, buffer, contentType, ext, tabTitle }]
 */
async function exportSheetTabsPerService(spreadsheetId) {
  // Fetch tab names + GIDs
  let sheetsData
  try {
    const { data } = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets.properties(sheetId,title)',
    })
    sheetsData = data
  } catch (err) {
    throw new Error(`sheets.spreadsheets.get failed: ${err.message}`)
  }
  const data = sheetsData
  const tabs = (data.sheets ?? []).map(s => ({
    gid:   s.properties.sheetId,
    title: s.properties.title,
  }))

  console.log(`  Tabs found: ${tabs.map(t => `"${t.title}"`).join(', ')}`)

  // Match each service to a tab
  function findTab(hints) {
    return tabs.find(t => hints.some(h => t.title.toLowerCase().includes(h))) ?? null
  }

  const tab9am  = findTab(['9am', '9:00', '9 am', '900']) ?? tabs[0] ?? null
  const tab11am = findTab(['11am', '11:00', '11 am', '1100']) ?? tabs[1] ?? null

  const mappings = [
    tab9am  ? { slug: 'sunday-9am',  tab: tab9am  } : null,
    tab11am ? { slug: 'sunday-11am', tab: tab11am } : null,
  ].filter(Boolean)

  if (mappings.length === 0) throw new Error('No tabs matched to services')

  // Get an access token for the export HTTP request
  let token
  try {
    const tokenRes = await auth.getAccessToken()
    token = tokenRes.token
  } catch (err) {
    throw new Error(`getAccessToken failed: ${err.message}`)
  }

  const results = []
  for (const { slug, tab } of mappings) {
    // Try minimal export URL first, then fall back to full export
    const exportUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export` +
      `?format=pdf&gid=${tab.gid}&single=true`

    let res
    try {
      res = await fetch(exportUrl, { headers: { Authorization: `Bearer ${token}` } })
    } catch (err) {
      throw new Error(`fetch failed for tab "${tab.title}": ${err.message}`)
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Tab export HTTP ${res.status} for "${tab.title}": ${body.slice(0, 300)}`)
    }

    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.includes('pdf')) {
      const body = await res.text().catch(() => '')
      throw new Error(`Tab export non-PDF (${contentType}) for "${tab.title}": ${body.slice(0, 300)}`)
    }

    let arrayBuf
    try {
      arrayBuf = await res.arrayBuffer()
    } catch (err) {
      throw new Error(`arrayBuffer failed for tab "${tab.title}": ${err.message}`)
    }

    results.push({
      slug,
      tabTitle: tab.title,
      buffer:      Buffer.from(arrayBuf),
      contentType: 'application/pdf',
      ext:         'pdf',
    })
  }

  return results
}

// ── Upload to Supabase Storage ────────────────────────────────────────────────

async function uploadToStorage(eventId, driveFileId, buffer, contentType, ext) {
  const storagePath = `${eventId}/${driveFileId}.${ext}`

  const { error } = await supabase.storage
    .from('production-docs')
    .upload(storagePath, buffer, { contentType, upsert: true })

  if (error) throw new Error(`Storage upload failed: ${error.message}`)
  return storagePath
}

// ── Insert production_docs row ────────────────────────────────────────────────

async function upsertDocRecord(eventId, driveFileId, webViewLink, storagePath, docType, title) {
  // Check for an existing row so we can update rather than conflict-upsert
  // (PostgREST doesn't support ON CONFLICT with partial unique indexes)
  const { data: existing } = await supabase
    .from('production_docs')
    .select('id')
    .eq('event_id', eventId)
    .eq('gdrive_file_id', driveFileId)
    .maybeSingle()

  const payload = {
    event_id:       eventId,
    gdrive_file_id: driveFileId,
    gdrive_url:     webViewLink,
    storage_path:   storagePath,
    doc_type:       docType,
    title,
    source:         'drive_sync',
    synced_at:      new Date().toISOString(),
  }

  const { error } = existing
    ? await supabase.from('production_docs').update(payload).eq('id', existing.id)
    : await supabase.from('production_docs').insert(payload)

  if (error) throw new Error(`DB upsert failed: ${error.message}`)
}

// ── List files in Drive folder (recursive into subfolders) ───────────────────

const FOLDER_MIME = 'application/vnd.google-apps.folder'

async function listFolderFiles(folderId, depth = 0) {
  const files = []
  let pageToken = null

  do {
    const params = {
      q:        `'${folderId}' in parents and trashed = false`,
      fields:   'nextPageToken, files(id, name, mimeType, webViewLink)',
      pageSize: 100,
    }
    if (pageToken) params.pageToken = pageToken

    const { data } = await drive.files.list(params)
    for (const item of data.files ?? []) {
      if (item.mimeType === FOLDER_MIME) {
        // Recurse into subfolders (e.g. date-named folders like 2026.04.19)
        if (depth < 2) {
          const nested = await listFolderFiles(item.id, depth + 1)
          files.push(...nested)
        }
      } else {
        files.push(item)
      }
    }
    pageToken = data.nextPageToken ?? null
  } while (pageToken)

  return files
}

// ── Resolve Drive shortcuts to their target file ──────────────────────────────

async function resolveShortcut(fileId) {
  const { data } = await drive.files.get({
    fileId,
    fields: 'shortcutDetails(targetId,targetMimeType)',
  })
  return {
    targetId:       data.shortcutDetails?.targetId ?? null,
    targetMimeType: data.shortcutDetails?.targetMimeType ?? null,
  }
}

// ── Find subfolder by name ────────────────────────────────────────────────────

async function findSubfolder(parentId, name) {
  const { data } = await drive.files.list({
    q: `'${parentId}' in parents and name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
    pageSize: 10,
  })
  return data.files?.[0]?.id ?? null
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n📂  BFC Production Docs Sync${DRY_RUN ? ' (DRY RUN)' : ''}`)
  console.log(`    Parent folder: ${PRODUCTION_DOCS_FOLDER_ID}`)
  console.log(`    Target subfolder: ${SUNDAY_MORNINGS_SUBFOLDER}\n`)

  // Find the "01 Sunday Mornings" subfolder
  let sundayFolderId
  try {
    sundayFolderId = await findSubfolder(PRODUCTION_DOCS_FOLDER_ID, SUNDAY_MORNINGS_SUBFOLDER)
  } catch (err) {
    console.error(`Failed to search for subfolder: ${err.message}`)
    console.error('Check that the service account has Viewer access to the folder.')
    process.exit(1)
  }

  if (!sundayFolderId) {
    console.error(`Could not find subfolder "${SUNDAY_MORNINGS_SUBFOLDER}" inside the parent folder.`)
    console.error('Check the subfolder name or verify the service account has access.')
    process.exit(1)
  }

  console.log(`Found subfolder ID: ${sundayFolderId}\n`)

  // List all files in the Sunday Mornings folder
  let files
  try {
    files = await listFolderFiles(sundayFolderId)
  } catch (err) {
    console.error(`Failed to list Drive folder: ${err.message}`)
    console.error('Check that the service account has Viewer access to the folder.')
    process.exit(1)
  }

  console.log(`Found ${files.length} file(s) in folder.\n`)

  let synced = 0, skipped = 0, failed = 0

  for (const file of files) {
    const { id: fileId, name, mimeType, webViewLink } = file
    console.log(`→ ${name}`)

    // Parse filename
    const parsed = parseFilename(name)
    if (!parsed) {
      console.log(`  ⚠ Skipped — filename doesn't match convention (YYYY.MM.DD.S - Description)`)
      skipped++; continue
    }

    // Resolve Drive shortcuts to the actual target file
    let resolvedFileId   = fileId
    let resolvedMimeType = mimeType
    if (mimeType === GOOGLE_SHORTCUT_MIME) {
      const { targetId, targetMimeType } = await resolveShortcut(fileId)
      if (!targetId) {
        console.log(`  ⚠ Skipped — shortcut target could not be resolved`)
        skipped++; continue
      }
      resolvedFileId   = targetId
      resolvedMimeType = targetMimeType ?? mimeType
      console.log(`  ↪ Shortcut → target ${resolvedFileId} (${resolvedMimeType})`)
    }

    const { date, serviceSlugs, description, docType, allServices } = parsed
    const serviceLabel = allServices ? 'all services' : serviceSlugs.join(', ')
    console.log(`  date=${date}  service=${serviceLabel}  type=${docType}`)

    // Look up events for all target service slugs
    const events = await findEventIds(date, serviceSlugs)
    if (events.length === 0) {
      console.log(`  ⚠ Skipped — no events found for ${date} / ${serviceLabel}`)
      skipped++; continue
    }

    // Check if all target events are already synced
    if (!FORCE) {
      const allDone = await Promise.all(events.map(e => alreadySynced(e.id, resolvedFileId)))
      if (allDone.every(Boolean)) {
        console.log(`  ✓ Already synced, skipping (use --force to re-sync)`)
        skipped++; continue
      }
    }

    if (DRY_RUN) {
      if (allServices && resolvedMimeType === GOOGLE_SHEET_MIME) {
        for (const e of events) console.log(`  ✓ Would sync → event ${e.id} (${e.slug}, per-tab PDF)`)
      } else {
        for (const e of events) console.log(`  ✓ Would sync → event ${e.id} (${e.slug})`)
      }
      synced++; continue
    }

    // Download and record for each event
    try {
      if (allServices && resolvedMimeType === GOOGLE_SHEET_MIME) {
        // Multi-tab IO sheet: try per-tab export first, fall back to whole-sheet PDF
        let tabExports = null
        try {
          tabExports = await exportSheetTabsPerService(resolvedFileId)
        } catch (tabErr) {
          console.log(`  ⚠ Per-tab export failed (${tabErr.message}), falling back to full-sheet PDF`)
        }

        if (tabExports) {
          // Per-tab succeeded — one PDF per service
          for (const { slug, tabTitle, buffer, contentType, ext } of tabExports) {
            const event = events.find(e => e.slug === slug)
            if (!event) { console.log(`  ⚠ No event for tab "${tabTitle}" (${slug})`); continue }
            if (await alreadySynced(event.id, resolvedFileId) && !FORCE) continue

            const storagePath = await uploadToStorage(event.id, resolvedFileId, buffer, contentType, ext)
            await upsertDocRecord(event.id, resolvedFileId, webViewLink, storagePath, docType, `${description} (${tabTitle})`)
            console.log(`  ✓ Synced tab "${tabTitle}" → ${slug} (${(buffer.length / 1024).toFixed(1)} KB)`)
          }
        } else {
          // Fallback: export whole sheet as one PDF, store for each event
          const downloaded = await downloadFile(resolvedFileId, resolvedMimeType)
          for (const e of events) {
            if (await alreadySynced(e.id, resolvedFileId) && !FORCE) continue
            const storagePath = await uploadToStorage(e.id, resolvedFileId, downloaded.buffer, downloaded.contentType, downloaded.ext)
            await upsertDocRecord(e.id, resolvedFileId, webViewLink, storagePath, docType, description)
            console.log(`  ✓ Synced (full sheet PDF) → ${e.slug} (${(downloaded.buffer.length / 1024).toFixed(1)} KB)`)
          }
        }
      } else {
        // Single PDF / binary: download once, upload a copy per event
        const downloaded = await downloadFile(resolvedFileId, resolvedMimeType)

        for (const e of events) {
          if (await alreadySynced(e.id, resolvedFileId) && !FORCE) continue
          const storagePath = await uploadToStorage(e.id, resolvedFileId, downloaded.buffer, downloaded.contentType, downloaded.ext)
          await upsertDocRecord(e.id, resolvedFileId, webViewLink, storagePath, docType, description)
          console.log(`  ✓ Synced → ${e.slug} (${(downloaded.buffer.length / 1024).toFixed(1)} KB)`)
        }
      }
      synced++
    } catch (err) {
      console.error(`  ✗ Error: ${err.message}`)
      failed++
    }
  }

  console.log(`\n━━━ Done: ${synced} synced · ${skipped} skipped · ${failed} failed ━━━\n`)
  if (failed > 0) process.exit(1)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
