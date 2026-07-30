import { supabase } from './supabase'
import type {
  Location,
  Session,
  Workbook,
  WorkbookCrewMember,
  WorkbookScheduleAssignment,
  WorkbookScheduleItem,
  WorkbookScheduleItemType,
  WorkbookSupplyItem,
} from '../types'

export interface CreateWorkbookInput {
  name: string
  startDate: string
  endDate: string
  venue: string | null
  description: string | null
}

export interface ScheduleAssignmentInput {
  userId: string | null
  personName: string | null
  role: string | null
  department: string | null
  isOpen: boolean
}

export interface ScheduleItemInput {
  workbookId: string
  eventId: string | null
  locationId: string | null
  title: string
  itemType: WorkbookScheduleItemType
  scheduledDate: string
  startTime: string
  endTime: string | null
  notes: string | null
  departments: string[]
  tags: string[]
  assignments: ScheduleAssignmentInput[]
}

export interface WorkbookPublicationSnapshot {
  workbook: Workbook
  locations: Location[]
  events: Session[]
  scheduleItems: WorkbookScheduleItem[]
}

export async function loadWorkbooks(): Promise<Workbook[]> {
  const { data, error } = await supabase
    .from('workbooks')
    .select('*')
    .order('end_date', { ascending: false })
    .order('start_date', { ascending: false })
  if (error) throw error
  return (data ?? []) as Workbook[]
}

export async function createWorkbook(input: CreateWorkbookInput): Promise<Workbook> {
  const { data, error } = await supabase
    .from('workbooks')
    .insert({
      name: input.name,
      start_date: input.startDate,
      end_date: input.endDate,
      venue: input.venue,
      description: input.description,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as Workbook
}

export async function loadWorkbookScheduleItems(workbookId: string): Promise<WorkbookScheduleItem[]> {
  const { data, error } = await supabase
    .from('workbook_schedule_items')
    .select('*, assignments:workbook_schedule_assignments(*)')
    .eq('workbook_id', workbookId)
    .order('scheduled_date', { ascending: true })
    .order('start_time', { ascending: true })
    .order('sort_order', { ascending: true })
  if (error) throw error
  return ((data ?? []) as Array<WorkbookScheduleItem & { assignments?: WorkbookScheduleAssignment[] }>)
    .map(item => ({ ...item, assignments: item.assignments ?? [] }))
}

async function replaceAssignments(itemId: string, assignments: ScheduleAssignmentInput[]) {
  const { error: deleteError } = await supabase
    .from('workbook_schedule_assignments')
    .delete()
    .eq('schedule_item_id', itemId)
  if (deleteError) throw deleteError

  if (assignments.length === 0) return
  const { error: insertError } = await supabase
    .from('workbook_schedule_assignments')
    .insert(assignments.map(assignment => ({
      schedule_item_id: itemId,
      user_id: assignment.userId,
      person_name: assignment.personName,
      role: assignment.role,
      department: assignment.department,
      is_open: assignment.isOpen,
    })))
  if (insertError) throw insertError
}

function itemPayload(input: ScheduleItemInput) {
  return {
    workbook_id: input.workbookId,
    event_id: input.eventId,
    location_id: input.locationId,
    title: input.title.trim(),
    item_type: input.itemType,
    scheduled_date: input.scheduledDate,
    start_time: input.startTime,
    end_time: input.endTime,
    notes: input.notes,
    departments: input.departments,
    tags: input.tags,
    updated_at: new Date().toISOString(),
  }
}

export async function createScheduleItem(input: ScheduleItemInput): Promise<string> {
  const { data, error } = await supabase
    .from('workbook_schedule_items')
    .insert(itemPayload(input))
    .select('id')
    .single()
  if (error) throw error
  await replaceAssignments(data.id as string, input.assignments)
  return data.id as string
}

export async function updateScheduleItem(itemId: string, input: ScheduleItemInput): Promise<void> {
  const { error } = await supabase
    .from('workbook_schedule_items')
    .update(itemPayload(input))
    .eq('id', itemId)
  if (error) throw error
  await replaceAssignments(itemId, input.assignments)
}

export async function deleteScheduleItem(itemId: string): Promise<void> {
  const { error } = await supabase
    .from('workbook_schedule_items')
    .delete()
    .eq('id', itemId)
  if (error) throw error
}

// ── PCO plan-time room/department overlay ─────────────────────────────────────
// PCO plan times are read-only (PCO owns the time); this stores the workbook's
// room + department annotation for each, keyed by the stable PCO plan-time id.

export interface PcoTimeMeta {
  location_id: string | null
  departments: string[]
}

/** Map keyed by `${event_id}:${pco_time_id}`. */
export async function loadPcoTimeMeta(eventIds: string[]): Promise<Record<string, PcoTimeMeta>> {
  if (eventIds.length === 0) return {}
  const { data, error } = await supabase
    .from('workbook_pco_time_meta')
    .select('event_id, pco_time_id, location_id, departments')
    .in('event_id', eventIds)
  if (error) throw error
  const map: Record<string, PcoTimeMeta> = {}
  for (const row of (data ?? []) as Array<{ event_id: string; pco_time_id: string; location_id: string | null; departments: string[] | null }>) {
    map[`${row.event_id}:${row.pco_time_id}`] = {
      location_id: row.location_id ?? null,
      departments: row.departments ?? [],
    }
  }
  return map
}

// ── Workbook crew roster ──────────────────────────────────────────────────────

export interface CrewMemberInput {
  workbookId: string
  eventId: string | null
  scheduledDate: string
  userId: string | null
  personName: string | null
  isOpen: boolean
  roleId: string | null
  callTime: string | null
  releaseTime: string | null
  isPaid: boolean
}

export async function loadWorkbookCrew(workbookId: string): Promise<WorkbookCrewMember[]> {
  const { data, error } = await supabase
    .from('workbook_crew')
    .select('*')
    .eq('workbook_id', workbookId)
    .order('scheduled_date', { ascending: true })
    .order('call_time', { ascending: true, nullsFirst: false })
    .order('sort_order', { ascending: true })
  if (error) throw error
  return (data ?? []) as WorkbookCrewMember[]
}

function crewPayload(input: CrewMemberInput) {
  return {
    workbook_id: input.workbookId,
    event_id: input.eventId,
    scheduled_date: input.scheduledDate,
    user_id: input.userId,
    person_name: input.personName,
    is_open: input.isOpen,
    role_id: input.roleId,
    call_time: input.callTime,
    release_time: input.releaseTime,
    is_paid: input.isPaid,
    updated_at: new Date().toISOString(),
  }
}

export async function createCrewMember(input: CrewMemberInput): Promise<void> {
  const { error } = await supabase.from('workbook_crew').insert(crewPayload(input))
  if (error) throw error
}

export async function updateCrewMember(id: string, input: CrewMemberInput): Promise<void> {
  const { error } = await supabase.from('workbook_crew').update(crewPayload(input)).eq('id', id)
  if (error) throw error
}

export async function deleteCrewMember(id: string): Promise<void> {
  const { error } = await supabase.from('workbook_crew').delete().eq('id', id)
  if (error) throw error
}

// ── Workbook supplies ─────────────────────────────────────────────────────────

export interface SupplyItemInput {
  workbookId: string
  departmentId: string | null
  itemName: string
  description: string | null
  quantity: number
  unitPrice: number
  purchaseUrl: string | null
}

export async function loadWorkbookSupplies(workbookId: string): Promise<WorkbookSupplyItem[]> {
  const { data, error } = await supabase
    .from('workbook_supplies')
    .select('*')
    .eq('workbook_id', workbookId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as WorkbookSupplyItem[]
}

function supplyPayload(input: SupplyItemInput) {
  return {
    workbook_id: input.workbookId,
    department_id: input.departmentId,
    item_name: input.itemName.trim(),
    description: input.description?.trim() || null,
    quantity: Math.max(0, input.quantity),
    unit_price: Math.max(0, input.unitPrice),
    purchase_url: input.purchaseUrl,
    updated_at: new Date().toISOString(),
  }
}

export async function createSupplyItem(input: SupplyItemInput): Promise<void> {
  const { error } = await supabase.from('workbook_supplies').insert(supplyPayload(input))
  if (error) throw error
}

export async function updateSupplyItem(id: string, input: SupplyItemInput): Promise<void> {
  const { error } = await supabase.from('workbook_supplies').update(supplyPayload(input)).eq('id', id)
  if (error) throw error
}

export async function deleteSupplyItem(id: string): Promise<void> {
  const { error } = await supabase.from('workbook_supplies').delete().eq('id', id)
  if (error) throw error
}

export async function upsertPcoTimeMeta(input: {
  workbookId: string
  eventId: string
  pcoTimeId: string
  locationId: string | null
  departments: string[]
}): Promise<void> {
  const { error } = await supabase
    .from('workbook_pco_time_meta')
    .upsert({
      workbook_id: input.workbookId,
      event_id: input.eventId,
      pco_time_id: input.pcoTimeId,
      location_id: input.locationId,
      departments: input.departments,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'event_id,pco_time_id' })
  if (error) throw error
}

export async function detachEventFromWorkbook(eventId: string): Promise<void> {
  const { error } = await supabase
    .from('events')
    .update({ workbook_id: null, workbook_location_id: null })
    .eq('id', eventId)
  if (error) throw error
}

export async function updateWorkbookEventLocation(
  eventId: string,
  locationId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('events')
    .update({
      workbook_location_id: locationId,
    })
    .eq('id', eventId)
  if (error) throw error
}

export interface WorkbookVersionRow {
  version_number: number
  published_at: string
  snapshot: unknown
}

/** The most recently published/sent version, or null if none yet. */
export async function loadLatestWorkbookVersion(workbookId: string): Promise<WorkbookVersionRow | null> {
  const { data, error } = await supabase
    .from('workbook_schedule_versions')
    .select('version_number, published_at, snapshot')
    .eq('workbook_id', workbookId)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return (data as WorkbookVersionRow | null) ?? null
}

export async function publishWorkbookSchedule(
  workbook: Workbook,
  snapshot: WorkbookPublicationSnapshot,
  userId: string | null,
): Promise<Workbook> {
  const { data, error } = await supabase
    .rpc('publish_workbook_schedule', {
      p_workbook_id: workbook.id,
      p_published_by: userId,
      p_snapshot: snapshot,
    })
    .single()
  if (error) throw error
  return data as Workbook
}
