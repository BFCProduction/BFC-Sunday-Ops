import { supabase } from './supabase'
import type {
  Session,
  Workbook,
  WorkbookLocation,
  WorkbookScheduleAssignment,
  WorkbookScheduleItem,
  WorkbookScheduleItemType,
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
  locations: WorkbookLocation[]
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

export async function loadWorkbookLocations(workbookId: string): Promise<WorkbookLocation[]> {
  const { data, error } = await supabase
    .from('workbook_locations')
    .select('*')
    .eq('workbook_id', workbookId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []) as WorkbookLocation[]
}

export async function createWorkbookLocation(workbookId: string, name: string): Promise<WorkbookLocation> {
  const { data, error } = await supabase
    .from('workbook_locations')
    .insert({ workbook_id: workbookId, name: name.trim() })
    .select('*')
    .single()
  if (error) throw error
  return data as WorkbookLocation
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

export async function attachEventToWorkbook(eventId: string, workbookId: string): Promise<void> {
  const { error } = await supabase
    .from('events')
    .update({ workbook_id: workbookId })
    .eq('id', eventId)
  if (error) throw error
}

export async function detachEventFromWorkbook(eventId: string): Promise<void> {
  const { error } = await supabase
    .from('events')
    .update({ workbook_id: null, workbook_location_id: null })
    .eq('id', eventId)
  if (error) throw error
}

export async function updateWorkbookEventSchedule(
  eventId: string,
  endTime: string | null,
  locationId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('events')
    .update({
      event_end_time: endTime,
      workbook_location_id: locationId,
    })
    .eq('id', eventId)
  if (error) throw error
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
