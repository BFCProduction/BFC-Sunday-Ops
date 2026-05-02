// deno-lint-ignore-file no-import-prefix no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2'
import { getValidPcoToken, pcoReauthBody, type PcoSessionTokens } from '../_shared/pco-token.ts'

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

  const candidateServiceTypeIds: string[] = [serviceType.pco_service_type_id]
  const { data: allServiceTypes } = await supabase
    .from('service_types')
    .select('pco_service_type_id')
    .not('pco_service_type_id', 'is', null)

  for (const row of allServiceTypes ?? []) {
    const pcoServiceTypeId = row.pco_service_type_id as string | null
    if (pcoServiceTypeId && !candidateServiceTypeIds.includes(pcoServiceTypeId)) {
      candidateServiceTypeIds.push(pcoServiceTypeId)
    }
  }

  // ── 3. Fetch plan items and plan times from PCO in parallel ──────────────
  const headers = { Authorization: `Bearer ${pcoToken}` }

  let rawItems: PcoPlanItem[]     = []
  let planTimes: PcoPlanTime[]    = []
  let lastFetchError: { status: number; message: string } | null = null

  try {
    for (const pcoServiceTypeId of candidateServiceTypeIds) {
      const planBase = `${PCO_API_BASE}/service_types/${pcoServiceTypeId}`
        + `/plans/${typedEvent.pco_plan_id}`

      const [itemsRes, timesRes] = await Promise.all([
        fetch(`${planBase}/items?per_page=100&order=sequence`, { headers }),
        fetch(`${planBase}/plan_times?per_page=25&order=starts_at`, { headers }),
      ])

      if (!itemsRes.ok) {
        const errText = await itemsRes.text().catch(() => '')
        lastFetchError = {
          status: itemsRes.status,
          message: `PCO items ${itemsRes.status}: ${errText.slice(0, 200)}`,
        }
        if (itemsRes.status === 404) continue
        return json(cors, itemsRes.status, { error: lastFetchError.message })
      }

      const itemsBody = await itemsRes.json() as { data: PcoPlanItem[] }
      rawItems = itemsBody.data ?? []

      if (timesRes.ok) {
        const timesBody = await timesRes.json() as { data: PcoPlanTime[] }
        planTimes = timesBody.data ?? []
      }

      break
    }

    if (rawItems.length === 0 && lastFetchError) {
      return json(cors, lastFetchError.status, { error: lastFetchError.message })
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
