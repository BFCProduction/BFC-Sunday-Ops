// deno-lint-ignore-file no-import-prefix
import { createClient } from 'npm:@supabase/supabase-js@2'
import { verifyMinimumAccess } from '../_shared/app-auth.ts'

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

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
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
  const admin = await verifyMinimumAccess(supabase, request.headers.get('x-session-token'), 'admin')
  if (!admin) return json(cors, 403, { error: 'Admin access required' })

  try {
    if (request.method === 'GET') {
      const url = new URL(request.url)
      const resource = url.searchParams.get('resource')

      if (resource === 'roles') {
        const [{ data: roles, error: rolesError }, { data: financials, error: financialsError }] = await Promise.all([
          supabase.from('roles').select('id, name, department_id, sort_order, created_at').order('sort_order').order('name'),
          supabase.from('role_financials').select('role_id, hourly_rate'),
        ])
        if (rolesError || financialsError) throw rolesError || financialsError
        const rateByRole = new Map((financials ?? []).map(row => [row.role_id, Number(row.hourly_rate) || 0]))
        return json(cors, 200, {
          roles: (roles ?? []).map(role => ({ ...role, hourly_rate: rateByRole.get(role.id) ?? 0 })),
        })
      }

      if (resource === 'workbook') {
        const workbookId = url.searchParams.get('workbook_id')
        if (!isUuid(workbookId)) return json(cors, 400, { error: 'A valid workbook_id is required' })

        const [{ data: crew, error: crewError }, { data: supplies, error: suppliesError }] = await Promise.all([
          supabase.from('workbook_crew').select('id').eq('workbook_id', workbookId),
          supabase.from('workbook_supplies').select('id, workbook_id, department_id, item_name, description, quantity, purchase_url, sort_order, created_at, updated_at').eq('workbook_id', workbookId).order('sort_order').order('created_at'),
        ])
        if (crewError || suppliesError) throw crewError || suppliesError

        const crewIds = (crew ?? []).map(row => row.id)
        const supplyIds = (supplies ?? []).map(row => row.id)
        const [{ data: crewFinancials, error: crewFinancialError }, { data: supplyFinancials, error: supplyFinancialError }] = await Promise.all([
          crewIds.length
            ? supabase.from('workbook_crew_financials').select('crew_id, is_paid').in('crew_id', crewIds)
            : Promise.resolve({ data: [], error: null }),
          supplyIds.length
            ? supabase.from('workbook_supply_financials').select('supply_id, unit_price').in('supply_id', supplyIds)
            : Promise.resolve({ data: [], error: null }),
        ])
        if (crewFinancialError || supplyFinancialError) throw crewFinancialError || supplyFinancialError

        const priceBySupply = new Map((supplyFinancials ?? []).map(row => [row.supply_id, Number(row.unit_price) || 0]))
        return json(cors, 200, {
          crew_financials: crewFinancials ?? [],
          supplies: (supplies ?? []).map(item => ({ ...item, unit_price: priceBySupply.get(item.id) ?? 0 })),
        })
      }

      return json(cors, 400, { error: 'Unknown financial resource' })
    }

    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const action = typeof body.action === 'string' ? body.action : ''

    if (action === 'save_role') {
      const roleId = body.role_id == null ? null : body.role_id
      if (roleId !== null && !isUuid(roleId)) return json(cors, 400, { error: 'Invalid role_id' })
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      const hourlyRate = Number(body.hourly_rate ?? 0)
      const departmentId = body.department_id == null ? null : body.department_id
      const sortOrder = Number(body.sort_order ?? 0)
      if (!name || !Number.isFinite(hourlyRate) || hourlyRate < 0) {
        return json(cors, 400, { error: 'A name and non-negative hourly rate are required' })
      }
      if (departmentId !== null && !isUuid(departmentId)) return json(cors, 400, { error: 'Invalid department_id' })

      const { data: savedRoleId, error } = await supabase.rpc('admin_save_role', {
        target_role_id: roleId,
        role_name: name,
        role_hourly_rate: hourlyRate,
        role_department_id: departmentId,
        role_sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
      })
      if (error) throw error
      return json(cors, 200, { role_id: savedRoleId })
    }

    if (action === 'delete_role') {
      if (!isUuid(body.role_id)) return json(cors, 400, { error: 'A valid role_id is required' })
      const { error } = await supabase.from('roles').delete().eq('id', body.role_id)
      if (error) throw error
      return json(cors, 200, { ok: true })
    }

    if (action === 'reorder_roles') {
      const orderedIds = Array.isArray(body.ordered_ids) ? body.ordered_ids.filter(isUuid) : []
      if (orderedIds.length === 0) return json(cors, 400, { error: 'ordered_ids are required' })
      const { error } = await supabase.rpc('admin_reorder_roles', { ordered_ids: orderedIds })
      if (error) throw error
      return json(cors, 200, { ok: true })
    }

    if (action === 'set_crew_paid') {
      if (!isUuid(body.crew_id) || typeof body.is_paid !== 'boolean') {
        return json(cors, 400, { error: 'crew_id and is_paid are required' })
      }
      const { error } = await supabase.rpc('admin_set_crew_paid', {
        target_crew_id: body.crew_id,
        paid: body.is_paid,
      })
      if (error) throw error
      return json(cors, 200, { ok: true })
    }

    if (action === 'save_supply') {
      const supplyId = body.supply_id == null ? null : body.supply_id
      if (supplyId !== null && !isUuid(supplyId)) return json(cors, 400, { error: 'Invalid supply_id' })
      if (!isUuid(body.workbook_id)) return json(cors, 400, { error: 'A valid workbook_id is required' })
      const departmentId = body.department_id == null ? null : body.department_id
      if (departmentId !== null && !isUuid(departmentId)) return json(cors, 400, { error: 'Invalid department_id' })
      const itemName = typeof body.item_name === 'string' ? body.item_name.trim() : ''
      const quantity = Number(body.quantity ?? 0)
      const unitPrice = Number(body.unit_price ?? 0)
      if (!itemName || !Number.isFinite(quantity) || quantity < 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
        return json(cors, 400, { error: 'Valid item, quantity, and price values are required' })
      }

      const { data: savedSupplyId, error } = await supabase.rpc('admin_save_workbook_supply', {
        target_supply_id: supplyId,
        target_workbook_id: body.workbook_id,
        target_department_id: departmentId,
        target_item_name: itemName,
        target_description: typeof body.description === 'string' ? body.description : null,
        target_quantity: quantity,
        target_unit_price: unitPrice,
        target_purchase_url: typeof body.purchase_url === 'string' ? body.purchase_url : null,
      })
      if (error) throw error
      return json(cors, 200, { supply_id: savedSupplyId })
    }

    if (action === 'delete_supply') {
      if (!isUuid(body.supply_id)) return json(cors, 400, { error: 'A valid supply_id is required' })
      const { error } = await supabase.from('workbook_supplies').delete().eq('id', body.supply_id)
      if (error) throw error
      return json(cors, 200, { ok: true })
    }

    return json(cors, 400, { error: 'Unknown financial action' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return json(cors, 500, { error: message })
  }
})
