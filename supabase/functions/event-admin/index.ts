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
    'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
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

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
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
    const adminUser = await verifyAdminSession(supabase, request.headers.get('x-session-token'))
    if (!adminUser) {
      return jsonResponse(corsHeaders, 401, { error: 'Unauthorized' })
    }

    if (request.method !== 'DELETE') {
      return jsonResponse(corsHeaders, 405, { error: 'Method not allowed' })
    }

    const body = await request.json().catch(() => ({}))
    const eventId = typeof body?.event_id === 'string' ? body.event_id : ''
    if (!eventId || !isUuid(eventId)) {
      return jsonResponse(corsHeaders, 400, { error: 'A valid event_id is required' })
    }

    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, name, legacy_special_event_id')
      .eq('id', eventId)
      .maybeSingle()

    if (eventError) throw eventError
    if (!event) {
      return jsonResponse(corsHeaders, 404, { error: 'Event not found' })
    }

    const eventIdsForIssueCleanup = [eventId]
    if (event.legacy_special_event_id) eventIdsForIssueCleanup.push(event.legacy_special_event_id)

    const [{ data: issues }, { data: docs }] = await Promise.all([
      supabase
        .from('issues')
        .select('id')
        .in('event_id', eventIdsForIssueCleanup),
      supabase
        .from('production_docs')
        .select('storage_path')
        .eq('event_id', eventId)
        .not('storage_path', 'is', null),
    ])

    const issueIds = (issues ?? []).map(row => row.id).filter(Boolean)
    if (issueIds.length > 0) {
      const { data: photos } = await supabase
        .from('issue_photos')
        .select('storage_path')
        .in('issue_id', issueIds)

      const photoPaths = (photos ?? [])
        .map(row => row.storage_path)
        .filter((path): path is string => typeof path === 'string' && path.length > 0)

      if (photoPaths.length > 0) {
        await supabase.storage.from('issue-photos').remove(photoPaths)
      }
    }

    const docPaths = (docs ?? [])
      .map(row => row.storage_path)
      .filter((path): path is string => typeof path === 'string' && path.length > 0)

    if (docPaths.length > 0) {
      await supabase.storage.from('production-docs').remove(docPaths)
    }

    const { error: deleteEventError } = await supabase
      .from('events')
      .delete()
      .eq('id', eventId)

    if (deleteEventError) throw deleteEventError

    if (event.legacy_special_event_id) {
      const { error: deleteLegacyError } = await supabase
        .from('special_events')
        .delete()
        .eq('id', event.legacy_special_event_id)

      if (deleteLegacyError) throw deleteLegacyError
    }

    return jsonResponse(corsHeaders, 200, {
      ok: true,
      deleted: { id: event.id, name: event.name },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return jsonResponse(corsHeaders, 500, { error: message })
  }
})
