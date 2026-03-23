import { supabase } from './supabase'
import { loadOrSeedChecklistItems } from './checklist'

export interface ReportData {
  sundayDate: string
  attendance: {
    service_1_count: number | null
    service_2_count: number | null
    notes: string | null
  } | null
  runtimes: Array<{ label: string; value: string | null }>
  issues: Array<{
    id: string
    title: string
    description: string
    severity: string
    created_at: string
    resolved_at: string | null
  }>
  checklistExceptions: Array<{
    task: string
    role: string
    section: string
    subsection: string | null
  }>
  checklistTotalItems: number
  checklistCompletedCount: number
  evaluations: Array<{
    submitted_at: string
    service_feel: string | null
    broken_moment: boolean | null
    broken_moment_detail: string | null
    went_well: string | null
    needed_attention: string | null
    area_notes: string | null
  }>
  weather: {
    temp_f: number | null
    condition: string | null
    wind_mph: number | null
    humidity: number | null
  } | null
}

export async function fetchReportData(sundayId: string, sundayDate: string): Promise<ReportData> {
  const [
    attendanceRes,
    runtimeFieldsRes,
    runtimeValuesRes,
    issuesRes,
    checklistItems,
    completionsRes,
    evaluationsRes,
    weatherRes,
  ] = await Promise.all([
    supabase.from('attendance').select('*').eq('sunday_id', sundayId).maybeSingle(),
    supabase.from('runtime_fields').select('*').order('sort_order', { ascending: true }),
    supabase.from('runtime_values').select('field_id, value').eq('sunday_id', sundayId),
    supabase.from('issues').select('*').eq('sunday_id', sundayId).order('created_at', { ascending: false }),
    loadOrSeedChecklistItems(),
    supabase.from('checklist_completions').select('item_id').eq('sunday_id', sundayId),
    supabase.from('evaluations').select('*').eq('sunday_id', sundayId).order('submitted_at', { ascending: true }),
    supabase.from('weather').select('*').eq('sunday_id', sundayId).maybeSingle(),
  ])

  // Build runtime label → value map
  const valueMap: Record<number, string | null> = {}
  ;(runtimeValuesRes.data || []).forEach((r: { field_id: number; value: string | null }) => {
    valueMap[r.field_id] = r.value
  })
  const runtimes = (runtimeFieldsRes.data || []).map((f: { id: number; label: string }) => ({
    label: f.label,
    value: valueMap[f.id] ?? null,
  }))

  // Checklist exceptions
  const completedIds = new Set((completionsRes.data || []).map((r: { item_id: number }) => r.item_id))
  const checklistExceptions = checklistItems
    .filter(item => !completedIds.has(item.id))
    .map(item => ({
      task: item.task,
      role: item.role,
      section: item.section,
      subsection: item.subsection,
    }))

  return {
    sundayDate,
    attendance: attendanceRes.data
      ? {
          service_1_count: attendanceRes.data.service_1_count,
          service_2_count: attendanceRes.data.service_2_count,
          notes: attendanceRes.data.notes,
        }
      : null,
    runtimes,
    issues: issuesRes.data || [],
    checklistExceptions,
    checklistTotalItems: checklistItems.length,
    checklistCompletedCount: completedIds.size,
    evaluations: evaluationsRes.data || [],
    weather: weatherRes.data
      ? {
          temp_f: weatherRes.data.temp_f,
          condition: weatherRes.data.condition,
          wind_mph: weatherRes.data.wind_mph,
          humidity: weatherRes.data.humidity,
        }
      : null,
  }
}
