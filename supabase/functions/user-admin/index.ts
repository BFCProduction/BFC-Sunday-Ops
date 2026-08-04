// deno-lint-ignore-file no-import-prefix
import { createClient } from 'npm:@supabase/supabase-js@2'
import { verifyMinimumAccess, type AppAccessLevel } from '../_shared/app-auth.ts'

const ALLOWED_ORIGINS = [
  'https://bfcproduction.github.io',
  'http://localhost:5173',
]

function getCorsHeaders(request: Request) {
  const origin = request.headers.get('Origin') ?? ''
  return {
    'Access-Control-Allow-Origin':  ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-token',
    'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
  }
}

function jsonResponse(corsHeaders: Record<string, string>, status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
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
    const adminUser = await verifyMinimumAccess(supabase, sessionToken, 'admin')
    if (!adminUser) {
      return jsonResponse(corsHeaders, 401, { error: 'Unauthorized' })
    }

    // GET — return all users ordered by most recent login
    if (request.method === 'GET') {
      const { data: users, error } = await supabase
        .from('users')
        .select('id, pco_id, name, email, avatar_url, access_level, is_admin, last_login, created_at')
        .order('last_login', { ascending: false, nullsFirst: false })

      if (error) throw error

      return jsonResponse(corsHeaders, 200, { users: users ?? [] })
    }

    // PATCH — update the durable User / Manager / Admin access level.
    if (request.method === 'PATCH') {
      const body = await request.json().catch(() => ({}))
      const userId = typeof body?.user_id === 'string' ? body.user_id : ''
      const accessLevel = typeof body?.access_level === 'string'
        ? body.access_level
        : typeof body?.is_admin === 'boolean'
          ? (body.is_admin ? 'admin' : 'user')
          : ''

      if (!userId) {
        return jsonResponse(corsHeaders, 400, { error: 'user_id is required' })
      }
      if (!['user', 'manager', 'admin'].includes(accessLevel)) {
        return jsonResponse(corsHeaders, 400, { error: 'access_level must be user, manager, or admin' })
      }
      if (userId === adminUser.id && accessLevel !== 'admin') {
        return jsonResponse(corsHeaders, 400, { error: 'You cannot remove your own admin access' })
      }

      const { data: updated, error } = await supabase
        .from('users')
        .update({ access_level: accessLevel as AppAccessLevel })
        .eq('id', userId)
        .select('id, pco_id, name, email, avatar_url, access_level, is_admin, last_login, created_at')
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
