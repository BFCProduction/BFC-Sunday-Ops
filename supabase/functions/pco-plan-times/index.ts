// deno-lint-ignore-file no-import-prefix
import { createClient } from 'npm:@supabase/supabase-js@2'

// ─────────────────────────────────────────────────────────────────────────────
// pco-plan-times edge function
//
// Returns the scheduled times for the active Sunday Ops event's linked PCO plan.
//
// Request:  POST { event_id: string } with x-session-token: <session token>
// Response: { schedule: PcoPlanTimeResult[] }
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

interface EventWithServiceType {
  id:          string
  name:        string
  event_date:  string
  pco_plan_id: string | null
  service_types: {
    slug:                string
    name:                string
    pco_service_type_id: string | null
  } | Array<{
    slug:                string
    name:                string
    pco_service_type_id: string | null
  }> | null
}

interface PcoPlanTime {
  id: string
  attributes: {
    ends_at:   string | null
    name:      string | null
    starts_at: string | null
    time_type: string | null
  }
}

interface PcoPlanTimeResult {
  id:         string
  name:       string | null
  starts_at:  string
  ends_at:    string | null
  time_type:  string | null
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

  let eventId = ''
  try {
    const body = await req.json()
    eventId = typeof body?.event_id === 'string' ? body.event_id : ''
  } catch {
    return json(cors, 400, { error: 'Invalid JSON body' })
  }

  if (!eventId) return json(cors, 400, { error: 'event_id is required' })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // ── 1. Validate session and get PCO token ─────────────────────────────────
  const now = new Date().toISOString()
  const { data: session } = await supabase
    .from('user_sessions')
    .select('pco_access_token')
    .eq('token', sessionToken)
    .gt('expires_at', now)
    .maybeSingle()

  if (!session?.pco_access_token) {
    return json(cors, 401, { error: 'Invalid or expired session, or no PCO token' })
  }

  // ── 2. Load the active event and linked PCO identifiers ───────────────────
  const { data: event, error: eventErr } = await supabase
    .from('events')
    .select(`
      id, name, event_date, pco_plan_id,
      service_types ( slug, name, pco_service_type_id )
    `)
    .eq('id', eventId)
    .maybeSingle()

  if (eventErr) {
    return json(cors, 500, { error: eventErr.message })
  }

  if (!event) {
    return json(cors, 404, { error: 'Event not found' })
  }

  const typedEvent = event as unknown as EventWithServiceType
  const serviceType = Array.isArray(typedEvent.service_types)
    ? typedEvent.service_types[0]
    : typedEvent.service_types

  if (!typedEvent.pco_plan_id || !serviceType?.pco_service_type_id) {
    return json(cors, 200, { schedule: [] })
  }

  // ── 3. Use the configured church timezone to keep this a "today" schedule ─
  const { data: timezoneRow } = await supabase
    .from('app_config')
    .select('value')
    .eq('key', 'church_timezone')
    .maybeSingle()

  const timezone = typeof timezoneRow?.value === 'string'
    ? timezoneRow.value
    : DEFAULT_TIMEZONE

  // ── 4. Fetch and normalize the plan's scheduled times from PCO ────────────
  const url = `${PCO_API_BASE}/service_types/${serviceType.pco_service_type_id}`
    + `/plans/${typedEvent.pco_plan_id}/plan_times`
    + `?per_page=100&order=starts_at`

  let planTimes: PcoPlanTime[] = []
  try {
    const pcoRes = await fetch(url, {
      headers: { Authorization: `Bearer ${session.pco_access_token as string}` },
    })

    if (!pcoRes.ok) {
      const errText = await pcoRes.text().catch(() => '')
      return json(cors, pcoRes.status, {
        error: `PCO API ${pcoRes.status}: ${errText.slice(0, 200)}`,
      })
    }

    const body = await pcoRes.json() as { data: PcoPlanTime[] }
    planTimes = body.data ?? []
  } catch (err) {
    return json(cors, 502, {
      error: err instanceof Error ? err.message : 'Unable to fetch PCO plan times',
    })
  }

  const schedule: PcoPlanTimeResult[] = planTimes
    .filter(time => !!time.attributes.starts_at)
    .filter(time => dateInTimezone(time.attributes.starts_at!, timezone) === typedEvent.event_date)
    .map(time => ({
      id:         time.id,
      name:       time.attributes.name || null,
      starts_at:  time.attributes.starts_at!,
      ends_at:    time.attributes.ends_at || null,
      time_type:  time.attributes.time_type || null,
    }))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))

  return json(cors, 200, { schedule })
})
