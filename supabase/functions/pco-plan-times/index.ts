// deno-lint-ignore-file no-import-prefix no-explicit-any
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
const PCO_TOKEN_URL = 'https://api.planningcenteronline.com/oauth/token'
const DEFAULT_TIMEZONE = 'America/Chicago'
const TOKEN_REFRESH_BUFFER_MS = 60_000

type SupabaseAdminClient = ReturnType<typeof createClient<any>>

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

interface UserSession {
  pco_access_token:     string | null
  pco_refresh_token:    string | null
  pco_token_expires_at: string | null
}

interface PcoPlanTimeResult {
  id:         string
  name:       string | null
  starts_at:  string
  ends_at:    string | null
  time_type:  string | null
}

function shouldRefreshToken(expiresAt: string | null) {
  if (!expiresAt) return false
  const expiresMs = Date.parse(expiresAt)
  return Number.isNaN(expiresMs) || expiresMs <= Date.now() + TOKEN_REFRESH_BUFFER_MS
}

async function refreshPcoToken(
  supabase: SupabaseAdminClient,
  sessionToken: string,
  refreshToken: string,
) {
  const pcoClientId     = Deno.env.get('PCO_CLIENT_ID')
  const pcoClientSecret = Deno.env.get('PCO_CLIENT_SECRET')

  if (!pcoClientId || !pcoClientSecret) {
    throw new Error('PCO credentials not configured on server')
  }

  const tokenRes = await fetch(PCO_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type:    'refresh_token',
      refresh_token: refreshToken,
      client_id:     pcoClientId,
      client_secret: pcoClientSecret,
    }),
  })

  if (!tokenRes.ok) {
    const errText = await tokenRes.text().catch(() => '')
    throw new Error(`PCO token refresh failed (${tokenRes.status}): ${errText.slice(0, 200)}`)
  }

  const tokens = await tokenRes.json() as {
    access_token:  string
    refresh_token?: string
    expires_in?:    number
  }

  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null

  const { error } = await supabase
    .from('user_sessions')
    .update({
      pco_access_token:     tokens.access_token,
      pco_refresh_token:    tokens.refresh_token ?? refreshToken,
      pco_token_expires_at: expiresAt,
    })
    .eq('token', sessionToken)

  if (error) throw new Error(`Failed to save refreshed PCO token: ${error.message}`)
  return tokens.access_token
}

async function getPcoToken(
  supabase: SupabaseAdminClient,
  sessionToken: string,
  session: UserSession,
) {
  if (!session.pco_access_token) {
    throw new Error('No PCO access token on this session. Please log out and log in again.')
  }

  if (session.pco_refresh_token && shouldRefreshToken(session.pco_token_expires_at)) {
    return await refreshPcoToken(supabase, sessionToken, session.pco_refresh_token)
  }

  return session.pco_access_token
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

  const supabase = createClient<any>(
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

  if (!session?.pco_access_token) {
    return json(cors, 401, { error: 'Invalid or expired session, or no PCO token' })
  }

  let pcoToken: string
  try {
    pcoToken = await getPcoToken(supabase, sessionToken, session as UserSession)
  } catch (err) {
    return json(cors, 401, { error: err instanceof Error ? err.message : 'Unable to refresh PCO token' })
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
      headers: { Authorization: `Bearer ${pcoToken}` },
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
