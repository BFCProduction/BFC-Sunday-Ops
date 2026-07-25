// ─────────────────────────────────────────────────────────────────────────────
// productionConfig.ts — account-level reference data (Production Config)
//
// Locations, Departments, Roles, and schedule item Types are managed once in
// Settings and referenced by workbooks and their sub-tools. See the
// "Workbook v2 — Direction & Phased Plan" note for the People/Places/Things/
// Config model this belongs to.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabase'
import type { Location, Department, CrewRole, ScheduleItemType } from '../types'

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

// ── Roles ─────────────────────────────────────────────────────────────────────
export interface RoleInput {
  name: string
  hourlyRate: number
  isPaidDefault: boolean
}

export async function loadRoles(): Promise<CrewRole[]> {
  const { data, error } = await supabase
    .from('roles')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []) as CrewRole[]
}

export async function createRole(input: RoleInput, sortOrder: number): Promise<CrewRole> {
  const { data, error } = await supabase
    .from('roles')
    .insert({
      name: input.name.trim(),
      hourly_rate: input.hourlyRate,
      is_paid_default: input.isPaidDefault,
      sort_order: sortOrder,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as CrewRole
}

export async function updateRole(id: string, input: RoleInput): Promise<void> {
  const { error } = await supabase
    .from('roles')
    .update({
      name: input.name.trim(),
      hourly_rate: input.hourlyRate,
      is_paid_default: input.isPaidDefault,
    })
    .eq('id', id)
  if (error) throw error
}

export async function deleteRole(id: string): Promise<void> {
  const { error } = await supabase.from('roles').delete().eq('id', id)
  if (error) throw error
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
