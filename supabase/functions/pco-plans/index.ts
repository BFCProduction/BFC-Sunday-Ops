// deno-lint-ignore-file no-import-prefix no-explicit-any
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
const PCO_TOKEN_URL = 'https://api.planningcenteronline.com/oauth/token'
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

interface UserSession {
  pco_access_token:     string | null
  pco_refresh_token:    string | null
  pco_token_expires_at: string | null
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
      return json(cors, 502, {
        error: `Unable to fetch PCO plans for ${st.name}`,
        details: debugLog,
      })
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
