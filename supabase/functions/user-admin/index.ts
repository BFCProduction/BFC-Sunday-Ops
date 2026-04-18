import { createClient } from 'npm:@supabase/supabase-js@2'

const ALLOWED_ORIGINS = [
  'https://bfcproduction.github.io',
  'http://localhost:5173',
]

function getCorsHeaders(request: Request) {
  const origin = request.headers.get('Origin') ?? ''
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-token',
  }
}

function jsonResponse(corsHeaders: Record<string, string>, status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function verifyAdminSession(
  supabase: ReturnType<typeof createClient>,
  token: string | null,
): Promise<{ id: string } | null> {
  if (!token) return null

  const now = new Date().toISOString()

  const { data: session } = await supabase
    .from('user_sessions')
    .select('user_id, expires_at')
    .eq('token', token)
    .gt('expires_at', now)
    .maybeSingle()

  if (!session) return null

  const { data: user } = await supabase
    .from('users')
    .select('id, is_admin')
    .eq('id', session.user_id)
    .eq('is_admin', true)
    .maybeSingle()

  if (!user) return null

  supabase
    .from('user_sessions')
    .update({ last_used_at: now })
    .eq('token', token)
    .then(() => {})

  return user
}

Deno.serve(async request => {
  const corsHeaders = getCorsHeaders(request)

  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_KEY')
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error('Missing Supabase function secrets')
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

    const sessionToken = request.headers.get('x-session-token')
    const adminUser = await verifyAdminSession(supabase, sessionToken)
    if (!adminUser) {
      return jsonResponse(corsHeaders, 401, { error: 'Unauthorized' })
    }

    // GET — return all users ordered by most recent login
    if (request.method === 'GET') {
      const { data: users, error } = await supabase
        .from('users')
        .select('id, pco_id, name, email, avatar_url, is_admin, last_login, created_at')
        .order('last_login', { ascending: false, nullsFirst: false })

      if (error) throw error

      return jsonResponse(corsHeaders, 200, { users: users ?? [] })
    }

    // PATCH — update is_admin for a single user
    if (request.method === 'PATCH') {
      const body = await request.json().catch(() => ({}))
      const userId  = typeof body?.user_id  === 'string'  ? body.user_id  : ''
      const isAdmin = typeof body?.is_admin === 'boolean' ? body.is_admin : null

      if (!userId) {
        return jsonResponse(corsHeaders, 400, { error: 'user_id is required' })
      }
      if (isAdmin === null) {
        return jsonResponse(corsHeaders, 400, { error: 'is_admin (boolean) is required' })
      }
      if (userId === adminUser.id && !isAdmin) {
        return jsonResponse(corsHeaders, 400, { error: 'You cannot remove your own admin access' })
      }

      const { data: updated, error } = await supabase
        .from('users')
        .update({ is_admin: isAdmin })
        .eq('id', userId)
        .select('id, pco_id, name, email, avatar_url, is_admin, last_login, created_at')
        .single()

      if (error) throw error

      return jsonResponse(corsHeaders, 200, { user: updated })
    }

    return jsonResponse(corsHeaders, 405, { error: 'Method not allowed' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return jsonResponse(corsHeaders, 500, { error: message })
  }
})
