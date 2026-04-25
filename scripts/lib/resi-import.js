export const SERVICE_NAMES = ['Traditional', 'Contemporary']
export const SERVICE_TIMES = ['9:00 AM', '11:00 AM']

const MIN_SERVICE_VIEWERS = 10

const SERVICE_MAP = {
  Traditional:  { serviceType: 'regular_9am', serviceSlug: 'sunday-9am' },
  Contemporary: { serviceType: 'regular_11am', serviceSlug: 'sunday-11am' },
}

function parseCsvLine(line) {
  const out = []
  let cur = ''
  let inQ = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    const next = line[i + 1]
    if (ch === '"' && inQ && next === '"') {
      cur += '"'
      i++
    } else if (ch === '"') {
      inQ = !inQ
    } else if (ch === ',' && !inQ) {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }

  out.push(cur)
  return out.map(v => v.trim().replace(/^"|"$/g, ''))
}

export function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const headers = parseCsvLine(lines[0])
  return lines.slice(1)
    .map(line => {
      const values = parseCsvLine(line)
      return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']))
    })
    .filter(row => row.eventId)
}

export function computeStats(rows) {
  const uniqueViewers = new Set(rows.map(r => r.clientId).filter(Boolean)).size
  const totalViews    = rows.length
  const durations     = rows.map(r => parseInt(r.totalTimeWatchedSeconds, 10)).filter(n => n > 0)
  const avgWatchSeconds = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : null

  const events = []
  for (const row of rows) {
    const endMs  = new Date(row.timestamp).getTime()
    const durMs  = (parseInt(row.totalTimeWatchedSeconds, 10) || 0) * 1000
    if (Number.isNaN(endMs) || durMs <= 0) continue
    events.push([endMs - durMs, +1])
    events.push([endMs,         -1])
  }

  events.sort((a, b) => a[0] - b[0])
  let peak = 0
  let cur = 0
  for (const [, delta] of events) {
    cur += delta
    if (cur > peak) peak = cur
  }

  return { uniqueViewers, totalViews, avgWatchSeconds, peakConcurrent: peak || null }
}

export function buildResiImportSummary(csvText) {
  const allRows = parseCSV(csvText)
  const liveRows = allRows.filter(row => row.eventType === 'LIVE')
  const onDemandRows = allRows.filter(row => row.eventType !== 'LIVE')

  const byEvent = new Map()
  for (const row of liveRows) {
    if (!byEvent.has(row.eventId)) byEvent.set(row.eventId, [])
    byEvent.get(row.eventId).push(row)
  }

  const sortedEvents = [...byEvent.entries()]
    .map(([eventId, rows]) => {
      const timestamps = rows
        .map(row => new Date(row.timestamp).getTime())
        .filter(timestamp => !Number.isNaN(timestamp))
        .sort((a, b) => a - b)

      return { eventId, rows, earliestTs: timestamps[0] ?? Infinity }
    })
    .filter(({ rows }) => new Set(rows.map(row => row.clientId).filter(Boolean)).size >= MIN_SERVICE_VIEWERS)
    .sort((a, b) => a.earliestTs - b.earliestTs)

  const eventStats = sortedEvents.map(({ eventId, rows }, index) => ({
    eventId,
    name: SERVICE_NAMES[index] ?? `Service ${index + 1}`,
    time: SERVICE_TIMES[index] ?? '',
    ...computeStats(rows),
  }))

  return {
    allRows,
    liveRows,
    onDemandRows,
    eventStats,
    totalViews: eventStats.reduce((sum, event) => sum + event.totalViews, 0),
    totalUnique: eventStats.reduce((sum, event) => sum + event.uniqueViewers, 0),
    maxPeak: Math.max(...eventStats.map(event => event.peakConcurrent ?? 0)) || null,
  }
}

export async function createImportRun(supabase, source, targetDate, artifactPath = null) {
  const { data, error } = await supabase
    .from('import_runs')
    .insert({
      source,
      target_date: targetDate,
      status: 'running',
      artifact_path: artifactPath,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error) {
    console.warn(`import_runs start warning: ${error.message}`)
    return null
  }

  return data.id
}

export async function finishImportRun(supabase, runId, status, { rowsParsed = 0, rowsWritten = 0, error = null, artifactPath = null } = {}) {
  if (!runId) return

  const { error: updateError } = await supabase
    .from('import_runs')
    .update({
      status,
      rows_parsed: rowsParsed,
      rows_written: rowsWritten,
      error,
      artifact_path: artifactPath,
      finished_at: new Date().toISOString(),
    })
    .eq('id', runId)

  if (updateError) console.warn(`import_runs finish warning: ${updateError.message}`)
}

export async function getOrCreateSunday(supabase, dateString) {
  const { data: existing } = await supabase
    .from('sundays')
    .select('id, date')
    .eq('date', dateString)
    .maybeSingle()

  if (existing) return existing

  const { data, error } = await supabase
    .from('sundays')
    .insert({ date: dateString })
    .select('id, date')
    .single()

  if (error) throw error
  return data
}

async function loadServiceTypeMap(supabase) {
  const { data, error } = await supabase
    .from('service_types')
    .select('id, slug')
    .in('slug', ['sunday-9am', 'sunday-11am'])

  if (error) throw error
  return Object.fromEntries((data ?? []).map(row => [row.slug, row.id]))
}

async function resolveEventIdForService(supabase, targetDate, serviceTypeId, sundayId, expectedTime) {
  if (!serviceTypeId) return null

  const { data, error } = await supabase
    .from('events')
    .select('id, event_time, legacy_sunday_id, created_at')
    .eq('service_type_id', serviceTypeId)
    .eq('event_date', targetDate)
    .order('event_time', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  if (error) throw error

  const events = data ?? []
  if (events.length === 0) return null

  const legacyMatch = events.find(event => event.legacy_sunday_id === sundayId)
  if (legacyMatch) return legacyMatch.id

  const expectedHour = expectedTime?.match(/^(\d{1,2})/)?.[1]
  const timeMatch = expectedHour
    ? events.find(event => event.event_time?.startsWith(expectedHour.padStart(2, '0')))
    : null
  if (timeMatch) return timeMatch.id

  return events.length === 1 ? events[0].id : null
}

async function upsertServiceRecord(supabase, dateString, serviceType, sundayId, eventId, fields) {
  if (eventId) {
    const { data: existing, error: findError } = await supabase
      .from('service_records')
      .select('id')
      .eq('event_id', eventId)
      .maybeSingle()

    if (findError) throw findError

    if (existing) {
      const { error } = await supabase
        .from('service_records')
        .update({
          service_date: dateString,
          service_type: serviceType,
          sunday_id: sundayId,
          event_id: eventId,
          service_label: null,
          ...fields,
        })
        .eq('id', existing.id)
      if (error) throw error
      return 'updated'
    }
  }

  let query = supabase
    .from('service_records')
    .select('id')
    .eq('service_date', dateString)
    .eq('service_type', serviceType)
    .is('event_id', null)

  const { data: legacyMatches, error: legacyFindError } = await query.limit(1)
  if (legacyFindError) throw legacyFindError

  const legacyRow = legacyMatches?.[0] ?? null
  if (legacyRow) {
    const { error } = await supabase
      .from('service_records')
      .update({
        service_date: dateString,
        service_type: serviceType,
        sunday_id: sundayId,
        event_id: eventId,
        service_label: null,
        ...fields,
      })
      .eq('id', legacyRow.id)
    if (error) throw error
    return 'updated'
  }

  const { error } = await supabase.from('service_records').insert({
    service_date: dateString,
    service_type: serviceType,
    sunday_id: sundayId,
    event_id: eventId,
    service_label: null,
    ...fields,
  })

  if (error) throw error
  return 'inserted'
}

export async function writeResiSummaryToSupabase(supabase, targetDate, summary) {
  const sunday = await getOrCreateSunday(supabase, targetDate)
  let rowsWritten = 0

  for (const event of summary.eventStats) {
    const { error } = await supabase.from('resi_events').upsert({
      sunday_id:         sunday.id,
      service_name:      event.name,
      service_time:      event.time,
      unique_viewers:    event.uniqueViewers,
      total_views:       event.totalViews,
      peak_concurrent:   event.peakConcurrent,
      avg_watch_seconds: event.avgWatchSeconds,
      pulled_at:         new Date().toISOString(),
    }, { onConflict: 'sunday_id,service_name' })

    if (error) throw new Error(`resi_events upsert (${event.name}): ${error.message}`)
    rowsWritten++
  }

  const serviceTypeIds = await loadServiceTypeMap(supabase)

  for (const event of summary.eventStats) {
    const mapping = SERVICE_MAP[event.name]
    if (!mapping) {
      console.warn(`service_records: no mapping for "${event.name}" — skipping.`)
      continue
    }

    const eventId = await resolveEventIdForService(
      supabase,
      targetDate,
      serviceTypeIds[mapping.serviceSlug],
      sunday.id,
      event.time,
    )

    if (!eventId) {
      console.warn(`service_records: no unambiguous Sunday Ops event for "${event.name}" on ${targetDate}; writing legacy date/type row.`)
    }

    await upsertServiceRecord(supabase, targetDate, mapping.serviceType, sunday.id, eventId, {
      church_online_views:               event.totalViews,
      church_online_unique_viewers:      event.uniqueViewers,
      church_online_avg_watch_time_secs: event.avgWatchSeconds,
    })
    rowsWritten++
  }

  const { error: analyticsError } = await supabase.from('stream_analytics').upsert({
    sunday_id:         sunday.id,
    resi_peak:         summary.maxPeak,
    resi_unique_total: summary.totalUnique,
    pulled_at:         new Date().toISOString(),
  }, { onConflict: 'sunday_id' })

  if (analyticsError) console.warn('stream_analytics upsert warning:', analyticsError.message)
  else rowsWritten++

  return { sunday, rowsWritten }
}
