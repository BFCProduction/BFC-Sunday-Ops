import { createClient } from 'npm:@supabase/supabase-js@2'

// ─────────────────────────────────────────────────────────────────────────────
// pco-auth edge function
//
// Handles the server-side leg of the PCO OAuth2 flow:
//   1. Receives { code, redirect_uri } from the frontend
//   2. Exchanges the code for a PCO access token (client secret stays here)
//   3. Fetches the user's identity from PCO /people/v2/me
//   4. Upserts a row in public.users
//   5. Creates a session token in public.user_sessions
//   6. Returns { user, token, expires_at } to the frontend
//
// Required Supabase secrets (supabase secrets set KEY=value):
//   PCO_CLIENT_ID      — from your PCO developer app
//   PCO_CLIENT_SECRET  — from your PCO developer app
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = [
  'https://bfcproduction.github.io',
  'http://localhost:5173',
]

function corsHeaders(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

function json(cors: Record<string, string>, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  const cors   = corsHeaders(origin)

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST')    return json(cors, 405, { error: 'Method not allowed' })

  try {
    const { code, redirect_uri } = await req.json()

    if (!code || !redirect_uri) {
      return json(cors, 400, { error: 'Missing code or redirect_uri' })
    }

    const pcoClientId     = Deno.env.get('PCO_CLIENT_ID')
    const pcoClientSecret = Deno.env.get('PCO_CLIENT_SECRET')

    if (!pcoClientId || !pcoClientSecret) {
      console.error('PCO_CLIENT_ID or PCO_CLIENT_SECRET not configured')
      return json(cors, 500, { error: 'PCO credentials not configured on server' })
    }

    // ── 1. Exchange authorization code for PCO access token ──────────────────
    const tokenRes = await fetch('https://api.planningcenteronline.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type:    'authorization_code',
        code,
        client_id:     pcoClientId,
        client_secret: pcoClientSecret,
        redirect_uri,
      }),
    })

    if (!tokenRes.ok) {
      const err = await tokenRes.text()
      console.error('PCO token exchange failed:', err)
      return json(cors, 400, { error: 'PCO token exchange failed' })
    }

    const tokens = await tokenRes.json() as {
      access_token:  string
      refresh_token?: string
      expires_in?:    number
      token_type?:    string
    }

    // Calculate PCO token expiry from expires_in (seconds)
    const pcoTokenExpiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null

    // ── 2. Fetch user identity from PCO ──────────────────────────────────────
    // Include emails so we can find the primary one
    const meRes = await fetch(
      'https://api.planningcenteronline.com/people/v2/me?include=emails',
      { headers: { 'Authorization': `Bearer ${tokens.access_token}` } }
    )

    if (!meRes.ok) {
      return json(cors, 400, { error: 'Failed to fetch PCO user info' })
    }

    const meData = await meRes.json() as {
      data: {
        id: string
        attributes: {
          name: string
          avatar: string | null
        }
      }
      included?: Array<{
        type: string
        attributes: { address: string; primary: boolean; location: string }
      }>
    }

    const pcoId    = meData.data.id
    const { name, avatar } = meData.data.attributes

    // Prefer primary email, fall back to first email found
    let email: string | null = null
    if (meData.included) {
      const primaryEmail = meData.included.find(
        inc => inc.type === 'Email' && inc.attributes.primary
      )
      const anyEmail = meData.included.find(inc => inc.type === 'Email')
      email = (primaryEmail ?? anyEmail)?.attributes.address ?? null
    }

    // ── 3. Upsert user in Sunday Ops database ────────────────────────────────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: user, error: upsertErr } = await supabase
      .from('users')
      .upsert(
        {
          pco_id:     pcoId,
          name,
          email,
          avatar_url: avatar ?? null,
          last_login: new Date().toISOString(),
        },
        { onConflict: 'pco_id' }
      )
      .select('id, pco_id, name, email, avatar_url, is_admin')
      .single()

    if (upsertErr || !user) {
      console.error('User upsert error:', upsertErr)
      return json(cors, 500, { error: `Failed to save user: ${upsertErr?.message ?? 'no user returned'}` })
    }

    // ── 4. Create a session token ─────────────────────────────────────────────
    const { data: session, error: sessionErr } = await supabase
      .from('user_sessions')
      .insert({
        user_id:              user.id,
        pco_access_token:     tokens.access_token,
        pco_refresh_token:    tokens.refresh_token    ?? null,
        pco_token_expires_at: pcoTokenExpiresAt,
      })
      .select('token, expires_at')
      .single()

    if (sessionErr || !session) {
      console.error('Session creation error:', sessionErr)
      return json(cors, 500, { error: 'Failed to create session' })
    }

    return json(cors, 200, {
      user,
      token:      session.token,
      expires_at: session.expires_at,
    })

  } catch (err) {
    console.error('Unexpected error in pco-auth:', err)
    return json(cors, 500, { error: 'Internal server error' })
  }
})
