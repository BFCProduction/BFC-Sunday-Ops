// deno-lint-ignore-file no-import-prefix
import { createClient } from 'npm:@supabase/supabase-js@2'
import { hasAccessLevel, verifyAppSession } from '../_shared/app-auth.ts'
import { getValidPcoToken, pcoReauthBody, type PcoSessionTokens } from '../_shared/pco-token.ts'
import { syncPcoFolders } from '../_shared/pco-folders.ts'

const ALLOWED_ORIGINS = [
  'https://bfcproduction.github.io',
  'http://localhost:5173',
]

function corsHeaders(request: Request) {
  const origin = request.headers.get('Origin') ?? ''
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-token',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  }
}

function json(cors: Record<string, string>, status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function asUuid(value: unknown) {
  return typeof value === 'string' && isUuid(value) ? value : null
}

Deno.serve(async request => {
  const cors = corsHeaders(request)
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'GET' && request.method !== 'POST') {
    return json(cors, 405, { error: 'Method not allowed' })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_KEY')
  if (!supabaseUrl || !serviceKey) return json(cors, 500, { error: 'Missing Supabase function secrets' })

  const supabase = createClient(supabaseUrl, serviceKey)
  const sessionToken = request.headers.get('x-session-token')
  const user = await verifyAppSession(supabase, sessionToken)
  if (!user) return json(cors, 401, { error: 'Invalid or expired session' })

  try {
    if (request.method === 'GET') {
      const url = new URL(request.url)
      const configuration = url.searchParams.get('configuration') === 'true'
      const includeArchived = url.searchParams.get('include_archived') === 'true'

      if (configuration) {
        if (!hasAccessLevel(user, 'admin')) return json(cors, 403, { error: 'Admin access required' })

        const [definitionsResult, foldersResult, defaultsResult, serviceTypesResult] = await Promise.all([
          supabase.from('module_definitions').select('*').eq('is_active', true).order('sort_order'),
          supabase.from('pco_folders').select('*').eq('is_active', true).order('sort_order'),
          supabase.from('module_folder_defaults').select('*').order('sort_order'),
          supabase.from('service_types').select('id, name, pco_service_type_id, pco_folder_id').order('sort_order'),
        ])

        const error = definitionsResult.error || foldersResult.error || defaultsResult.error || serviceTypesResult.error
        if (error) throw error

        return json(cors, 200, {
          definitions: definitionsResult.data ?? [],
          folders: foldersResult.data ?? [],
          defaults: defaultsResult.data ?? [],
          service_types: serviceTypesResult.data ?? [],
        })
      }

      const eventId = url.searchParams.get('event_id') ?? ''
      const workbookId = url.searchParams.get('workbook_id') ?? ''
      if ((!eventId && !workbookId) || (eventId && workbookId)) {
        return json(cors, 400, { error: 'Provide exactly one event_id or workbook_id' })
      }
      if ((eventId && !isUuid(eventId)) || (workbookId && !isUuid(workbookId))) {
        return json(cors, 400, { error: 'Invalid scope identifier' })
      }
      if (includeArchived && !hasAccessLevel(user, 'manager')) {
        return json(cors, 403, { error: 'Manager access required to view archived modules' })
      }

      let query = supabase
        .from('module_instances')
        .select('*, module_definitions(*)')
        .order('sort_order')
        .order('created_at')
      if (!includeArchived) query = query.eq('status', 'active')

      if (eventId) {
        const { data, error } = await query.eq('event_id', eventId)
        if (error) throw error
        return json(cors, 200, { workbook_modules: [], event_modules: data ?? [] })
      }

      const [{ data: workbookModules, error: workbookError }, { data: events, error: eventsError }] = await Promise.all([
        query.eq('workbook_id', workbookId),
        supabase.from('events').select('id, name, event_date, event_time').eq('workbook_id', workbookId).order('event_date').order('event_time'),
      ])
      if (workbookError || eventsError) throw workbookError || eventsError

      const eventIds = (events ?? []).map(event => event.id)
      let eventModules: unknown[] = []
      if (eventIds.length > 0) {
        let eventQuery = supabase
          .from('module_instances')
          .select('*, module_definitions(*)')
          .in('event_id', eventIds)
          .order('sort_order')
          .order('created_at')
        if (!includeArchived) eventQuery = eventQuery.eq('status', 'active')
        const { data, error } = await eventQuery
        if (error) throw error
        eventModules = data ?? []
      }

      return json(cors, 200, {
        workbook_modules: workbookModules ?? [],
        events: events ?? [],
        event_modules: eventModules,
      })
    }

    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const action = typeof body.action === 'string' ? body.action : ''

    if (action === 'sync_pco_folders') {
      if (!hasAccessLevel(user, 'admin')) return json(cors, 403, { error: 'Admin access required' })

      const { data: session } = await supabase
        .from('user_sessions')
        .select('pco_access_token, pco_refresh_token, pco_token_expires_at')
        .eq('token', sessionToken)
        .maybeSingle()
      if (!session || !sessionToken) return json(cors, 401, { error: 'Invalid or expired session' })

      let pcoToken: string
      try {
        pcoToken = await getValidPcoToken(supabase, sessionToken, session as PcoSessionTokens)
      } catch (error) {
        return json(cors, 401, pcoReauthBody(error))
      }

      const result = await syncPcoFolders(supabase, pcoToken)
      return json(cors, 200, result)
    }

    if (action === 'set_folder_defaults') {
      if (!hasAccessLevel(user, 'admin')) return json(cors, 403, { error: 'Admin access required' })
      const folderId = typeof body.pco_folder_id === 'string' ? body.pco_folder_id : ''
      const defaults = Array.isArray(body.defaults) ? body.defaults : null
      if (!folderId || !defaults) return json(cors, 400, { error: 'pco_folder_id and defaults are required' })

      const normalized = defaults.map((value, index) => {
        const item = value as Record<string, unknown>
        return {
          module_key: typeof item.module_key === 'string' ? item.module_key : '',
          title: typeof item.title === 'string' ? item.title : '',
          sort_order: index,
        }
      })
      if (normalized.some(item => !item.module_key)) {
        return json(cors, 400, { error: 'Every default requires a module_key' })
      }

      const { error } = await supabase.rpc('set_module_folder_defaults', {
        target_pco_folder_id: folderId,
        defaults: normalized,
      })
      if (error) throw error
      return json(cors, 200, { ok: true })
    }

    if (!hasAccessLevel(user, 'manager')) return json(cors, 403, { error: 'Manager access required' })

    if (action === 'create') {
      const eventId = asUuid(body.event_id)
      const workbookId = asUuid(body.workbook_id)
      const moduleKey = typeof body.module_key === 'string' ? body.module_key : ''
      const locationId = body.location_id == null ? null : asUuid(body.location_id)
      const title = typeof body.title === 'string' ? body.title.trim() : ''
      if ((!eventId && !workbookId) || (eventId && workbookId) || !moduleKey) {
        return json(cors, 400, { error: 'module_key and exactly one event_id or workbook_id are required' })
      }
      if (body.location_id != null && !locationId) return json(cors, 400, { error: 'Invalid location_id' })

      const { data, error } = await supabase
        .from('module_instances')
        .insert({
          module_key: moduleKey,
          title: title || null,
          event_id: eventId,
          workbook_id: workbookId,
          location_id: locationId,
          created_by: user.id,
        })
        .select('*, module_definitions(*)')
        .single()
      if (error) throw error
      return json(cors, 201, { module: data })
    }

    if (action === 'archive' || action === 'restore') {
      const moduleId = asUuid(body.module_id)
      if (!moduleId) return json(cors, 400, { error: 'A valid module_id is required' })
      const archived = action === 'archive'
      const { data, error } = await supabase
        .from('module_instances')
        .update({
          status: archived ? 'archived' : 'active',
          archived_by: archived ? user.id : null,
          archived_at: archived ? new Date().toISOString() : null,
        })
        .eq('id', moduleId)
        .select('*, module_definitions(*)')
        .single()
      if (error) throw error
      return json(cors, 200, { module: data })
    }

    if (action === 'apply_event_defaults') {
      const eventId = asUuid(body.event_id)
      if (!eventId) return json(cors, 400, { error: 'A valid event_id is required' })
      const { data, error } = await supabase.rpc('apply_event_module_defaults', {
        target_event_id: eventId,
        actor_user_id: user.id,
      })
      if (error) throw error
      return json(cors, 200, { modules: data ?? [] })
    }

    if (action === 'reorder') {
      const orderedIds = Array.isArray(body.ordered_ids) ? body.ordered_ids.filter(asUuid) : []
      if (orderedIds.length === 0) return json(cors, 400, { error: 'ordered_ids are required' })
      const { error } = await supabase.rpc('reorder_module_instances', { ordered_ids: orderedIds })
      if (error) throw error
      return json(cors, 200, { ok: true })
    }

    return json(cors, 400, { error: 'Unknown module action' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return json(cors, 500, { error: message })
  }
})
