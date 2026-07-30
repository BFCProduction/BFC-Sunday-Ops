// deno-lint-ignore-file no-import-prefix no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2'
import { getValidPcoToken, pcoReauthBody, type PcoSessionTokens } from '../_shared/pco-token.ts'

// Mirrors the assigned people from every PCO-linked event in a workbook into
// workbook_crew. PCO owns assignment membership; Sunday Ops preserves local
// call/release, pay, and role-override fields on rows that already exist.

const ALLOWED_ORIGINS = [
  'https://bfcproduction.github.io',
  'http://localhost:5173',
]

const PCO_API_BASE = 'https://api.planningcenteronline.com/services/v2'

function corsHeaders(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowed,
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

function normalized(value: string | null | undefined) {
  return (value ?? '').trim().toLocaleLowerCase()
}

interface WorkbookEvent {
  id: string
  name: string
  workbook_id: string
  event_date: string
  pco_plan_id: string | null
  service_types: {
    pco_service_type_id: string | null
  } | Array<{
    pco_service_type_id: string | null
  }> | null
}

interface PcoPlanPerson {
  id: string
  attributes: {
    name: string | null
    photo_thumbnail: string | null
    status: string | null
    team_position_name: string | null
  }
  relationships?: {
    person?: {
      data?: {
        id?: string
      } | null
    }
  }
}

interface ExistingCrewRow {
  id: string
  event_id: string | null
  user_id: string | null
  person_name: string | null
  role_id: string | null
  source: string
  pco_plan_person_id: string | null
  pco_person_id: string | null
  pco_role_name: string | null
}

async function fetchPlanPeople(
  pcoToken: string,
  planId: string,
  candidateServiceTypeIds: string[],
) {
  let lastError: Error | null = null

  for (const serviceTypeId of candidateServiceTypeIds) {
    const collected: PcoPlanPerson[] = []
    let nextUrl: string | null = `${PCO_API_BASE}/service_types/${serviceTypeId}`
      + `/plans/${planId}/team_members`
      + '?per_page=100&filter=not_archived,not_declined,not_deleted'

    try {
      let pageGuard = 0
      while (nextUrl && pageGuard < 20) {
        const response = await fetch(nextUrl, {
          headers: { Authorization: `Bearer ${pcoToken}` },
        })

        if (!response.ok) {
          const detail = await response.text().catch(() => '')
          if (response.status === 404) {
            lastError = new Error(`PCO plan ${planId} was not found under service type ${serviceTypeId}`)
            collected.length = 0
            break
          }
          throw new Error(`PCO API ${response.status}: ${detail.slice(0, 240)}`)
        }

        lastError = null
        const body = await response.json() as {
          data?: PcoPlanPerson[]
          links?: { next?: string | null }
        }
        collected.push(...(body.data ?? []))
        nextUrl = body.links?.next ?? null
        pageGuard++
      }

      if (collected.length > 0 || !lastError) {
        return collected.filter(member => {
          const status = normalized(member.attributes.status)
          return status !== 'd' && status !== 'declined'
        })
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unable to fetch PCO plan crew')
      break
    }
  }

  if (lastError) throw lastError
  return []
}

Deno.serve(async request => {
  const cors = corsHeaders(request.headers.get('origin'))

  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return json(cors, 405, { error: 'Method not allowed' })

  const sessionToken = request.headers.get('x-session-token')
  if (!sessionToken) return json(cors, 401, { error: 'x-session-token header required' })

  let workbookId = ''
  try {
    const body = await request.json()
    workbookId = typeof body?.workbook_id === 'string' ? body.workbook_id : ''
  } catch {
    return json(cors, 400, { error: 'Invalid JSON body' })
  }
  if (!workbookId) return json(cors, 400, { error: 'workbook_id is required' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return json(cors, 500, { error: 'Missing Supabase function secrets' })
  }

  const supabase = createClient(supabaseUrl, serviceKey)
  const now = new Date().toISOString()

  const { data: session } = await supabase
    .from('user_sessions')
    .select('user_id, pco_access_token, pco_refresh_token, pco_token_expires_at')
    .eq('token', sessionToken)
    .gt('expires_at', now)
    .maybeSingle()

  if (!session) return json(cors, 401, { error: 'Invalid or expired session token' })

  const { data: admin } = await supabase
    .from('users')
    .select('id')
    .eq('id', session.user_id)
    .eq('is_admin', true)
    .maybeSingle()

  if (!admin) return json(cors, 401, { error: 'Admin access required' })

  let pcoToken: string
  try {
    pcoToken = await getValidPcoToken(supabase, sessionToken, session as PcoSessionTokens)
  } catch (error) {
    return json(cors, 401, pcoReauthBody(error))
  }

  const { data: events, error: eventsError } = await supabase
    .from('events')
    .select(`
      id, name, workbook_id, event_date, pco_plan_id,
      service_types ( pco_service_type_id )
    `)
    .eq('workbook_id', workbookId)
    .order('event_date', { ascending: true })

  if (eventsError) return json(cors, 500, { error: eventsError.message })

  const typedEvents = (events ?? []) as unknown as WorkbookEvent[]
  const eventIds = typedEvents.map(event => event.id)

  if (eventIds.length === 0) {
    return json(cors, 200, {
      assignments: 0,
      added: 0,
      updated: 0,
      removed: 0,
      events_synced: 0,
      unmatched_roles: [],
      errors: [],
    })
  }

  const [
    { data: allServiceTypes },
    { data: users },
    { data: roles },
    { data: existingCrew, error: crewError },
  ] = await Promise.all([
    supabase.from('service_types').select('pco_service_type_id').not('pco_service_type_id', 'is', null),
    supabase.from('users').select('id, pco_id'),
    supabase.from('roles').select('id, name'),
    supabase.from('workbook_crew').select(
      'id, event_id, user_id, person_name, role_id, source, pco_plan_person_id, pco_person_id, pco_role_name',
    ).eq('workbook_id', workbookId),
  ])

  if (crewError) return json(cors, 500, { error: crewError.message })

  const allPcoServiceTypeIds = (allServiceTypes ?? [])
    .map(row => row.pco_service_type_id as string | null)
    .filter((id): id is string => Boolean(id))
  const userByPcoId = new Map((users ?? []).map(user => [String(user.pco_id), String(user.id)]))
  const roleByName = new Map((roles ?? []).map(role => [normalized(role.name), String(role.id)]))
  const crewRows = (existingCrew ?? []) as ExistingCrewRow[]

  let added = 0
  let updated = 0
  let removed = 0
  let assignments = 0
  let eventsSynced = 0
  const unmatchedRoles = new Set<string>()
  const errors: Array<{ event_id: string; event_name: string; error: string }> = []

  for (const event of typedEvents) {
    const serviceType = Array.isArray(event.service_types)
      ? event.service_types[0]
      : event.service_types
    if (!event.pco_plan_id || !serviceType?.pco_service_type_id) continue

    const candidateServiceTypeIds = [
      serviceType.pco_service_type_id,
      ...allPcoServiceTypeIds.filter(id => id !== serviceType.pco_service_type_id),
    ]

    let planPeople: PcoPlanPerson[]
    try {
      planPeople = await fetchPlanPeople(pcoToken, event.pco_plan_id, candidateServiceTypeIds)
    } catch (error) {
      errors.push({
        event_id: event.id,
        event_name: event.name,
        error: error instanceof Error ? error.message : 'Unable to fetch PCO crew',
      })
      continue
    }

    eventsSynced++
    assignments += planPeople.length
    const activePlanPersonIds = new Set(planPeople.map(member => member.id))
    const eventCrew = crewRows.filter(row => row.event_id === event.id)
    const claimedRowIds = new Set<string>()

    for (const [sortOrder, member] of planPeople.entries()) {
      const personName = member.attributes.name?.trim() || 'Unnamed PCO person'
      const pcoPersonId = member.relationships?.person?.data?.id ?? null
      const pcoRoleName = member.attributes.team_position_name?.trim() || null
      const mappedUserId = pcoPersonId ? userByPcoId.get(pcoPersonId) ?? null : null
      const mappedRoleId = pcoRoleName ? roleByName.get(normalized(pcoRoleName)) ?? null : null
      if (pcoRoleName && !mappedRoleId) unmatchedRoles.add(pcoRoleName)

      let existing = eventCrew.find(row => row.pco_plan_person_id === member.id)

      if (!existing) {
        existing = eventCrew.find(row => {
          if (claimedRowIds.has(row.id) || row.pco_plan_person_id) return false
          const personMatches = mappedUserId
            ? row.user_id === mappedUserId
            : normalized(row.person_name) === normalized(personName)
          if (!personMatches) return false
          return !row.role_id || !mappedRoleId || row.role_id === mappedRoleId
        })
      }

      const importedFields = {
        workbook_id: workbookId,
        event_id: event.id,
        scheduled_date: event.event_date,
        user_id: mappedUserId ?? existing?.user_id ?? null,
        person_name: mappedUserId || existing?.user_id ? null : personName,
        is_open: false,
        source: 'pco',
        pco_plan_person_id: member.id,
        pco_person_id: pcoPersonId,
        pco_role_name: pcoRoleName,
        pco_status: member.attributes.status,
        pco_photo_url: member.attributes.photo_thumbnail,
        pco_synced_at: now,
        sort_order: sortOrder,
        updated_at: now,
      }

      if (existing) {
        claimedRowIds.add(existing.id)
        const { error } = await supabase
          .from('workbook_crew')
          .update({
            ...importedFields,
            ...(!existing.role_id && mappedRoleId ? { role_id: mappedRoleId } : {}),
          })
          .eq('id', existing.id)
        if (error) {
          errors.push({ event_id: event.id, event_name: event.name, error: error.message })
        } else {
          updated++
        }
      } else {
        const { error } = await supabase
          .from('workbook_crew')
          .insert({
            ...importedFields,
            role_id: mappedRoleId,
            call_time: null,
            release_time: null,
            is_paid: false,
          })
        if (error) {
          errors.push({ event_id: event.id, event_name: event.name, error: error.message })
        } else {
          added++
        }
      }
    }

    const staleIds = eventCrew
      .filter(row => row.source === 'pco')
      .filter(row => row.pco_plan_person_id && !activePlanPersonIds.has(row.pco_plan_person_id))
      .map(row => row.id)

    if (staleIds.length > 0) {
      const { error } = await supabase.from('workbook_crew').delete().in('id', staleIds)
      if (error) {
        errors.push({ event_id: event.id, event_name: event.name, error: error.message })
      } else {
        removed += staleIds.length
      }
    }
  }

  supabase
    .from('user_sessions')
    .update({ last_used_at: now })
    .eq('token', sessionToken)
    .then(() => {})

  return json(cors, 200, {
    assignments,
    added,
    updated,
    removed,
    events_synced: eventsSynced,
    unmatched_roles: [...unmatchedRoles].sort(),
    errors,
  })
})
