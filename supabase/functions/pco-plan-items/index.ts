// deno-lint-ignore-file no-import-prefix no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2'

// ─────────────────────────────────────────────────────────────────────────────
// pco-plan-items edge function
//
// Returns the ordered run-of-show items for the active Sunday Ops event's
// linked PCO plan.
//
// Request:  POST { event_id: string } with x-session-token: <session token>
// Response: { items: PcoPlanItemResult[] }
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = [
  'https://bfcproduction.github.io',
  'http://localhost:5173',
]

const PCO_API_BASE   = 'https://api.planningcenteronline.com/services/v2'
const PCO_TOKEN_URL  = 'https://api.planningcenteronline.com/oauth/token'
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

interface EventWithServiceType {
  id:          string
  pco_plan_id: string | null
  service_types: {
    pco_service_type_id: string | null
  } | Array<{
    pco_service_type_id: string | null
  }> | null
}

interface PcoPlanItem {
  id:         string
  attributes: {
    title:            string | null
    item_type:        string | null
    length:           number | null
    sequence:         number | null
    description:      string | null
    service_position: string | null
    key_name:         string | null
  }
}

interface PcoPlanTime {
  id: string
  attributes: {
    starts_at: string | null
    ends_at:   string | null
    time_type: string | null
    name:      string | null
  }
}

interface UserSession {
  pco_access_token:     string | null
  pco_refresh_token:    string | null
  pco_token_expires_at: string | null
}

export interface PcoPlanItemResult {
  id:                  string
  sequence:            number
  title:               string
  item_type:           string
  length:              number | null
  description:         string | null
  service_position:    string | null
  key_name:            string | null
  computed_starts_at:  string | null  // ISO timestamp, computed from plan_times + cumulative lengths
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
      id, pco_plan_id,
      service_types ( pco_service_type_id )
    `)
    .eq('id', eventId)
    .maybeSingle()

  if (eventErr) return json(cors, 500, { error: eventErr.message })
  if (!event)   return json(cors, 404, { error: 'Event not found' })

  const typedEvent = event as unknown as EventWithServiceType
  const serviceType = Array.isArray(typedEvent.service_types)
    ? typedEvent.service_types[0]
    : typedEvent.service_types

  if (!typedEvent.pco_plan_id || !serviceType?.pco_service_type_id) {
    return json(cors, 200, { items: [] })
  }

  // ── 3. Fetch plan items and plan times from PCO in parallel ──────────────
  const planBase = `${PCO_API_BASE}/service_types/${serviceType.pco_service_type_id}`
    + `/plans/${typedEvent.pco_plan_id}`

  const headers = { Authorization: `Bearer ${pcoToken}` }

  let rawItems: PcoPlanItem[]     = []
  let planTimes: PcoPlanTime[]    = []

  try {
    const [itemsRes, timesRes] = await Promise.all([
      fetch(`${planBase}/items?per_page=100&order=sequence`, { headers }),
      fetch(`${planBase}/plan_times?per_page=25&order=starts_at`, { headers }),
    ])

    if (!itemsRes.ok) {
      const errText = await itemsRes.text().catch(() => '')
      return json(cors, itemsRes.status, { error: `PCO items ${itemsRes.status}: ${errText.slice(0, 200)}` })
    }

    const itemsBody = await itemsRes.json() as { data: PcoPlanItem[] }
    rawItems = itemsBody.data ?? []

    if (timesRes.ok) {
      const timesBody = await timesRes.json() as { data: PcoPlanTime[] }
      planTimes = timesBody.data ?? []
    }
  } catch (err) {
    return json(cors, 502, {
      error: err instanceof Error ? err.message : 'Unable to fetch PCO plan data',
    })
  }

  // ── 4. Compute start times for each item ─────────────────────────────────
  // Find the service start anchor: prefer time_type 'service', fall back to earliest.
  const serviceTime = planTimes.find(pt => pt.attributes.time_type === 'service')
    ?? planTimes.find(pt => pt.attributes.time_type === 'service_time')
    ?? planTimes[0]

  const serviceStartMs = serviceTime?.attributes.starts_at
    ? Date.parse(serviceTime.attributes.starts_at)
    : null

  // Partition by service_position
  const preItems     = rawItems.filter(i => i.attributes.service_position === 'pre_service')
  const serviceItems = rawItems.filter(i => i.attributes.service_position !== 'pre_service' && i.attributes.service_position !== 'post_service')
  const postItems    = rawItems.filter(i => i.attributes.service_position === 'post_service')

  // Map from PCO item id → computed ISO start string
  const startMap = new Map<string, string>()

  if (serviceStartMs !== null) {
    // Pre-service: work backwards from service start
    const totalPreMs = preItems.reduce((s, i) => s + (i.attributes.length ?? 0) * 1000, 0)
    let cursor = serviceStartMs - totalPreMs
    for (const item of preItems) {
      startMap.set(item.id, new Date(cursor).toISOString())
      cursor += (item.attributes.length ?? 0) * 1000
    }

    // Service items: forward from service start
    cursor = serviceStartMs
    for (const item of serviceItems) {
      startMap.set(item.id, new Date(cursor).toISOString())
      cursor += (item.attributes.length ?? 0) * 1000
    }

    // Post-service: continue from where service ended
    for (const item of postItems) {
      startMap.set(item.id, new Date(cursor).toISOString())
      cursor += (item.attributes.length ?? 0) * 1000
    }
  }

  const items: PcoPlanItemResult[] = rawItems.map((item, idx) => ({
    id:                 item.id,
    sequence:           item.attributes.sequence ?? idx,
    title:              item.attributes.title || 'Untitled',
    item_type:          item.attributes.item_type || 'item',
    length:             item.attributes.length ?? null,
    description:        item.attributes.description || null,
    service_position:   item.attributes.service_position || null,
    key_name:           item.attributes.key_name || null,
    computed_starts_at: startMap.get(item.id) ?? null,
  }))

  return json(cors, 200, { items })
})
