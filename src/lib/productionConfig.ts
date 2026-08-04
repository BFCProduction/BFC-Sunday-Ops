// ─────────────────────────────────────────────────────────────────────────────
// productionConfig.ts — account-level reference data (Production Config)
//
// Locations, Departments, Roles, and schedule item Types are managed once in
// Settings and referenced by workbooks and their sub-tools. See the
// "Workbook v2 — Direction & Phased Plan" note for the People/Places/Things/
// Config model this belongs to.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabase'
import { deleteAdminRole, fetchAdminRoles, reorderAdminRoles, saveAdminRole } from './financialAdmin'
import type { Location, Department, CrewRole, ScheduleItemType } from '../types'

type ProductionConfigTable = 'locations' | 'departments' | 'roles' | 'schedule_item_types'

async function reorderRows(table: ProductionConfigTable, orderedIds: string[]): Promise<void> {
  const results = await Promise.all(orderedIds.map((id, sortOrder) =>
    supabase.from(table).update({ sort_order: sortOrder }).eq('id', id),
  ))
  const failed = results.find(result => result.error)
  if (failed?.error) throw failed.error
}

// ── Locations ─────────────────────────────────────────────────────────────────
export async function loadLocations(): Promise<Location[]> {
  const { data, error } = await supabase
    .from('locations')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []) as Location[]
}

export async function createLocation(name: string, sortOrder: number): Promise<Location> {
  const { data, error } = await supabase
    .from('locations')
    .insert({ name: name.trim(), sort_order: sortOrder })
    .select('*')
    .single()
  if (error) throw error
  return data as Location
}

export async function renameLocation(id: string, name: string): Promise<void> {
  const { error } = await supabase.from('locations').update({ name: name.trim() }).eq('id', id)
  if (error) throw error
}

export async function deleteLocation(id: string): Promise<void> {
  const { error } = await supabase.from('locations').delete().eq('id', id)
  if (error) throw error
}

export async function reorderLocations(orderedIds: string[]): Promise<void> {
  await reorderRows('locations', orderedIds)
}

// ── Departments ───────────────────────────────────────────────────────────────
export async function loadDepartments(): Promise<Department[]> {
  const { data, error } = await supabase
    .from('departments')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []) as Department[]
}

export async function createDepartment(name: string, sortOrder: number): Promise<Department> {
  const { data, error } = await supabase
    .from('departments')
    .insert({ name: name.trim(), sort_order: sortOrder })
    .select('*')
    .single()
  if (error) throw error
  return data as Department
}

export async function renameDepartment(id: string, name: string): Promise<void> {
  const { error } = await supabase.from('departments').update({ name: name.trim() }).eq('id', id)
  if (error) throw error
}

export async function deleteDepartment(id: string): Promise<void> {
  const { error } = await supabase.from('departments').delete().eq('id', id)
  if (error) throw error
}

export async function reorderDepartments(orderedIds: string[]): Promise<void> {
  await reorderRows('departments', orderedIds)
}

// ── Roles ─────────────────────────────────────────────────────────────────────
export interface RoleInput {
  name: string
  hourlyRate: number
  departmentId: string | null
}

export async function loadRoles(sessionToken?: string | null): Promise<CrewRole[]> {
  if (sessionToken) return fetchAdminRoles(sessionToken)

  const { data, error } = await supabase
    .from('roles')
    .select('id, name, department_id, sort_order, created_at')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []).map(role => ({ ...role, hourly_rate: 0 })) as CrewRole[]
}

export async function createRole(sessionToken: string, input: RoleInput, sortOrder: number): Promise<void> {
  await saveAdminRole(sessionToken, {
    name: input.name.trim(),
    hourlyRate: input.hourlyRate,
    departmentId: input.departmentId,
    sortOrder,
  })
}

export async function updateRole(sessionToken: string, role: CrewRole, input: RoleInput): Promise<void> {
  await saveAdminRole(sessionToken, {
    id: role.id,
    name: input.name.trim(),
    hourlyRate: input.hourlyRate,
    departmentId: input.departmentId,
    sortOrder: role.sort_order,
  })
}

export async function deleteRole(sessionToken: string, id: string): Promise<void> {
  await deleteAdminRole(sessionToken, id)
}

export async function reorderRoles(sessionToken: string, orderedIds: string[]): Promise<void> {
  await reorderAdminRoles(sessionToken, orderedIds)
}

// ── Schedule item types ───────────────────────────────────────────────────────
export async function loadScheduleItemTypes(): Promise<ScheduleItemType[]> {
  const { data, error } = await supabase
    .from('schedule_item_types')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('label', { ascending: true })
  if (error) throw error
  return (data ?? []) as ScheduleItemType[]
}

/** Slugify a label into a stable key (lowercase, underscores). */
export function typeKeyFromLabel(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

export async function createScheduleItemType(label: string, sortOrder: number): Promise<ScheduleItemType> {
  const key = typeKeyFromLabel(label)
  const { data, error } = await supabase
    .from('schedule_item_types')
    .insert({ key, label: label.trim(), icon: 'point', color: 'gray', sort_order: sortOrder })
    .select('*')
    .single()
  if (error) throw error
  return data as ScheduleItemType
}

export async function renameScheduleItemType(id: string, label: string): Promise<void> {
  const { error } = await supabase.from('schedule_item_types').update({ label: label.trim() }).eq('id', id)
  if (error) throw error
}

export async function deleteScheduleItemType(id: string): Promise<void> {
  const { error } = await supabase.from('schedule_item_types').delete().eq('id', id)
  if (error) throw error
}

export async function reorderScheduleItemTypes(orderedIds: string[]): Promise<void> {
  await reorderRows('schedule_item_types', orderedIds)
}
