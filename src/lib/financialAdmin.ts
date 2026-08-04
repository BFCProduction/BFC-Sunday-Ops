import type { CrewRole, WorkbookSupplyItem } from '../types'

function functionUrl() {
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/financial-admin`
}

async function request<T>(
  sessionToken: string,
  options: { query?: URLSearchParams; body?: Record<string, unknown> },
): Promise<T> {
  const query = options.query?.toString()
  const response = await fetch(`${functionUrl()}${query ? `?${query}` : ''}`, {
    method: options.body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'x-session-token': sessionToken,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(typeof payload?.error === 'string' ? payload.error : `Financial request failed (${response.status})`)
  }
  return payload as T
}

export function fetchAdminRoles(sessionToken: string) {
  return request<{ roles: CrewRole[] }>(sessionToken, {
    query: new URLSearchParams({ resource: 'roles' }),
  }).then(result => result.roles)
}

export function saveAdminRole(
  sessionToken: string,
  input: {
    id?: string
    name: string
    hourlyRate: number
    departmentId: string | null
    sortOrder: number
  },
) {
  return request<{ role_id: string }>(sessionToken, {
    body: {
      action: 'save_role',
      role_id: input.id,
      name: input.name,
      hourly_rate: input.hourlyRate,
      department_id: input.departmentId,
      sort_order: input.sortOrder,
    },
  })
}

export function deleteAdminRole(sessionToken: string, roleId: string) {
  return request<{ ok: true }>(sessionToken, {
    body: { action: 'delete_role', role_id: roleId },
  })
}

export function reorderAdminRoles(sessionToken: string, orderedIds: string[]) {
  return request<{ ok: true }>(sessionToken, {
    body: { action: 'reorder_roles', ordered_ids: orderedIds },
  })
}

export interface WorkbookFinancialData {
  crew_financials: Array<{ crew_id: string; is_paid: boolean }>
  supplies: WorkbookSupplyItem[]
}

export function fetchWorkbookFinancialData(sessionToken: string, workbookId: string) {
  return request<WorkbookFinancialData>(sessionToken, {
    query: new URLSearchParams({ resource: 'workbook', workbook_id: workbookId }),
  })
}

export function setAdminCrewPaid(sessionToken: string, crewId: string, isPaid: boolean) {
  return request<{ ok: true }>(sessionToken, {
    body: { action: 'set_crew_paid', crew_id: crewId, is_paid: isPaid },
  })
}

export function saveAdminSupply(
  sessionToken: string,
  input: {
    id?: string
    workbookId: string
    departmentId: string | null
    itemName: string
    description: string | null
    quantity: number
    unitPrice: number
    purchaseUrl: string | null
  },
) {
  return request<{ supply_id: string }>(sessionToken, {
    body: {
      action: 'save_supply',
      supply_id: input.id,
      workbook_id: input.workbookId,
      department_id: input.departmentId,
      item_name: input.itemName,
      description: input.description,
      quantity: input.quantity,
      unit_price: input.unitPrice,
      purchase_url: input.purchaseUrl,
    },
  })
}

export function deleteAdminSupply(sessionToken: string, supplyId: string) {
  return request<{ ok: true }>(sessionToken, {
    body: { action: 'delete_supply', supply_id: supplyId },
  })
}
