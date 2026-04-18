import { supabase } from './supabase'
import { loadOrSeedChecklistItems } from './checklist'

interface ReportEvent {
  id: string
  name: string
  eventDate: string
  eventTime: string | null
  legacySundayId: string | null
  legacySpecialEventId: string | null
  serviceTypeSlug: string
  serviceTypeName: string
}

interface EventRow {
  id: string
  name: string
  event_date: string
  event_time: string | null
  legacy_sunday_id: string | null
  legacy_special_event_id: string | null
  service_types:
    | {
        slug: string
        name: string
      }
    | Array<{
        slug: string
        name: string
      }>
    | null
}

interface AttendanceRow {
  service_1_count: number | null
  service_2_count: number | null
  notes: string | null
}

interface RuntimeFieldRow {
  id: number
  label: string
}

interface RuntimeValueRow {
  field_id: number
  value: string | null
}

interface IssueRow {
  id: string
  title: string
  description: string
  severity: string
  created_at: string
  resolved_at: string | null
}

interface ChecklistRow {
  id: string | number
  task: string
  role: string
  section: string
  subsection: string | null
}

interface CompletionRow {
  item_id: string | number
}

interface EvaluationRow {
  submitted_at: string
  service_feel: string | null
  broken_moment: boolean | null
  broken_moment_detail: string | null
  went_well: string | null
  needed_attention: string | null
  area_notes: string | null
}

interface WeatherRow {
  temp_f: number | null
  condition: string | null
  wind_mph: number | null
  humidity: number | null
}

type ScopedSource = 'event' | 'legacy_special' | 'legacy_sunday' | null

export interface ReportData {
  eventId: string
  eventName: string
  eventDate: string
  eventTime: string | null
  serviceTypeName: string
  serviceTypeSlug: string
  sundayDate: string
  attendance: {
    count: number | null
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

const EVENT_SELECT = `
  id, name, event_date, event_time, legacy_sunday_id, legacy_special_event_id,
  service_types ( slug, name )
`

const SEVERITY_ORDER: Record<string, number> = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3,
}

function normalizeEventRow(row: EventRow): ReportEvent {
  const serviceType = Array.isArray(row.service_types)
    ? row.service_types[0]
    : row.service_types

  return {
    id: row.id,
    name: row.name,
    eventDate: row.event_date,
    eventTime: row.event_time,
    legacySundayId: row.legacy_sunday_id || null,
    legacySpecialEventId: row.legacy_special_event_id || null,
    serviceTypeSlug: serviceType?.slug || 'special',
    serviceTypeName: serviceType?.name || 'Special Event',
  }
}

function normalizeAttendance(row: AttendanceRow | null, source: ScopedSource, event: ReportEvent) {
  if (!row) return null

  const legacy11am = source === 'legacy_sunday' && event.serviceTypeSlug === 'sunday-11am'
  const count = source === 'legacy_sunday'
    ? legacy11am
      ? row.service_2_count
      : row.service_1_count
    : row.service_1_count ?? row.service_2_count ?? null

  return {
    count: count ?? null,
    notes: row.notes || null,
  }
}

function dedupeById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>()
  const output: T[] = []
  rows.forEach(row => {
    if (seen.has(row.id)) return
    seen.add(row.id)
    output.push(row)
  })
  return output
}

function sortIssues(issues: IssueRow[]): IssueRow[] {
  return [...issues].sort((a, b) => {
    const severityDelta = (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99)
    if (severityDelta !== 0) return severityDelta
    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
  })
}

async function loadEvent(eventId: string): Promise<ReportEvent> {
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_SELECT)
    .eq('id', eventId)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('Event not found.')
  return normalizeEventRow(data as unknown as EventRow)
}

async function loadScopedSingle<T>(
  table: string,
  event: ReportEvent,
  select = '*',
): Promise<{ data: T | null; source: ScopedSource }> {
  const scopes: Array<{ source: Exclude<ScopedSource, null>; column: string; value: string }> = [
    { source: 'event' as const, column: 'event_id', value: event.id },
  ]

  if (event.legacySpecialEventId) {
    scopes.push({ source: 'legacy_special' as const, column: 'event_id', value: event.legacySpecialEventId })
  }

  if (event.legacySundayId) {
    scopes.push({ source: 'legacy_sunday' as const, column: 'sunday_id', value: event.legacySundayId })
  }

  for (const scope of scopes) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .eq(scope.column, scope.value)
      .maybeSingle()

    if (error) throw error
    if (data) return { data: data as T, source: scope.source }
  }

  return { data: null, source: null }
}

async function loadSpecialChecklistRows(eventId: string) {
  const [{ data: items, error: itemsError }, { data: completions, error: completionsError }] = await Promise.all([
    supabase
      .from('event_checklist_items')
      .select('*')
      .eq('event_id', eventId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('event_checklist_completions')
      .select('item_id, initials, completed_at')
      .eq('event_id', eventId),
  ])

  if (itemsError) throw itemsError
  if (completionsError) throw completionsError

  return {
    items: (items || []).map(item => ({
      id: item.id,
      task: item.label,
      role: 'All',
      section: item.section,
      subsection: item.subsection,
    })) as ChecklistRow[],
    completions: (completions || []) as CompletionRow[],
  }
}

async function loadChecklistData(event: ReportEvent): Promise<{ items: ChecklistRow[]; completions: CompletionRow[] }> {
  if (event.serviceTypeSlug === 'special') {
    const currentRows = await loadSpecialChecklistRows(event.id)
    if (currentRows.items.length > 0 || !event.legacySpecialEventId) return currentRows

    return loadSpecialChecklistRows(event.legacySpecialEventId)
  }

  const [items, completionsRes] = await Promise.all([
    loadOrSeedChecklistItems(event.serviceTypeSlug),
    supabase
      .from('checklist_completions')
      .select('item_id, initials, completed_at')
      .eq('event_id', event.id),
  ])

  if (completionsRes.error) throw completionsRes.error

  let completions = (completionsRes.data || []) as CompletionRow[]
  if (completions.length === 0 && event.legacySundayId) {
    const { data, error } = await supabase
      .from('checklist_completions')
      .select('item_id, initials, completed_at')
      .eq('sunday_id', event.legacySundayId)
    if (error) throw error
    completions = (data || []) as CompletionRow[]
  }

  return {
    items: items.map(item => ({
      id: item.id,
      task: item.task,
      role: item.role,
      section: item.section,
      subsection: item.subsection,
    })),
    completions,
  }
}

async function loadIssues(event: ReportEvent): Promise<IssueRow[]> {
  const scopes = [
    { column: 'event_id', value: event.id },
  ]
  if (event.legacySpecialEventId) scopes.push({ column: 'event_id', value: event.legacySpecialEventId })
  if (event.legacySundayId) scopes.push({ column: 'sunday_id', value: event.legacySundayId })

  const results = await Promise.all(scopes.map(scope =>
    supabase
      .from('issues')
      .select('id, title, description, severity, created_at, resolved_at')
      .eq(scope.column, scope.value)
  ))

  results.forEach(result => {
    if (result.error) throw result.error
  })

  return sortIssues(dedupeById(results.flatMap(result => (result.data || []) as IssueRow[])))
}

async function loadEvaluations(event: ReportEvent): Promise<EvaluationRow[]> {
  const { data: eventRows, error: eventError } = await supabase
    .from('evaluations')
    .select('*')
    .eq('event_id', event.id)
    .order('submitted_at', { ascending: true })

  if (eventError) throw eventError
  if (eventRows && eventRows.length > 0) return eventRows as EvaluationRow[]

  if (event.legacySpecialEventId) {
    const { data, error } = await supabase
      .from('evaluations')
      .select('*')
      .eq('event_id', event.legacySpecialEventId)
      .order('submitted_at', { ascending: true })

    if (error) throw error
    if (data && data.length > 0) return data as EvaluationRow[]
  }

  if (!event.legacySundayId) return []

  const { data, error } = await supabase
    .from('evaluations')
    .select('*')
    .eq('sunday_id', event.legacySundayId)
    .order('submitted_at', { ascending: true })

  if (error) throw error
  return (data || []) as EvaluationRow[]
}

async function loadRuntimeData(event: ReportEvent): Promise<Array<{ label: string; value: string | null }>> {
  const [{ data: fields, error: fieldsError }, { data: eventValues, error: eventValuesError }] = await Promise.all([
    supabase
      .from('runtime_fields')
      .select('id, label')
      .or(`service_type_slug.is.null,service_type_slug.eq.${event.serviceTypeSlug}`)
      .order('sort_order', { ascending: true })
      .order('pull_time', { ascending: true }),
    supabase
      .from('runtime_values')
      .select('field_id, value')
      .eq('event_id', event.id),
  ])

  if (fieldsError) throw fieldsError
  if (eventValuesError) throw eventValuesError

  let runtimeValues = (eventValues || []) as RuntimeValueRow[]
  if (runtimeValues.length === 0 && event.legacySundayId) {
    const { data, error } = await supabase
      .from('runtime_values')
      .select('field_id, value')
      .eq('sunday_id', event.legacySundayId)
    if (error) throw error
    runtimeValues = (data || []) as RuntimeValueRow[]
  }

  const valueMap: Record<number, string | null> = {}
  runtimeValues.forEach(row => {
    valueMap[row.field_id] = row.value
  })

  return ((fields || []) as RuntimeFieldRow[]).map(field => ({
    label: field.label,
    value: valueMap[field.id] ?? null,
  }))
}

function buildChecklistExceptions(items: ChecklistRow[], completions: CompletionRow[]) {
  const itemIds = new Set(items.map(item => String(item.id)))
  const completedIds = new Set(
    completions
      .map(row => String(row.item_id))
      .filter(itemId => itemIds.has(itemId)),
  )

  return {
    completedCount: completedIds.size,
    exceptions: items
      .filter(item => !completedIds.has(String(item.id)))
      .map(item => ({
        task: item.task,
        role: item.role,
        section: item.section,
        subsection: item.subsection,
      })),
  }
}

async function buildReportData(event: ReportEvent): Promise<ReportData> {
  const [
    attendanceResult,
    runtimes,
    issues,
    checklist,
    evaluations,
    weatherResult,
  ] = await Promise.all([
    loadScopedSingle<AttendanceRow>('attendance', event),
    loadRuntimeData(event),
    loadIssues(event),
    loadChecklistData(event),
    loadEvaluations(event),
    loadScopedSingle<WeatherRow>('weather', event),
  ])

  const checklistSummary = buildChecklistExceptions(checklist.items, checklist.completions)

  return {
    eventId: event.id,
    eventName: event.name,
    eventDate: event.eventDate,
    eventTime: event.eventTime,
    serviceTypeName: event.serviceTypeName,
    serviceTypeSlug: event.serviceTypeSlug,
    sundayDate: event.eventDate,
    attendance: normalizeAttendance(attendanceResult.data, attendanceResult.source, event),
    runtimes,
    issues,
    checklistExceptions: checklistSummary.exceptions,
    checklistTotalItems: checklist.items.length,
    checklistCompletedCount: checklistSummary.completedCount,
    evaluations,
    weather: weatherResult.data
      ? {
          temp_f: weatherResult.data.temp_f,
          condition: weatherResult.data.condition,
          wind_mph: weatherResult.data.wind_mph,
          humidity: weatherResult.data.humidity,
        }
      : null,
  }
}

export async function fetchEventReportData(eventId: string): Promise<ReportData> {
  return buildReportData(await loadEvent(eventId))
}

async function fetchLegacySundayReport(sundayId: string, sundayDate: string): Promise<ReportData> {
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
    supabase.from('runtime_fields').select('id, label').order('sort_order', { ascending: true }),
    supabase.from('runtime_values').select('field_id, value').eq('sunday_id', sundayId),
    supabase.from('issues').select('id, title, description, severity, created_at, resolved_at').eq('sunday_id', sundayId),
    loadOrSeedChecklistItems(),
    supabase.from('checklist_completions').select('item_id').eq('sunday_id', sundayId),
    supabase.from('evaluations').select('*').eq('sunday_id', sundayId).order('submitted_at', { ascending: true }),
    supabase.from('weather').select('*').eq('sunday_id', sundayId).maybeSingle(),
  ])

  if (attendanceRes.error) throw attendanceRes.error
  if (runtimeFieldsRes.error) throw runtimeFieldsRes.error
  if (runtimeValuesRes.error) throw runtimeValuesRes.error
  if (issuesRes.error) throw issuesRes.error
  if (completionsRes.error) throw completionsRes.error
  if (evaluationsRes.error) throw evaluationsRes.error
  if (weatherRes.error) throw weatherRes.error

  const valueMap: Record<number, string | null> = {}
  ;((runtimeValuesRes.data || []) as RuntimeValueRow[]).forEach(row => {
    valueMap[row.field_id] = row.value
  })

  const runtimes = ((runtimeFieldsRes.data || []) as RuntimeFieldRow[]).map(field => ({
    label: field.label,
    value: valueMap[field.id] ?? null,
  }))

  const checklistRows = checklistItems.map(item => ({
    id: item.id,
    task: item.task,
    role: item.role,
    section: item.section,
    subsection: item.subsection,
  }))
  const checklistSummary = buildChecklistExceptions(
    checklistRows,
    (completionsRes.data || []) as CompletionRow[],
  )

  const attendanceRow = attendanceRes.data as AttendanceRow | null
  const counts = attendanceRow
    ? [attendanceRow.service_1_count, attendanceRow.service_2_count].filter((value): value is number => value != null)
    : []

  return {
    eventId: sundayId,
    eventName: 'Sunday Services',
    eventDate: sundayDate,
    eventTime: null,
    serviceTypeName: 'Sunday Services',
    serviceTypeSlug: 'sunday',
    sundayDate,
    attendance: attendanceRow
      ? {
          count: counts.length > 0 ? counts.reduce((sum, value) => sum + value, 0) : null,
          notes: attendanceRow.notes,
        }
      : null,
    runtimes,
    issues: sortIssues((issuesRes.data || []) as IssueRow[]),
    checklistExceptions: checklistSummary.exceptions,
    checklistTotalItems: checklistRows.length,
    checklistCompletedCount: checklistSummary.completedCount,
    evaluations: (evaluationsRes.data || []) as EvaluationRow[],
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

/**
 * @deprecated Settings exports are event-native. This wrapper remains for the
 * old Service Data reporting screen while it is retired from the UI.
 */
export async function fetchReportData(sundayId: string, sundayDate: string): Promise<ReportData> {
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_SELECT)
    .eq('legacy_sunday_id', sundayId)
    .order('event_time', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  if (data) return buildReportData(normalizeEventRow(data as unknown as EventRow))

  return fetchLegacySundayReport(sundayId, sundayDate)
}
