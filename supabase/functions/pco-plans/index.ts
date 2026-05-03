// deno-lint-ignore-file no-import-prefix no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2'
import { getValidPcoToken, pcoReauthBody, type PcoSessionTokens } from '../_shared/pco-token.ts'

// ─────────────────────────────────────────────────────────────────────────────
// pco-plans edge function
//
// Returns upcoming + recent PCO plans grouped by service type, so the
// event-creation form can offer a "Link to PCO Plan" picker.
//
// Request: POST with header x-session-token: <session token>
// Response: { service_types: PcoServiceTypeResult[] }
//
// Returns plans from 3 months ago → 6 months ahead so the user can link
// both upcoming events and recent ones they are back-filling.
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = [
  'https://bfcproduction.github.io',
  'http://localhost:5173',
]

const PCO_API_BASE = 'https://api.planningcenteronline.com/services/v2'
const DEFAULT_TIMEZONE = 'America/Chicago'

function corsHeaders(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin':  allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

function json(cors: Record<string, string>, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function timeInTimezone(iso: string, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour:     '2-digit',
    minute:   '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso))

  const value = (type: string) => parts.find(part => part.type === type)?.value
  const hour = value('hour')
  const minute = value('minute')

  return hour && minute ? `${hour}:${minute}:00` : null
}

function displayTimeInTimezone(iso: string, timezone: string) {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour:     'numeric',
    minute:   '2-digit',
    timeZone: timezone,
  })
}

function dateInTimezone(iso: string, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year:     'numeric',
    month:    '2-digit',
    day:      '2-digit',
  }).formatToParts(new Date(iso))

  const year  = parts.find(part => part.type === 'year')?.value
  const month = parts.find(part => part.type === 'month')?.value
  const day   = parts.find(part => part.type === 'day')?.value

  return year && month && day ? `${year}-${month}-${day}` : iso.slice(0, 10)
}

interface ServiceType {
  id:                  string
  slug:                string
  name:                string
  color:               string
  sort_order:          number
  pco_service_type_id: string
}

interface PcoServiceType {
  id:         string
  attributes: { name: string }
}

interface PcoPlan {
  id: string
  attributes: {
    title:        string | null
    series_title: string | null
    sort_date:    string | null
    dates:        string | null
  }
}

interface PcoPlanTime {
  attributes: {
    starts_at: string | null
    time_type: string | null
  }
}

async function fetchPlanEventTime(
  pcoToken: string,
  pcoServiceTypeId: string,
  planId: string,
  eventDate: string,
  timezone: string,
) {
  const url = `${PCO_API_BASE}/service_types/${pcoServiceTypeId}/plans/${planId}/plan_times`
    + `?per_page=100&order=starts_at`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${pcoToken}` },
  })

  if (!res.ok) return null

  const body = await res.json() as { data: PcoPlanTime[] }
  const times = (body.data ?? [])
    .filter(time => !!time.attributes.starts_at)
    .filter(time => dateInTimezone(time.attributes.starts_at!, timezone) === eventDate)
  const first = times.find(time => time.attributes.time_type === 'service') ?? times[0]
  if (!first?.attributes.starts_at) return null

  return {
    event_time: timeInTimezone(first.attributes.starts_at, timezone),
    display_time: displayTimeInTimezone(first.attributes.starts_at, timezone),
  }
}

export interface PcoPlanResult {
  id:           string
  title:        string | null
  series_title: string | null
  event_date:   string         // YYYY-MM-DD
  event_time:   string | null  // HH:MM:SS in church timezone
  display_date: string         // human-readable, e.g. "Jan 5, 2026"
  display_time: string | null
}

export interface PcoServiceTypeResult {
  slug:                string
  name:                string
  pco_service_type_id: string
  plans:               PcoPlanResult[]
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  const cors   = corsHeaders(origin)

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST')    return json(cors, 405, { error: 'Method not allowed' })

  const sessionToken = req.headers.get('x-session-token')
  if (!sessionToken) {
    return json(cors, 401, { error: 'x-session-token header required' })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // ── 1. Validate session and get PCO token ─────────────────────────────────
  const now = new Date().toISOString()
  const { data: session } = await supabase
    .from('user_sessions')
    .select('pco_access_token, pco_refresh_token, pco_token_expires_at')
    .eq('token', sessionToken)
    .gt('expires_at', now)
    .maybeSingle()

  if (!session) {
    return json(cors, 401, { error: 'Invalid or expired session token' })
  }

  let pcoToken: string
  try {
    pcoToken = await getValidPcoToken(supabase, sessionToken, session as PcoSessionTokens)
  } catch (err) {
    return json(cors, 401, pcoReauthBody(err))
  }

  // ── 2. Load DB service types (always available as baseline) ─────────────────
  const { data: existingRows } = await supabase
    .from('service_types')
    .select('id, slug, name, color, sort_order, pco_service_type_id')
    .not('pco_service_type_id', 'is', null)

  const byPcoId = new Map<string, ServiceType>(
    (existingRows ?? []).map((r: ServiceType) => [r.pco_service_type_id, r]),
  )

  // ── 3. Try to discover new service types from PCO API ────────────────────
  // Failure here is non-fatal — we fall back to DB rows only.
  try {
    const pcoStRes = await fetch(`${PCO_API_BASE}/service_types?per_page=100`, {
      headers: { Authorization: `Bearer ${pcoToken}` },
    })
    if (pcoStRes.ok) {
      const pcoStBody = await pcoStRes.json() as { data: PcoServiceType[] }
      const pcoServiceTypes = pcoStBody.data ?? []

      const toInsert = pcoServiceTypes
        .filter(p => !byPcoId.has(p.id))
        .map(p => ({
          slug:                slugify(p.attributes.name),
          name:                p.attributes.name,
          color:               '#6b7280',
          sort_order:          100,
          pco_service_type_id: p.id,
        }))

      if (toInsert.length > 0) {
        const { data: inserted } = await supabase
          .from('service_types')
          .insert(toInsert)
          .select('id, slug, name, color, sort_order, pco_service_type_id')
        for (const r of (inserted ?? []) as ServiceType[]) {
          byPcoId.set(r.pco_service_type_id, r)
        }
      }
    }
  } catch (_) {
    // PCO service type discovery failed — proceed with DB rows only.
  }

  const serviceTypes: ServiceType[] = Array.from(byPcoId.values())

  if (serviceTypes.length === 0) {
    return json(cors, 200, { service_types: [] })
  }

  const { data: timezoneRow } = await supabase
    .from('app_config')
    .select('value')
    .eq('key', 'church_timezone')
    .maybeSingle()

  const timezone = typeof timezoneRow?.value === 'string'
    ? timezoneRow.value
    : DEFAULT_TIMEZONE

  // ── 3. Fetch plans for each service type ─────────────────────────────────
  const results: PcoServiceTypeResult[] = []

  for (const st of serviceTypes as ServiceType[]) {
    // Two calls:
    //  1. filter=future — upcoming plans, sorted soonest-first (known-good filter)
    //  2. No filter, sort descending — returns ALL plans newest-first; first 25
    //     will be the most recent past services
    const baseUrl = `${PCO_API_BASE}/service_types/${st.pco_service_type_id}/plans`
    const urlFuture  = `${baseUrl}?filter=future&per_page=25&order=sort_date`
    const urlRecent  = `${baseUrl}?per_page=25&order=-sort_date`

    let plans: PcoPlan[] = []
    const debugLog: string[] = []
    let successfulFetches = 0

    for (const url of [urlFuture, urlRecent]) {
      try {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${pcoToken}` },
        })
        if (res.ok) {
          const body = await res.json() as { data: PcoPlan[] }
          const count = (body.data ?? []).length
          debugLog.push(`${res.status} OK — ${count} plans from ${url}`)
          successfulFetches++
          plans = plans.concat(body.data ?? [])
        } else {
          const errText = await res.text().catch(() => '')
          debugLog.push(`${res.status} ERROR from ${url}: ${errText.slice(0, 300)}`)
        }
      } catch (err) {
        debugLog.push(`NETWORK ERROR for ${url}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    if (successfulFetches === 0) {
      // Skip this service type rather than aborting the whole request.
      console.warn(`Skipping ${st.name}: ${debugLog.join(' | ')}`)
      continue
    }

    const uniquePlans = plans
      .filter(p => !!p.attributes.sort_date)
      .filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i)

    const filtered: PcoPlanResult[] = (await Promise.all(uniquePlans.map(async p => {
        const sortDate = p.attributes.sort_date!
        const eventDate = sortDate.slice(0, 10)
        const planTime = await fetchPlanEventTime(
          pcoToken,
          st.pco_service_type_id,
          p.id,
          eventDate,
          timezone,
        )
        const d = new Date(eventDate + 'T12:00:00')
        const displayDate = d.toLocaleDateString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
        })
        return {
          id:           p.id,
          title:        p.attributes.title || null,
          series_title: p.attributes.series_title || null,
          event_date:   eventDate,
          event_time:   planTime?.event_time ?? null,
          display_date: displayDate,
          display_time: planTime?.display_time ?? null,
        }
      })))
      .sort((a, b) =>
        b.event_date.localeCompare(a.event_date) ||
        (b.event_time ?? '').localeCompare(a.event_time ?? '')
      )

    results.push({ slug: st.slug, name: st.name, pco_service_type_id: st.pco_service_type_id, plans: filtered, _debug: debugLog } as unknown as PcoServiceTypeResult)
  }

  return json(cors, 200, { service_types: results, _debug: true })
})
