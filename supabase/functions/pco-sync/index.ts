import { createClient } from 'npm:@supabase/supabase-js@2'

// ─────────────────────────────────────────────────────────────────────────────
// pco-sync edge function
//
// Pulls upcoming service plans from Planning Center and upserts them into the
// events table. Called:
//   • Automatically after a user logs in (from AuthContext)
//   • Manually via the "Sync Now" button in Settings (admin only)
//
// Request: POST (body ignored) with header x-session-token: <session token>
// Response: { synced: number, skipped: number, details: SyncResult[] }
//
// Required Supabase secrets:
//   PCO_CLIENT_ID, PCO_CLIENT_SECRET  (for token refresh, future)
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = [
  'https://bfcproduction.github.io',
  'http://localhost:5173',
]

const PCO_API_BASE = 'https://api.planningcenteronline.com/services/v2'

// Default event times by service type slug
const DEFAULT_EVENT_TIMES: Record<string, string | null> = {
  'sunday-9am':  '09:00',
  'sunday-11am': '11:00',
  'special':     null,
}

// How many months ahead to pull plans
const SYNC_MONTHS_AHEAD = 3

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

interface ServiceType {
  id:                  string
  slug:                string
  name:                string
  pco_service_type_id: string
}

interface PcoPlan {
  id: string
  attributes: {
    title:        string | null
    series_title: string | null
    sort_date:    string | null   // ISO 8601, e.g. "2026-01-05T09:00:00Z"
    dates:        string | null   // human-readable, e.g. "Jan 5, 2026"
  }
}

interface SyncResult {
  pco_plan_id: string
  event_date:  string
  name:        string
  action:      'upserted' | 'skipped' | 'error'
  error?:      string
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

  // ── 1. Look up session and PCO access token ───────────────────────────────
  const now = new Date().toISOString()

  const { data: session } = await supabase
    .from('user_sessions')
    .select('user_id, expires_at, pco_access_token')
    .eq('token', sessionToken)
    .gt('expires_at', now)
    .maybeSingle()

  if (!session) {
    return json(cors, 401, { error: 'Invalid or expired session token' })
  }

  if (!session.pco_access_token) {
    return json(cors, 401, {
      error: 'No PCO access token on this session. Please log out and log in again to re-authorise.',
    })
  }

  const pcoToken = session.pco_access_token as string

  // ── 2. Load service types that are linked to PCO ──────────────────────────
  const { data: serviceTypes, error: stErr } = await supabase
    .from('service_types')
    .select('id, slug, name, pco_service_type_id')
    .not('pco_service_type_id', 'is', null)

  if (stErr || !serviceTypes || serviceTypes.length === 0) {
    return json(cors, 500, { error: 'No service types configured for PCO sync' })
  }

  // ── 3. Determine date window ──────────────────────────────────────────────
  const today        = new Date().toISOString().slice(0, 10)
  const futureDate   = new Date()
  futureDate.setMonth(futureDate.getMonth() + SYNC_MONTHS_AHEAD)
  const futureDateStr = futureDate.toISOString().slice(0, 10)

  // ── 4. Fetch plans and upsert for each service type ───────────────────────
  const results: SyncResult[] = []
  let syncedCount  = 0
  let skippedCount = 0

  for (const st of serviceTypes as ServiceType[]) {
    // PCO plans endpoint — filter to a date range
    const url = `${PCO_API_BASE}/service_types/${st.pco_service_type_id}/plans`
      + `?filter=future`
      + `&per_page=25`
      + `&order=sort_date`

    let plans: PcoPlan[]

    try {
      const pcoRes = await fetch(url, {
        headers: { Authorization: `Bearer ${pcoToken}` },
      })

      if (!pcoRes.ok) {
        const errText = await pcoRes.text()
        console.error(`PCO fetch failed for ${st.slug} (${pcoRes.status}):`, errText)
        results.push({
          pco_plan_id: '',
          event_date:  '',
          name:        st.name,
          action:      'error',
          error:       `PCO API ${pcoRes.status}: ${errText.slice(0, 200)}`,
        })
        skippedCount++
        continue
      }

      const body = await pcoRes.json() as { data: PcoPlan[] }
      plans = body.data ?? []
    } catch (err) {
      console.error(`Network error fetching PCO plans for ${st.slug}:`, err)
      results.push({
        pco_plan_id: '',
        event_date:  '',
        name:        st.name,
        action:      'error',
        error:       err instanceof Error ? err.message : 'Network error',
      })
      skippedCount++
      continue
    }

    // Upsert each plan into the events table
    for (const plan of plans) {
      const sortDate  = plan.attributes.sort_date
      if (!sortDate) { skippedCount++; continue }

      const eventDate = sortDate.slice(0, 10)

      // Skip plans outside our window
      if (eventDate < today || eventDate > futureDateStr) {
        skippedCount++
        continue
      }

      // Derive event name:
      // • Special events: use title if present, else series_title
      // • Regular services: use the service type name + formatted date
      let eventName: string
      if (plan.attributes.title) {
        eventName = plan.attributes.title
      } else if (plan.attributes.series_title) {
        eventName = plan.attributes.series_title
      } else {
        // Matches the format used by getOrCreateTodayEvents
        const d = new Date(eventDate + 'T12:00:00')
        const formatted = d.toLocaleDateString('en-US', {
          month: 'long', day: 'numeric', year: 'numeric',
        })
        eventName = `${st.name} · ${formatted}`
      }

      const eventTime = DEFAULT_EVENT_TIMES[st.slug] ?? null

      // Upsert on (service_type_id, event_date) — stamps pco_plan_id onto
      // any existing row created by getOrCreateTodayEvents.
      const { error: upsertErr } = await supabase
        .from('events')
        .upsert(
          {
            service_type_id: st.id,
            pco_plan_id:     plan.id,
            name:            eventName,
            event_date:      eventDate,
            event_time:      eventTime,
          },
          { onConflict: 'service_type_id,event_date' },
        )

      if (upsertErr) {
        console.error(`Upsert error for plan ${plan.id}:`, upsertErr.message)
        results.push({
          pco_plan_id: plan.id,
          event_date:  eventDate,
          name:        eventName,
          action:      'error',
          error:       upsertErr.message,
        })
        skippedCount++
      } else {
        results.push({ pco_plan_id: plan.id, event_date: eventDate, name: eventName, action: 'upserted' })
        syncedCount++
      }
    }
  }

  // ── 5. Record last-synced timestamp in app_config ─────────────────────────
  await supabase.from('app_config').upsert({
    key:        'pco_last_synced',
    value:      new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })

  return json(cors, 200, {
    synced:   syncedCount,
    skipped:  skippedCount,
    details:  results,
  })
})
