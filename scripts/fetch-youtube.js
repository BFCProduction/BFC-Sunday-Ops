#!/usr/bin/env node
/**
 * BFC Sunday Ops — YouTube Live Stream Relay
 *
 * Runs during the Sunday service window. Polls BFC's YouTube channel for active
 * live streams (created by RESI), tracks concurrent viewers for each, and writes
 * youtube_unique_viewers to service_records when each stream ends.
 *
 * RESI creates YouTube live streams outside BFC's YouTube account — they do NOT
 * appear in liveBroadcasts.list. But while live, they ARE visible via search.list
 * with eventType=live when queried with the channel owner's OAuth token.
 *
 * Usage:
 *   node scripts/fetch-youtube.js              # current Sunday, run until done
 *   node scripts/fetch-youtube.js --date 2026-04-12
 *   node scripts/fetch-youtube.js --dry-run    # poll and log, no DB writes
 *
 * Required env:
 *   YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN
 *   SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_SERVICE_KEY
 *
 * Service window: 7:30 AM – 1:30 PM America/Chicago
 * Poll interval: 60 seconds
 *
 * Stream → service_type mapping (by stream start time, CT):
 *   7:45–8:45 AM  → special (8am service, Easter etc.) — skipped for regular Sundays
 *   8:45–10:15 AM → regular_9am
 *   10:15–12:30 PM → regular_11am
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

const CLIENT_ID     = process.env.YOUTUBE_CLIENT_ID
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET
const REFRESH_TOKEN = process.env.YOUTUBE_REFRESH_TOKEN
const SUPABASE_URL  = process.env.SUPABASE_URL  || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
const CHURCH_TZ     = 'America/Chicago'
const CHANNEL_ID    = 'UCPpgmh1k7XevPsiRxGY-XMQ'

// Service window in CT (24h)
const WINDOW_START_HOUR = 7   // 7:30 AM
const WINDOW_START_MIN  = 30
const WINDOW_END_HOUR   = 13  // 1:30 PM
const WINDOW_END_MIN    = 30

const POLL_INTERVAL_MS  = 60_000  // 60 seconds

for (const [name, val] of [
  ['YOUTUBE_CLIENT_ID', CLIENT_ID],
  ['YOUTUBE_CLIENT_SECRET', CLIENT_SECRET],
  ['YOUTUBE_REFRESH_TOKEN', REFRESH_TOKEN],
  ['SUPABASE_URL', SUPABASE_URL],
  ['SUPABASE_SERVICE_KEY', SUPABASE_KEY],
]) {
  if (!val) { console.error(`Error: ${name} is required.`); process.exit(1) }
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const args   = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const dateArg = (() => {
  const idx = args.indexOf('--date')
  if (idx !== -1) return args[idx + 1] ?? null
  return args.find(a => a.startsWith('--date='))?.split('=')[1] ?? null
})()

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
  const now   = new Date()
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CHURCH_TZ, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const dow = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(
    parts.find(p => p.type === 'weekday')?.value ?? ''
  )
  if (dow === 0) return toChurchDateString()
  // Rewind to most recent Sunday
  const d = new Date(now)
  d.setDate(d.getDate() - dow)
  return toChurchDateString(d)
}

/** Returns CT hour+minute components for a UTC Date */
function ctHourMin(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CHURCH_TZ, hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(date)
  return {
    hour: parseInt(parts.find(p => p.type === 'hour')?.value  ?? '0'),
    min:  parseInt(parts.find(p => p.type === 'minute')?.value ?? '0'),
  }
}

function isInServiceWindow() {
  const { hour, min } = ctHourMin(new Date())
  const nowMins   = hour * 60 + min
  const startMins = WINDOW_START_HOUR * 60 + WINDOW_START_MIN
  const endMins   = WINDOW_END_HOUR   * 60 + WINDOW_END_MIN
  return nowMins >= startMins && nowMins <= endMins
}

/**
 * Maps a stream's actual start time (UTC Date) to a service_type.
 * Returns null for streams that don't match a known slot.
 *
 *   7:45–8:45 CT  → 'special_8am'   (non-standard; caller handles)
 *   8:45–10:15 CT → 'regular_9am'
 *   10:15–12:30 CT → 'regular_11am'
 */
function serviceTypeForStartTime(startDate) {
  const { hour, min } = ctHourMin(startDate)
  const mins = hour * 60 + min
  if (mins >= 7 * 60 + 45 && mins < 8 * 60 + 45)   return 'special_8am'
  if (mins >= 8 * 60 + 45 && mins < 10 * 60 + 15)  return 'regular_9am'
  if (mins >= 10 * 60 + 15 && mins < 12 * 60 + 30) return 'regular_11am'
  return null
}

// ─── YouTube OAuth ─────────────────────────────────────────────────────────────

let cachedToken = null
let tokenExpiry = 0

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiry - 60_000) return cachedToken

  const res  = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
      grant_type:    'refresh_token',
    }),
  })
  const json = await res.json()
  if (!json.access_token) throw new Error(`OAuth token refresh failed: ${json.error} — ${json.error_description ?? ''}`)

  cachedToken = json.access_token
  tokenExpiry = Date.now() + (json.expires_in ?? 3600) * 1000
  return cachedToken
}

// ─── YouTube Data API ─────────────────────────────────────────────────────────

async function ytGet(path, params) {
  const token = await getAccessToken()
  const url   = new URL(`https://www.googleapis.com/youtube/v3/${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res  = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const json = await res.json()
  if (json.error) throw new Error(`YouTube API ${path}: ${json.error.message}`)
  return json
}

/** Returns currently-live video IDs on the channel. */
async function findLiveStreams() {
  const data = await ytGet('search', {
    part:      'id,snippet',
    channelId: CHANNEL_ID,
    type:      'video',
    eventType: 'live',
    maxResults: '10',
  })
  return (data.items ?? []).map(item => ({
    videoId:   item.id?.videoId,
    title:     item.snippet?.title ?? '',
  })).filter(v => v.videoId)
}

/**
 * Fetches liveStreamingDetails for one or more videoIds.
 * Returns a map of videoId → { concurrentViewers, liveBroadcastContent, actualStartTime }
 */
async function getLiveDetails(videoIds) {
  if (!videoIds.length) return {}
  const data = await ytGet('videos', {
    part: 'liveStreamingDetails,snippet',
    id:   videoIds.join(','),
  })
  const result = {}
  for (const item of data.items ?? []) {
    const ld = item.liveStreamingDetails ?? {}
    result[item.id] = {
      concurrentViewers:   parseInt(ld.concurrentViewers ?? '0') || 0,
      liveBroadcastContent: item.snippet?.liveBroadcastContent ?? 'none',
      actualStartTime:     ld.actualStartTime ? new Date(ld.actualStartTime) : null,
      title:               item.snippet?.title ?? '',
    }
  }
  return result
}

// ─── Supabase ─────────────────────────────────────────────────────────────────

async function writeViewers(dateStr, serviceType, viewers) {
  if (dryRun) {
    console.log(`  [dry-run] would write service_records ${serviceType} youtube_unique_viewers = ${viewers}`)
    return
  }

  const { data: sunday } = await supabase
    .from('sundays').select('id').eq('date', dateStr).maybeSingle()

  const { data: existing } = await supabase
    .from('service_records')
    .select('id')
    .eq('service_date', dateStr)
    .eq('service_type', serviceType)
    .maybeSingle()

  const fields = { youtube_unique_viewers: viewers }

  let err
  if (existing) {
    ;({ error: err } = await supabase
      .from('service_records').update(fields).eq('id', existing.id))
  } else {
    ;({ error: err } = await supabase
      .from('service_records').insert({
        service_date: dateStr,
        service_type: serviceType,
        sunday_id:    sunday?.id ?? null,
        ...fields,
      }))
  }
  if (err) throw new Error(`service_records write (${serviceType}): ${err.message}`)
}

// ─── Main relay loop ──────────────────────────────────────────────────────────

async function run() {
  console.log('BFC Sunday Ops — YouTube Live Relay')
  console.log('====================================')

  const targetSunday = getTargetSunday()
  console.log(`Target Sunday: ${targetSunday}${dryRun ? ' [DRY RUN]' : ''}`)
  console.log(`Channel:       ${CHANNEL_ID}`)
  console.log(`Poll interval: ${POLL_INTERVAL_MS / 1000}s`)
  console.log(`Service window: ${WINDOW_START_HOUR}:${String(WINDOW_START_MIN).padStart(2,'0')}–${WINDOW_END_HOUR}:${String(WINDOW_END_MIN).padStart(2,'0')} CT\n`)

  // Tracks active streams: videoId → { title, serviceType, peakViewers, startTime }
  const active    = new Map()
  const completed = new Set()  // videoIds already written to DB

  // If --date is a past date, skip the window check and do a one-shot lookup
  const isPast = dateArg && new Date(dateArg + 'T12:00:00') < new Date(new Date().setHours(0,0,0,0))
  if (isPast) {
    console.log('Past date specified — doing one-shot analytics lookup.\n')
    await pastDateLookup(targetSunday)
    return
  }

  // Verify we're in or near the service window (allow script to start up to 30min early)
  const { hour, min } = ctHourMin(new Date())
  const nowMins     = hour * 60 + min
  const earliestMins = WINDOW_START_HOUR * 60 + WINDOW_START_MIN - 30
  const endMins      = WINDOW_END_HOUR   * 60 + WINDOW_END_MIN
  if (nowMins < earliestMins || nowMins > endMins) {
    const windowStr = `${WINDOW_START_HOUR}:${String(WINDOW_START_MIN).padStart(2,'0')}–${WINDOW_END_HOUR}:${String(WINDOW_END_MIN).padStart(2,'0')} CT`
    console.log(`Current CT time is outside the service window (${windowStr}).`)
    console.log('Run this script during the service window on Sunday, or pass --date for a past date.')
    process.exit(0)
  }

  console.log('Entering relay loop. Ctrl-C to exit.\n')

  // Graceful exit: write any pending data on SIGINT/SIGTERM
  async function flushAndExit(sig) {
    console.log(`\n${sig} received — flushing active streams...`)
    for (const [videoId, info] of active.entries()) {
      if (completed.has(videoId) || !info.serviceType) continue
      console.log(`  ${info.serviceType}: peak viewers = ${info.peakViewers} (stream may still be live)`)
      try {
        await writeViewers(targetSunday, info.serviceType, info.peakViewers)
        console.log(`  ✓ wrote ${info.serviceType} youtube_unique_viewers = ${info.peakViewers}`)
      } catch (e) {
        console.error(`  ERROR: ${e.message}`)
      }
    }
    process.exit(0)
  }
  process.on('SIGINT',  () => flushAndExit('SIGINT'))
  process.on('SIGTERM', () => flushAndExit('SIGTERM'))

  while (isInServiceWindow() || active.size > 0) {
    const now = new Date()
    console.log(`[${now.toLocaleTimeString('en-US', { timeZone: CHURCH_TZ })} CT] Polling...`)

    try {
      // 1. Find currently live streams on the channel
      const liveStreams = await findLiveStreams()

      // 2. Add any newly discovered streams to active map
      for (const { videoId, title } of liveStreams) {
        if (!active.has(videoId) && !completed.has(videoId)) {
          console.log(`  Found live stream: "${title}" (${videoId})`)
          active.set(videoId, { title, serviceType: null, peakViewers: 0, startTime: null })
        }
      }

      // 3. Fetch live details for all tracked streams
      if (active.size > 0) {
        const details = await getLiveDetails([...active.keys()])

        for (const [videoId, info] of active.entries()) {
          const d = details[videoId]
          if (!d) {
            // Video disappeared from API unexpectedly; treat as ended
            console.log(`  Stream ${videoId} no longer accessible — treating as ended.`)
            if (info.serviceType && !completed.has(videoId) && info.peakViewers > 0) {
              try {
                await writeViewers(targetSunday, info.serviceType, info.peakViewers)
                console.log(`  ✓ wrote ${info.serviceType} youtube_unique_viewers = ${info.peakViewers}`)
                completed.add(videoId)
              } catch (e) {
                console.error(`  ERROR writing ${info.serviceType}: ${e.message}`)
              }
            }
            active.delete(videoId)
            continue
          }

          // Resolve serviceType once we have an actualStartTime
          if (!info.serviceType && d.actualStartTime) {
            info.startTime   = d.actualStartTime
            info.serviceType = serviceTypeForStartTime(d.actualStartTime)
            const { hour: sh, min: sm } = ctHourMin(d.actualStartTime)
            const timeStr = `${sh}:${String(sm).padStart(2,'0')} CT`
            if (info.serviceType) {
              console.log(`  Mapped "${d.title}" (started ${timeStr}) → ${info.serviceType}`)
            } else {
              console.log(`  WARNING: "${d.title}" started at ${timeStr} — no service type mapping, will be skipped`)
            }
          }

          // Update peak viewer count
          if (d.concurrentViewers > info.peakViewers) {
            info.peakViewers = d.concurrentViewers
          }
          console.log(`  ${info.serviceType ?? videoId}: ${d.concurrentViewers} concurrent (peak: ${info.peakViewers}), status: ${d.liveBroadcastContent}`)

          // Stream ended — write and remove
          if (d.liveBroadcastContent === 'none' || d.liveBroadcastContent === 'completed') {
            console.log(`  Stream ended: "${d.title}"`)
            if (info.serviceType && !completed.has(videoId)) {
              try {
                await writeViewers(targetSunday, info.serviceType, info.peakViewers)
                console.log(`  ✓ wrote ${info.serviceType} youtube_unique_viewers = ${info.peakViewers}`)
                completed.add(videoId)
              } catch (e) {
                console.error(`  ERROR writing ${info.serviceType}: ${e.message}`)
              }
            } else if (!info.serviceType) {
              console.log(`  Skipping write — no service type mapped.`)
            }
            active.delete(videoId)
          }
        }
      }

    } catch (err) {
      console.error(`  Poll error: ${err.message}`)
    }

    if (!isInServiceWindow() && active.size === 0) break

    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
  }

  if (completed.size > 0) {
    console.log(`\nDone. Recorded ${completed.size} stream(s).`)
  } else {
    console.log('\nService window ended. No streams were recorded.')
    console.log('If services ran today, RESI may not have streamed to YouTube, or the streams')
    console.log('ended before being detected. Check the YouTube channel directly.')
  }
}

// ─── Past-date fallback ───────────────────────────────────────────────────────
// For past Sundays, the live stream won't be visible. Nothing useful can be
// pulled via the Data API for RESI-managed streams. Print guidance.

async function pastDateLookup(dateStr) {
  console.log(`Past-date mode for ${dateStr}.`)
  console.log()
  console.log('RESI-created YouTube streams are not accessible via the YouTube Data API')
  console.log('after they end. For historical data, use the spreadsheet importer:')
  console.log()
  console.log('  node scripts/import-youtube-history.js --file <path> --service 9am')
  console.log('  node scripts/import-youtube-history.js --file <path> --service 11am')
  console.log()
  console.log('Or enter the values manually in the Analytics screen.')
}

run().catch(err => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
