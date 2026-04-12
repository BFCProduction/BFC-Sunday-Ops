import { createClient } from 'npm:@supabase/supabase-js@2'

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

const MONTHS_BACK   = 3
const MONTHS_AHEAD  = 6

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
    sort_date:    string | null
    dates:        string | null
  }
}

export interface PcoPlanResult {
  id:           string
  title:        string | null
  series_title: string | null
  event_date:   string         // YYYY-MM-DD
  display_date: string         // human-readable, e.g. "Jan 5, 2026"
}

export interface PcoServiceTypeResult {
  slug:  string
  name:  string
  plans: PcoPlanResult[]
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
    .select('pco_access_token')
    .eq('token', sessionToken)
    .gt('expires_at', now)
    .maybeSingle()

  if (!session?.pco_access_token) {
    return json(cors, 401, { error: 'Invalid or expired session, or no PCO token' })
  }

  const pcoToken = session.pco_access_token as string

  // ── 2. Load service types linked to PCO ───────────────────────────────────
  const { data: serviceTypes } = await supabase
    .from('service_types')
    .select('id, slug, name, pco_service_type_id')
    .not('pco_service_type_id', 'is', null)

  if (!serviceTypes || serviceTypes.length === 0) {
    return json(cors, 200, { service_types: [] })
  }

  // ── 3. Determine date window ──────────────────────────────────────────────
  const pastDate   = new Date()
  pastDate.setMonth(pastDate.getMonth() - MONTHS_BACK)
  const pastStr    = pastDate.toISOString().slice(0, 10)

  const futureDate = new Date()
  futureDate.setMonth(futureDate.getMonth() + MONTHS_AHEAD)
  const futureStr  = futureDate.toISOString().slice(0, 10)

  // ── 4. Fetch plans for each service type ──────────────────────────────────
  const results: PcoServiceTypeResult[] = []

  for (const st of serviceTypes as ServiceType[]) {
    // Fetch upcoming plans (PCO filter=future) and recent ones separately
    // since PCO's API doesn't support a custom past range easily.
    // We pull all non-archived plans and filter client-side.
    const url = `${PCO_API_BASE}/service_types/${st.pco_service_type_id}/plans`
      + `?per_page=50&order=sort_date`

    let plans: PcoPlan[] = []

    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${pcoToken}` },
      })

      if (res.ok) {
        const body = await res.json() as { data: PcoPlan[] }
        plans = body.data ?? []
      }
    } catch {
      // Silently skip — don't fail the whole request if one service type errors
    }

    const filtered: PcoPlanResult[] = plans
      .filter(p => {
        if (!p.attributes.sort_date) return false
        const d = p.attributes.sort_date.slice(0, 10)
        return d >= pastStr && d <= futureStr
      })
      .map(p => {
        const eventDate = p.attributes.sort_date!.slice(0, 10)
        const d = new Date(eventDate + 'T12:00:00')
        const displayDate = d.toLocaleDateString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
        })
        return {
          id:           p.id,
          title:        p.attributes.title || null,
          series_title: p.attributes.series_title || null,
          event_date:   eventDate,
          display_date: displayDate,
        }
      })
      // Sort newest first so the picker defaults to the most recent
      .sort((a, b) => b.event_date.localeCompare(a.event_date))

    results.push({ slug: st.slug, name: st.name, plans: filtered })
  }

  return json(cors, 200, { service_types: results })
})
