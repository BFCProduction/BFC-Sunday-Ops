// deno-lint-ignore-file no-import-prefix
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { hasAccessLevel, verifyAppSession, type AppSessionUser } from '../_shared/app-auth.ts'

const ALLOWED_ORIGINS = [
  'https://bfcproduction.github.io',
  'http://localhost:5173',
]

const DOCUMENT_TYPES = new Set(['stage_plot', 'input_list', 'run_sheet', 'other'])

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

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function safeFilename(filename: string) {
  const normalized = filename.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return normalized.slice(-120) || 'document.pdf'
}

function isSafeDocumentUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
      && (url.hostname === 'docs.google.com' || url.hostname === 'drive.google.com')
  } catch {
    return false
  }
}

function isSafeHttpUrl(value: string) {
  if (!value) return true
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function nullableUuid(value: unknown) {
  return value == null || value === '' ? null : isUuid(value) ? value : undefined
}

function nullableTime(value: unknown) {
  if (value == null || value === '') return null
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)
    ? value.slice(0, 5)
    : undefined
}

function isUniqueViolation(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error
    && (error as { code?: unknown }).code === '23505'
}

interface ModuleRow {
  id: string
  module_key: string
  title: string | null
  event_id: string | null
  workbook_id: string | null
  location_id: string | null
  status: 'active' | 'archived'
  sort_order: number
  created_at: string
  updated_at: string
}

interface CrewRow {
  id: string
  module_instance_id: string
  workbook_id: string | null
  event_id: string | null
  scheduled_date: string
  user_id: string | null
  person_name: string | null
  is_open: boolean
  role_id: string | null
  call_time: string | null
  release_time: string | null
  is_paid: boolean
  sort_order: number
  sort_order_overridden: boolean
  source: 'manual' | 'pco'
  pco_plan_person_id: string | null
  pco_person_id: string | null
  pco_role_name: string | null
  pco_status: string | null
  pco_photo_url: string | null
  pco_synced_at: string | null
  created_at: string
  updated_at: string
}

const EMPTY_CONTENT = {
  input_list_values: [],
  documents: [],
  crew: [],
  supplies: [],
  roles: [],
  people: [],
  departments: [],
  intercom_channels: [],
  intercom_assignments: [],
  intercom_config: { pack_types: [], master_channels: [] },
}

async function loadRoles(supabase: SupabaseClient, includeFinancials: boolean) {
  const { data: roles, error } = await supabase
    .from('roles')
    .select('id, name, department_id, sort_order, created_at')
    .order('sort_order')
    .order('name')
  if (error) throw error
  if (!includeFinancials || !(roles ?? []).length) {
    return (roles ?? []).map(role => ({ ...role, hourly_rate: 0 }))
  }
  const { data: financials, error: financialError } = await supabase
    .from('role_financials')
    .select('role_id, hourly_rate')
    .in('role_id', (roles ?? []).map(role => role.id))
  if (financialError) throw financialError
  const rateByRole = new Map((financials ?? []).map(row => [row.role_id, Number(row.hourly_rate) || 0]))
  return (roles ?? []).map(role => ({ ...role, hourly_rate: rateByRole.get(role.id) ?? 0 }))
}

async function loadPeople(supabase: SupabaseClient, crew: CrewRow[]) {
  const ids = [...new Set(crew.map(row => row.user_id).filter((id): id is string => Boolean(id)))]
  if (!ids.length) return []
  const { data, error } = await supabase
    .from('users')
    .select('id, name, avatar_url')
    .in('id', ids)
  if (error) throw error
  return data ?? []
}

async function loadCrew(supabase: SupabaseClient, moduleId: string, includeFinancials: boolean) {
  const { data, error } = await supabase
    .from('workbook_crew')
    .select('*')
    .eq('module_instance_id', moduleId)
    .order('scheduled_date')
    .order('sort_order')
    .order('created_at')
  if (error) throw error
  const crew = (data ?? []) as CrewRow[]
  if (!includeFinancials || !crew.length) return crew.map(row => ({ ...row, is_paid: false }))
  const { data: financials, error: financialError } = await supabase
    .from('workbook_crew_financials')
    .select('crew_id, is_paid')
    .in('crew_id', crew.map(row => row.id))
  if (financialError) throw financialError
  const paidByCrew = new Map((financials ?? []).map(row => [row.crew_id, row.is_paid]))
  return crew.map(row => ({ ...row, is_paid: paidByCrew.get(row.id) ?? false }))
}

async function loadSupplies(supabase: SupabaseClient, moduleId: string, includeFinancials: boolean) {
  const { data, error } = await supabase
    .from('workbook_supplies')
    .select('*')
    .eq('module_instance_id', moduleId)
    .order('sort_order')
    .order('created_at')
  if (error) throw error
  const supplies = data ?? []
  if (!includeFinancials || !supplies.length) return supplies.map(row => ({ ...row, unit_price: 0 }))
  const { data: financials, error: financialError } = await supabase
    .from('workbook_supply_financials')
    .select('supply_id, unit_price')
    .in('supply_id', supplies.map(row => row.id))
  if (financialError) throw financialError
  const priceBySupply = new Map((financials ?? []).map(row => [row.supply_id, Number(row.unit_price) || 0]))
  return supplies.map(row => ({ ...row, unit_price: priceBySupply.get(row.id) ?? 0 }))
}

async function loadIntercom(supabase: SupabaseClient, moduleId: string) {
  const [{ data: channels, error: channelError }, { data: assignmentRows, error: assignmentError }] = await Promise.all([
    supabase.from('workbook_intercom_channels').select('*').eq('module_instance_id', moduleId).order('sort_order'),
    supabase.from('workbook_intercom_assignments').select('*').eq('module_instance_id', moduleId).order('created_at'),
  ])
  if (channelError || assignmentError) throw channelError || assignmentError
  const assignmentIds = (assignmentRows ?? []).map(row => row.id)
  const { data: states, error: stateError } = assignmentIds.length
    ? await supabase.from('workbook_intercom_channel_assignments').select('*').in('assignment_id', assignmentIds)
    : { data: [], error: null }
  if (stateError) throw stateError
  const statesByAssignment = new Map<string, Record<string, unknown>>()
  for (const state of states ?? []) {
    const values = statesByAssignment.get(state.assignment_id) ?? {}
    values[state.event_channel_id] = {
      talk_mode: state.button_mode,
      listen_mode: state.listen_mode,
      program_enabled: state.program_enabled,
    }
    statesByAssignment.set(state.assignment_id, values)
  }
  return {
    channels: channels ?? [],
    assignments: (assignmentRows ?? []).map(row => ({
      ...row,
      channel_states: statesByAssignment.get(row.id) ?? {},
    })),
  }
}

async function crewModuleIdsForIntercom(supabase: SupabaseClient, module: ModuleRow) {
  if (module.event_id) {
    const [{ data: eventModules, error: eventModuleError }, { data: event, error: eventError }] = await Promise.all([
      supabase.from('module_instances').select('id').eq('module_key', 'crew').eq('event_id', module.event_id).eq('status', 'active'),
      supabase.from('events').select('workbook_id').eq('id', module.event_id).maybeSingle(),
    ])
    if (eventModuleError || eventError) throw eventModuleError || eventError
    let sharedModules: Array<{ id: string }> = []
    if (event?.workbook_id) {
      const { data, error } = await supabase
        .from('module_instances')
        .select('id')
        .eq('module_key', 'crew')
        .eq('workbook_id', event.workbook_id)
        .eq('status', 'active')
      if (error) throw error
      sharedModules = data ?? []
    }
    return [...(eventModules ?? []), ...sharedModules].map(row => row.id)
  }
  if (!module.workbook_id) return []
  const [{ data: shared, error: sharedError }, { data: events, error: eventError }] = await Promise.all([
    supabase.from('module_instances').select('id').eq('module_key', 'crew').eq('workbook_id', module.workbook_id).eq('status', 'active'),
    supabase.from('events').select('id').eq('workbook_id', module.workbook_id),
  ])
  if (sharedError || eventError) throw sharedError || eventError
  const eventIds = (events ?? []).map(row => row.id)
  let eventModules: Array<{ id: string }> = []
  if (eventIds.length) {
    const { data, error } = await supabase
      .from('module_instances')
      .select('id')
      .eq('module_key', 'crew')
      .in('event_id', eventIds)
      .eq('status', 'active')
    if (error) throw error
    eventModules = data ?? []
  }
  return [...(shared ?? []), ...eventModules].map(row => row.id)
}

async function loadIntercomCrew(supabase: SupabaseClient, module: ModuleRow) {
  const moduleIds = await crewModuleIdsForIntercom(supabase, module)
  if (!moduleIds.length) return []
  const { data, error } = await supabase
    .from('workbook_crew')
    .select('*')
    .in('module_instance_id', moduleIds)
    .order('scheduled_date')
    .order('sort_order')
  if (error) throw error
  return (data ?? []) as CrewRow[]
}

async function loadModuleContent(
  supabase: SupabaseClient,
  module: ModuleRow,
  user: AppSessionUser,
) {
  const base = { ...EMPTY_CONTENT, module }
  if (module.module_key === 'input_list') {
    const { data, error } = await supabase
      .from('module_input_list_values')
      .select('module_instance_id, row_id, column_id, value, updated_at')
      .eq('module_instance_id', module.id)
    if (error) throw error
    return { ...base, input_list_values: data ?? [] }
  }
  if (module.module_key === 'production_documents') {
    const { data, error } = await supabase
      .from('production_docs')
      .select('*')
      .eq('module_instance_id', module.id)
      .order('uploaded_at')
    if (error) throw error
    return { ...base, documents: data ?? [] }
  }
  if (module.module_key === 'crew') {
    const [crew, roles] = await Promise.all([
      loadCrew(supabase, module.id, hasAccessLevel(user, 'admin')),
      loadRoles(supabase, hasAccessLevel(user, 'admin')),
    ])
    return { ...base, crew, roles, people: await loadPeople(supabase, crew) }
  }
  if (module.module_key === 'supplies') {
    const [supplies, departments] = await Promise.all([
      loadSupplies(supabase, module.id, hasAccessLevel(user, 'admin')),
      supabase.from('departments').select('*').order('sort_order').then(result => {
        if (result.error) throw result.error
        return result.data ?? []
      }),
    ])
    return { ...base, supplies, departments }
  }
  if (module.module_key === 'intercom') {
    const [intercom, crew, roles, packTypes, masterChannels] = await Promise.all([
      loadIntercom(supabase, module.id),
      loadIntercomCrew(supabase, module),
      loadRoles(supabase, false),
      supabase.from('intercom_pack_types').select('*').order('sort_order').then(result => {
        if (result.error) throw result.error
        return result.data ?? []
      }),
      supabase.from('intercom_channels').select('*').eq('is_active', true).order('sort_order').then(result => {
        if (result.error) throw result.error
        return result.data ?? []
      }),
    ])
    return {
      ...base,
      crew,
      roles,
      people: await loadPeople(supabase, crew),
      intercom_channels: intercom.channels,
      intercom_assignments: intercom.assignments,
      intercom_config: { pack_types: packTypes, master_channels: masterChannels },
    }
  }
  return base
}

function normalizedPersonKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

async function prepareIntercom(supabase: SupabaseClient, module: ModuleRow) {
  const crew = await loadIntercomCrew(supabase, module)
  const people = await loadPeople(supabase, crew)
  const personById = new Map(people.map(person => [person.id, person.name]))
  const identities = new Map<string, { key: string; roleId: string | null }>()
  for (const row of crew) {
    const name = row.user_id ? personById.get(row.user_id) : row.person_name
    const key = row.user_id
      ? `user:${row.user_id}`
      : row.is_open
        ? `open:${row.id}`
        : `name:${normalizedPersonKey(name ?? 'unknown')}`
    const existing = identities.get(key)
    identities.set(key, { key, roleId: existing?.roleId ?? row.role_id })
  }

  let intercom = await loadIntercom(supabase, module.id)
  if (!intercom.channels.length) {
    const { data: masterChannels, error } = await supabase
      .from('intercom_channels')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
    if (error) throw error
    if ((masterChannels ?? []).length) {
      const { error: insertError } = await supabase.from('workbook_intercom_channels').insert(
        (masterChannels ?? []).map((channel, index) => ({
          module_instance_id: module.id,
          workbook_id: module.workbook_id,
          event_id: module.event_id,
          master_channel_id: channel.id,
          name: channel.name,
          is_program: channel.is_program,
          sort_order: index,
        })),
      )
      if (insertError && !isUniqueViolation(insertError)) throw insertError
      intercom = await loadIntercom(supabase, module.id)
    }
  }

  const existingKeys = new Set(intercom.assignments.map(row => row.crew_key))
  const missing = [...identities.values()].filter(identity => !existingKeys.has(identity.key))
  if (missing.length) {
    const roleIds = [...new Set(missing.map(identity => identity.roleId).filter((id): id is string => Boolean(id)))]
    const { data: defaults, error: defaultError } = roleIds.length
      ? await supabase.from('role_intercom_defaults').select('*').in('role_id', roleIds)
      : { data: [], error: null }
    if (defaultError) throw defaultError
    const defaultByRole = new Map((defaults ?? []).map(row => [row.role_id, row]))
    const { data: inserted, error: insertError } = await supabase
      .from('workbook_intercom_assignments')
      .insert(missing.map(identity => ({
        module_instance_id: module.id,
        workbook_id: module.workbook_id,
        event_id: module.event_id,
        crew_key: identity.key,
        role_id: identity.roleId,
        pack_type: identity.roleId ? defaultByRole.get(identity.roleId)?.pack_type ?? null : null,
      })))
      .select('id, crew_key, role_id')
    if (insertError && !isUniqueViolation(insertError)) throw insertError

    if ((inserted ?? []).length && roleIds.length) {
      const { data: defaultStates, error: stateError } = await supabase
        .from('role_intercom_default_channels')
        .select('*')
        .in('role_id', roleIds)
      if (stateError) throw stateError
      const channelByMaster = new Map(intercom.channels
        .filter(channel => channel.master_channel_id)
        .map(channel => [channel.master_channel_id, channel.id]))
      const rows: Array<Record<string, unknown>> = []
      for (const assignment of inserted ?? []) {
        for (const state of (defaultStates ?? []).filter(value => value.role_id === assignment.role_id)) {
          const channelId = channelByMaster.get(state.channel_id)
          if (channelId) rows.push({
            assignment_id: assignment.id,
            event_channel_id: channelId,
            button_mode: state.button_mode,
            listen_mode: state.listen_mode,
            program_enabled: state.program_enabled,
          })
        }
      }
      if (rows.length) {
        const { error } = await supabase.from('workbook_intercom_channel_assignments').insert(rows)
        if (error && !isUniqueViolation(error)) throw error
      }
    }
  }
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
  const user = await verifyAppSession(supabase, request.headers.get('x-session-token'))
  if (!user) return json(cors, 401, { error: 'Invalid or expired session' })

  try {
    const url = new URL(request.url)
    const body = request.method === 'POST'
      ? await request.json().catch(() => ({})) as Record<string, unknown>
      : {}
    const moduleId = request.method === 'GET' ? url.searchParams.get('module_id') : body.module_id
    if (!isUuid(moduleId)) return json(cors, 400, { error: 'A valid module_id is required' })

    const { data: module, error: moduleError } = await supabase
      .from('module_instances')
      .select('id, module_key, title, event_id, workbook_id, location_id, status, sort_order, created_at, updated_at')
      .eq('id', moduleId)
      .maybeSingle()
    if (moduleError) throw moduleError
    if (!module) return json(cors, 404, { error: 'Module not found' })
    if (module.status === 'archived' && !hasAccessLevel(user, 'manager')) {
      return json(cors, 403, { error: 'Manager access required to view archived modules' })
    }

    if (request.method === 'GET') {
      return json(cors, 200, await loadModuleContent(supabase, module as ModuleRow, user))
    }

    if (module.status !== 'active') {
      return json(cors, 409, { error: 'Archived modules are read-only until restored' })
    }

    const action = typeof body.action === 'string' ? body.action : ''

    if (action === 'save_input_list_values') {
      if (module.module_key !== 'input_list') return json(cors, 400, { error: 'This is not an Input List module' })
      const cells = Array.isArray(body.cells) ? body.cells : null
      if (!cells || cells.length > 10_000) return json(cors, 400, { error: 'A valid cells array is required' })
      if (cells.some(value => {
        const cell = value as Record<string, unknown>
        return !isUuid(cell.row_id) || !isUuid(cell.column_id)
          || typeof cell.value !== 'string' || cell.value.length > 2_000
      })) return json(cors, 400, { error: 'Every cell requires valid row, column, and value fields' })
      const { error } = await supabase.rpc('save_module_input_list_values_bulk', {
        target_module_instance_id: module.id,
        cells,
      })
      if (error) throw error
      return json(cors, 200, { ok: true })
    }

    if (action === 'save_input_list_links') {
      if (module.module_key !== 'input_list') return json(cors, 400, { error: 'This is not an Input List module' })
      if (!isUuid(body.location_id)) return json(cors, 400, { error: 'A valid location_id is required' })
      const cells = Array.isArray(body.cells) ? body.cells : null
      if (!cells || cells.length > 10_000) return json(cors, 400, { error: 'A valid cells array is required' })
      if (module.location_id && module.location_id !== body.location_id) {
        return json(cors, 400, { error: 'Links must use the module location' })
      }
      const { error } = await supabase.rpc('save_input_list_cell_links_bulk', {
        target_location_id: body.location_id,
        cells,
      })
      if (error) throw error
      return json(cors, 200, { ok: true })
    }

    if (module.module_key === 'crew') {
      if (action === 'add_crew') {
        const scheduledDate = typeof body.scheduled_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.scheduled_date)
          ? body.scheduled_date
          : ''
        const personName = typeof body.person_name === 'string' ? body.person_name.trim() : ''
        const isOpen = body.is_open === true
        const roleId = nullableUuid(body.role_id)
        const callTime = nullableTime(body.call_time)
        const releaseTime = nullableTime(body.release_time)
        const isPaid = body.is_paid === true
        if (!scheduledDate || (!isOpen && !personName) || roleId === undefined || callTime === undefined || releaseTime === undefined) {
          return json(cors, 400, { error: 'Valid date, person, role, and time values are required' })
        }
        if (isPaid && !hasAccessLevel(user, 'admin')) return json(cors, 403, { error: 'Admin access required to set paid status' })
        const { data: lastRows, error: orderError } = await supabase
          .from('workbook_crew')
          .select('sort_order')
          .eq('module_instance_id', module.id)
          .order('sort_order', { ascending: false })
          .limit(1)
        if (orderError) throw orderError
        const { data, error } = await supabase
          .from('workbook_crew')
          .insert({
            module_instance_id: module.id,
            workbook_id: module.workbook_id,
            event_id: module.event_id,
            scheduled_date: scheduledDate,
            user_id: null,
            person_name: isOpen ? null : personName,
            is_open: isOpen,
            role_id: roleId,
            call_time: callTime,
            release_time: releaseTime,
            is_paid: false,
            sort_order: Number(lastRows?.[0]?.sort_order ?? -1) + 1,
            sort_order_overridden: true,
            source: 'manual',
          })
          .select('*')
          .single()
        if (error) throw error
        if (isPaid) {
          const { error: financialError } = await supabase.from('workbook_crew_financials').upsert({ crew_id: data.id, is_paid: true, updated_at: new Date().toISOString() })
          if (financialError) throw financialError
        }
        return json(cors, 201, { crew_member: { ...data, is_paid: isPaid } })
      }

      if (action === 'update_crew') {
        if (!isUuid(body.crew_id)) return json(cors, 400, { error: 'A valid crew_id is required' })
        if ('is_paid' in body && (!hasAccessLevel(user, 'admin') || typeof body.is_paid !== 'boolean')) {
          return json(cors, 403, { error: 'Admin access required to change paid status' })
        }
        const { data: existing, error: existingError } = await supabase
          .from('workbook_crew')
          .select('id')
          .eq('id', body.crew_id)
          .eq('module_instance_id', module.id)
          .maybeSingle()
        if (existingError) throw existingError
        if (!existing) return json(cors, 404, { error: 'Crew member not found' })

        const updates: Record<string, unknown> = { updated_at: new Date().toISOString(), sort_order_overridden: true }
        if ('role_id' in body) {
          const roleId = nullableUuid(body.role_id)
          if (roleId === undefined) return json(cors, 400, { error: 'Invalid role_id' })
          updates.role_id = roleId
        }
        if ('call_time' in body) {
          const callTime = nullableTime(body.call_time)
          if (callTime === undefined) return json(cors, 400, { error: 'Invalid call_time' })
          updates.call_time = callTime
        }
        if ('release_time' in body) {
          const releaseTime = nullableTime(body.release_time)
          if (releaseTime === undefined) return json(cors, 400, { error: 'Invalid release_time' })
          updates.release_time = releaseTime
        }
        const { error } = await supabase.from('workbook_crew').update(updates).eq('id', existing.id)
        if (error) throw error

        if ('is_paid' in body) {
          const { error: financialError } = await supabase.from('workbook_crew_financials').upsert({
            crew_id: existing.id,
            is_paid: body.is_paid,
            updated_at: new Date().toISOString(),
          })
          if (financialError) throw financialError
        }
        return json(cors, 200, { ok: true })
      }

      if (action === 'reorder_crew') {
        const orderedIds = Array.isArray(body.ordered_ids) ? body.ordered_ids.filter(isUuid) : []
        if (!orderedIds.length) return json(cors, 400, { error: 'ordered_ids are required' })
        const { data: owned, error: ownedError } = await supabase
          .from('workbook_crew')
          .select('id')
          .eq('module_instance_id', module.id)
          .in('id', orderedIds)
        if (ownedError) throw ownedError
        if ((owned ?? []).length !== orderedIds.length) return json(cors, 400, { error: 'Crew order contains rows outside this module' })
        const results = await Promise.all(orderedIds.map((id, index) => supabase
          .from('workbook_crew')
          .update({ sort_order: index, sort_order_overridden: true, updated_at: new Date().toISOString() })
          .eq('id', id)))
        const error = results.find(result => result.error)?.error
        if (error) throw error
        return json(cors, 200, { ok: true })
      }

      if (action === 'delete_crew') {
        if (!isUuid(body.crew_id)) return json(cors, 400, { error: 'A valid crew_id is required' })
        const { error } = await supabase
          .from('workbook_crew')
          .delete()
          .eq('id', body.crew_id)
          .eq('module_instance_id', module.id)
        if (error) throw error
        return json(cors, 200, { ok: true })
      }

      return json(cors, 400, { error: 'Unknown Crew action' })
    }

    if (module.module_key === 'supplies') {
      if (action === 'save_supply') {
        const supplyId = body.supply_id == null ? null : isUuid(body.supply_id) ? body.supply_id : undefined
        const departmentId = nullableUuid(body.department_id)
        const itemName = typeof body.item_name === 'string' ? body.item_name.trim() : ''
        const description = typeof body.description === 'string' ? body.description.trim() : ''
        const quantity = Number(body.quantity)
        const purchaseUrl = typeof body.purchase_url === 'string' ? body.purchase_url.trim() : ''
        const unitPrice = Number(body.unit_price ?? 0)
        if (supplyId === undefined || departmentId === undefined || !itemName || !Number.isInteger(quantity) || quantity < 0 || !isSafeHttpUrl(purchaseUrl)) {
          return json(cors, 400, { error: 'Valid item, quantity, department, and URL values are required' })
        }
        if (!Number.isFinite(unitPrice) || unitPrice < 0) return json(cors, 400, { error: 'Price must be zero or greater' })
        if (unitPrice > 0 && !hasAccessLevel(user, 'admin')) return json(cors, 403, { error: 'Admin access required to set supply prices' })

        let savedId = supplyId
        if (supplyId) {
          const { data, error } = await supabase
            .from('workbook_supplies')
            .update({
              department_id: departmentId,
              item_name: itemName,
              description: description || null,
              quantity,
              purchase_url: purchaseUrl || null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', supplyId)
            .eq('module_instance_id', module.id)
            .select('id')
            .maybeSingle()
          if (error) throw error
          if (!data) return json(cors, 404, { error: 'Supply item not found' })
        } else {
          const { data: lastRows, error: orderError } = await supabase
            .from('workbook_supplies')
            .select('sort_order')
            .eq('module_instance_id', module.id)
            .order('sort_order', { ascending: false })
            .limit(1)
          if (orderError) throw orderError
          const { data, error } = await supabase
            .from('workbook_supplies')
            .insert({
              module_instance_id: module.id,
              workbook_id: module.workbook_id,
              department_id: departmentId,
              item_name: itemName,
              description: description || null,
              quantity,
              unit_price: 0,
              purchase_url: purchaseUrl || null,
              sort_order: Number(lastRows?.[0]?.sort_order ?? -1) + 1,
            })
            .select('id')
            .single()
          if (error) throw error
          savedId = data.id
        }
        if (hasAccessLevel(user, 'admin') && savedId) {
          const { error } = await supabase.from('workbook_supply_financials').upsert({
            supply_id: savedId,
            unit_price: unitPrice,
            updated_at: new Date().toISOString(),
          })
          if (error) throw error
        }
        return json(cors, supplyId ? 200 : 201, { supply_id: savedId })
      }

      if (action === 'delete_supply') {
        if (!isUuid(body.supply_id)) return json(cors, 400, { error: 'A valid supply_id is required' })
        const { error } = await supabase
          .from('workbook_supplies')
          .delete()
          .eq('id', body.supply_id)
          .eq('module_instance_id', module.id)
        if (error) throw error
        return json(cors, 200, { ok: true })
      }

      return json(cors, 400, { error: 'Unknown Supplies action' })
    }

    if (module.module_key === 'intercom') {
      if (action === 'prepare_intercom') {
        await prepareIntercom(supabase, module as ModuleRow)
        return json(cors, 200, await loadModuleContent(supabase, module as ModuleRow, user))
      }

      if (action === 'set_intercom_pack') {
        if (!isUuid(body.assignment_id) || ![null, '', 'wired', 'wireless'].includes(body.pack_type as string | null)) {
          return json(cors, 400, { error: 'Valid assignment_id and pack_type are required' })
        }
        const packType = body.pack_type || null
        const { data, error } = await supabase
          .from('workbook_intercom_assignments')
          .update({ pack_type: packType, updated_at: new Date().toISOString() })
          .eq('id', body.assignment_id)
          .eq('module_instance_id', module.id)
          .select('id')
          .maybeSingle()
        if (error) throw error
        if (!data) return json(cors, 404, { error: 'Intercom assignment not found' })
        if (!packType) {
          const { error: clearError } = await supabase
            .from('workbook_intercom_channel_assignments')
            .delete()
            .eq('assignment_id', data.id)
          if (clearError) throw clearError
        }
        return json(cors, 200, { ok: true })
      }

      if (action === 'set_intercom_channel_state') {
        if (!isUuid(body.assignment_id) || !isUuid(body.channel_id)) {
          return json(cors, 400, { error: 'Valid assignment and channel IDs are required' })
        }
        const talkMode = body.talk_mode == null ? null : body.talk_mode
        const listenMode = body.listen_mode == null ? null : body.listen_mode
        const programEnabled = body.program_enabled === true
        if (![null, 'momentary', 'latch', 'latch_momentary'].includes(talkMode as string | null)
          || ![null, 'listen', 'listen_on_talk'].includes(listenMode as string | null)) {
          return json(cors, 400, { error: 'Invalid talk or listen mode' })
        }
        const [{ data: assignment, error: assignmentError }, { data: channel, error: channelError }] = await Promise.all([
          supabase.from('workbook_intercom_assignments').select('id').eq('id', body.assignment_id).eq('module_instance_id', module.id).maybeSingle(),
          supabase.from('workbook_intercom_channels').select('id').eq('id', body.channel_id).eq('module_instance_id', module.id).maybeSingle(),
        ])
        if (assignmentError || channelError) throw assignmentError || channelError
        if (!assignment || !channel) return json(cors, 404, { error: 'Intercom assignment or channel not found' })
        if (!talkMode && !listenMode && !programEnabled) {
          const { error } = await supabase
            .from('workbook_intercom_channel_assignments')
            .delete()
            .eq('assignment_id', assignment.id)
            .eq('event_channel_id', channel.id)
          if (error) throw error
        } else {
          const { error } = await supabase.from('workbook_intercom_channel_assignments').upsert({
            assignment_id: assignment.id,
            event_channel_id: channel.id,
            button_mode: talkMode,
            listen_mode: listenMode,
            program_enabled: programEnabled,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'assignment_id,event_channel_id' })
          if (error) throw error
        }
        return json(cors, 200, { ok: true })
      }

      if (action === 'add_intercom_channel') {
        const masterId = nullableUuid(body.master_channel_id)
        if (masterId === undefined) return json(cors, 400, { error: 'Invalid master_channel_id' })
        let name = typeof body.name === 'string' ? body.name.trim() : ''
        let isProgram = name.toLowerCase() === 'program'
        if (masterId) {
          const { data: master, error } = await supabase
            .from('intercom_channels')
            .select('name, is_program')
            .eq('id', masterId)
            .eq('is_active', true)
            .maybeSingle()
          if (error) throw error
          if (!master) return json(cors, 404, { error: 'Master channel not found' })
          name = master.name
          isProgram = master.is_program
        }
        if (!name || name.length > 100) return json(cors, 400, { error: 'Channel name is required' })
        const { data: lastRows, error: orderError } = await supabase
          .from('workbook_intercom_channels')
          .select('sort_order')
          .eq('module_instance_id', module.id)
          .order('sort_order', { ascending: false })
          .limit(1)
        if (orderError) throw orderError
        const { error } = await supabase.from('workbook_intercom_channels').insert({
          module_instance_id: module.id,
          workbook_id: module.workbook_id,
          event_id: module.event_id,
          master_channel_id: masterId,
          name,
          is_program: isProgram,
          sort_order: Number(lastRows?.[0]?.sort_order ?? -1) + 1,
        })
        if (error) throw error
        return json(cors, 201, { ok: true })
      }

      if (action === 'delete_intercom_channel') {
        if (!isUuid(body.channel_id)) return json(cors, 400, { error: 'A valid channel_id is required' })
        const { error } = await supabase
          .from('workbook_intercom_channels')
          .delete()
          .eq('id', body.channel_id)
          .eq('module_instance_id', module.id)
        if (error) throw error
        return json(cors, 200, { ok: true })
      }

      return json(cors, 400, { error: 'Unknown Intercom action' })
    }

    if (module.module_key !== 'production_documents') {
      return json(cors, 400, { error: 'Unknown action for this module type' })
    }

    if (action === 'add_document_link') {
      const title = typeof body.title === 'string' ? body.title.trim() : ''
      const docType = typeof body.doc_type === 'string' ? body.doc_type : ''
      const driveUrl = typeof body.gdrive_url === 'string' ? body.gdrive_url.trim() : ''
      const driveFileId = typeof body.gdrive_file_id === 'string' ? body.gdrive_file_id.trim() : null
      if (!title || !isSafeDocumentUrl(driveUrl) || !DOCUMENT_TYPES.has(docType)) {
        return json(cors, 400, { error: 'Title, document type, and URL are required' })
      }
      const { data, error } = await supabase
        .from('production_docs')
        .insert({
          module_instance_id: module.id,
          doc_type: docType,
          title,
          gdrive_file_id: driveFileId || null,
          gdrive_url: driveUrl,
          source: 'manual',
        })
        .select('*')
        .single()
      if (error) throw error
      return json(cors, 201, { document: data })
    }

    if (action === 'prepare_document_upload') {
      const filename = typeof body.filename === 'string' ? safeFilename(body.filename) : ''
      if (!filename.toLowerCase().endsWith('.pdf')) return json(cors, 400, { error: 'Production Document uploads must be PDF files' })
      const path = `${module.id}/${crypto.randomUUID()}-${filename}`
      const { data, error } = await supabase.storage
        .from('production-docs')
        .createSignedUploadUrl(path)
      if (error) throw error
      return json(cors, 200, { path, token: data.token })
    }

    if (action === 'finalize_document_upload') {
      const title = typeof body.title === 'string' ? body.title.trim() : ''
      const docType = typeof body.doc_type === 'string' ? body.doc_type : ''
      const path = typeof body.storage_path === 'string' ? body.storage_path : ''
      if (!title || !DOCUMENT_TYPES.has(docType) || !path.startsWith(`${module.id}/`)) {
        return json(cors, 400, { error: 'Title, document type, and a prepared upload path are required' })
      }
      const filename = path.slice(`${module.id}/`.length)
      const { data: uploadedFiles, error: listError } = await supabase.storage
        .from('production-docs')
        .list(module.id, { limit: 2, search: filename })
      if (listError) throw listError
      if (!(uploadedFiles ?? []).some(file => file.name === filename)) {
        return json(cors, 409, { error: 'The prepared PDF upload has not completed' })
      }
      const { data, error } = await supabase
        .from('production_docs')
        .insert({
          module_instance_id: module.id,
          doc_type: docType,
          title,
          storage_path: path,
          source: 'manual',
        })
        .select('*')
        .single()
      if (error) {
        await supabase.storage.from('production-docs').remove([path])
        throw error
      }
      return json(cors, 201, { document: data })
    }

    if (action === 'delete_document') {
      if (!hasAccessLevel(user, 'manager')) return json(cors, 403, { error: 'Manager access required' })
      if (!isUuid(body.document_id)) return json(cors, 400, { error: 'A valid document_id is required' })
      const { data: document, error: documentError } = await supabase
        .from('production_docs')
        .select('id, storage_path')
        .eq('id', body.document_id)
        .eq('module_instance_id', module.id)
        .maybeSingle()
      if (documentError) throw documentError
      if (!document) return json(cors, 404, { error: 'Document not found' })
      if (document.storage_path) {
        const { error: storageError } = await supabase.storage
          .from('production-docs')
          .remove([document.storage_path])
        if (storageError) throw storageError
      }
      const { error } = await supabase.from('production_docs').delete().eq('id', document.id)
      if (error) throw error
      return json(cors, 200, { ok: true })
    }

    return json(cors, 400, { error: 'Unknown module content action' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return json(cors, 500, { error: message })
  }
})
