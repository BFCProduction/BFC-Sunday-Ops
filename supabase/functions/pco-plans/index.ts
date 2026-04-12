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

    for (const url of [urlFuture, urlRecent]) {
      try {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${pcoToken}` },
        })
        if (res.ok) {
          const body = await res.json() as { data: PcoPlan[] }
          const count = (body.data ?? []).length
          debugLog.push(`${res.status} OK — ${count} plans from ${url}`)
          plans = plans.concat(body.data ?? [])
        } else {
          const errText = await res.text().catch(() => '')
          debugLog.push(`${res.status} ERROR from ${url}: ${errText.slice(0, 300)}`)
        }
      } catch (err) {
        debugLog.push(`NETWORK ERROR for ${url}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    const filtered: PcoPlanResult[] = plans
      .filter(p => !!p.attributes.sort_date)
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
      .filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i)
      .sort((a, b) => b.event_date.localeCompare(a.event_date))

    results.push({ slug: st.slug, name: st.name, plans: filtered, _debug: debugLog } as unknown as PcoServiceTypeResult)
  }

  return json(cors, 200, { service_types: results, _debug: true })
})
