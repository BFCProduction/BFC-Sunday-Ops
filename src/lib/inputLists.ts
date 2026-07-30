import { supabase } from './supabase'
import type {
  InputListColumnSource,
  InputListConnectionType,
  InputListRoomRow,
  InputListRoomValue,
  InputListSection,
  InputListSectionColumn,
  Location,
  WorkbookInputListValue,
} from '../types'

export const INPUT_LIST_CONNECTION_TYPES: Array<{
  key: InputListConnectionType
  label: string
}> = [
  { key: 'audio_input', label: 'Audio input' },
  { key: 'audio_output', label: 'Audio output' },
  { key: 'monitor_output', label: 'Monitor output' },
  { key: 'network', label: 'Network' },
  { key: 'fiber', label: 'Fiber' },
  { key: 'bnc', label: 'BNC' },
]

export interface InputListPrintRow {
  connectionType: string
  groupKey: string
  values: string[]
}

export interface InputListPrintSection {
  name: string
  columns: string[]
  rows: InputListPrintRow[]
}

export interface InputListPrintDocument {
  locationName: string
  sections: InputListPrintSection[]
}

function sortByOrder<T extends { sort_order: number }>(rows: T[]) {
  return [...rows].sort((a, b) => a.sort_order - b.sort_order)
}

export function inputListRowGroupKey(
  row: InputListRoomRow,
  columns: InputListSectionColumn[],
): string {
  const primaryRoomColumn = columns.find(column => column.value_source === 'room')
  if (!primaryRoomColumn) return `row:${row.id}`
  const groupValue = row.room_values
    .find(value => value.column_id === primaryRoomColumn.id)
    ?.value
    .trim()
    .toLocaleLowerCase()
  return groupValue ? `room:${groupValue}` : `row:${row.id}`
}

export function groupInputListRows(
  rows: InputListRoomRow[],
  columns: InputListSectionColumn[],
): InputListRoomRow[] {
  const grouped = new Map<string, InputListRoomRow[]>()
  for (const row of rows) {
    const key = inputListRowGroupKey(row, columns)
    const group = grouped.get(key)
    if (group) group.push(row)
    else grouped.set(key, [row])
  }
  return [...grouped.values()].flat()
}

export async function loadInputListConfiguration(locationId: string): Promise<InputListSection[]> {
  const { data: sectionData, error: sectionError } = await supabase
    .from('input_list_sections')
    .select('*')
    .eq('location_id', locationId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (sectionError) throw sectionError

  const sections = (sectionData ?? []) as Omit<InputListSection, 'columns' | 'rows'>[]
  const sectionIds = sections.map(section => section.id)
  if (sectionIds.length === 0) return []

  const [
    { data: columnData, error: columnError },
    { data: rowData, error: rowError },
  ] = await Promise.all([
    supabase
      .from('input_list_columns')
      .select('*')
      .in('section_id', sectionIds)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    supabase
      .from('input_list_rows')
      .select('*')
      .in('section_id', sectionIds)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
  ])
  if (columnError) throw columnError
  if (rowError) throw rowError

  const columns = (columnData ?? []) as InputListSectionColumn[]
  const rows = (rowData ?? []) as Omit<InputListRoomRow, 'room_values'>[]
  const rowIds = rows.map(row => row.id)
  let roomValues: InputListRoomValue[] = []

  if (rowIds.length > 0) {
    const rowIdChunks = Array.from(
      { length: Math.ceil(rowIds.length / 100) },
      (_, index) => rowIds.slice(index * 100, index * 100 + 100),
    )
    const results = await Promise.all(rowIdChunks.map(rowIdChunk =>
      supabase
        .from('input_list_room_values')
        .select('*')
        .in('row_id', rowIdChunk),
    ))
    const failed = results.find(result => result.error)
    if (failed?.error) throw failed.error
    roomValues = results.flatMap(result => (result.data ?? []) as InputListRoomValue[])
  }

  return sortByOrder(sections).map(section => {
    const sectionColumns = sortByOrder(columns.filter(column => column.section_id === section.id))
    const sectionRows = sortByOrder(rows.filter(row => row.section_id === section.id)).map(row => ({
      ...row,
      room_values: roomValues.filter(value => value.row_id === row.id),
    }))
    return {
      ...section,
      columns: sectionColumns,
      rows: groupInputListRows(sectionRows, sectionColumns),
    }
  })
}

export async function createInputListSection(
  locationId: string,
  name: string,
  sortOrder: number,
): Promise<InputListSection> {
  const { data, error } = await supabase
    .from('input_list_sections')
    .insert({ location_id: locationId, name: name.trim(), sort_order: sortOrder })
    .select('*')
    .single()
  if (error) throw error
  return { ...(data as Omit<InputListSection, 'columns' | 'rows'>), columns: [], rows: [] }
}

export async function renameInputListSection(id: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('input_list_sections')
    .update({ name: name.trim(), updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deleteInputListSection(id: string): Promise<void> {
  const { error } = await supabase.from('input_list_sections').delete().eq('id', id)
  if (error) throw error
}

export async function reorderInputListSections(orderedIds: string[]): Promise<void> {
  const { error } = await supabase.rpc('reorder_input_list_sections', { ordered_ids: orderedIds })
  if (error) throw error
}

export async function createInputListColumn(
  sectionId: string,
  name: string,
  valueSource: InputListColumnSource,
  sortOrder: number,
): Promise<InputListSectionColumn> {
  const { data, error } = await supabase
    .from('input_list_columns')
    .insert({
      section_id: sectionId,
      name: name.trim(),
      value_source: valueSource,
      sort_order: sortOrder,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as InputListSectionColumn
}

export async function updateInputListColumn(
  id: string,
  input: { name: string; valueSource: InputListColumnSource },
): Promise<void> {
  const { error } = await supabase
    .from('input_list_columns')
    .update({
      name: input.name.trim(),
      value_source: input.valueSource,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw error
}

export async function deleteInputListColumn(id: string): Promise<void> {
  const { error } = await supabase.from('input_list_columns').delete().eq('id', id)
  if (error) throw error
}

export async function reorderInputListColumns(orderedIds: string[]): Promise<void> {
  const { error } = await supabase.rpc('reorder_input_list_columns', { ordered_ids: orderedIds })
  if (error) throw error
}

export async function createInputListRow(
  sectionId: string,
  connectionType: InputListConnectionType,
  sortOrder: number,
): Promise<InputListRoomRow> {
  const { data, error } = await supabase
    .from('input_list_rows')
    .insert({
      section_id: sectionId,
      connection_type: connectionType,
      sort_order: sortOrder,
    })
    .select('*')
    .single()
  if (error) throw error
  return { ...(data as Omit<InputListRoomRow, 'room_values'>), room_values: [] }
}

export async function updateInputListRowType(
  id: string,
  connectionType: InputListConnectionType,
): Promise<void> {
  const { error } = await supabase
    .from('input_list_rows')
    .update({ connection_type: connectionType, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deleteInputListRow(id: string): Promise<void> {
  const { error } = await supabase.from('input_list_rows').delete().eq('id', id)
  if (error) throw error
}

export async function reorderInputListRows(orderedIds: string[]): Promise<void> {
  const { error } = await supabase.rpc('reorder_input_list_rows', { ordered_ids: orderedIds })
  if (error) throw error
}

export async function saveInputListRoomValue(
  rowId: string,
  columnId: string,
  value: string,
): Promise<void> {
  const trimmed = value.trim()
  if (!trimmed) {
    const { error } = await supabase
      .from('input_list_room_values')
      .delete()
      .eq('row_id', rowId)
      .eq('column_id', columnId)
    if (error) throw error
    return
  }

  const { error } = await supabase
    .from('input_list_room_values')
    .upsert({
      row_id: rowId,
      column_id: columnId,
      value: trimmed,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'row_id,column_id' })
  if (error) throw error
}

export async function loadWorkbookInputListValues(workbookId: string): Promise<WorkbookInputListValue[]> {
  const { data, error } = await supabase
    .from('workbook_input_list_values')
    .select('*')
    .eq('workbook_id', workbookId)
  if (error) throw error
  return (data ?? []) as WorkbookInputListValue[]
}

export async function saveWorkbookInputListValue(
  workbookId: string,
  rowId: string,
  columnId: string,
  value: string,
): Promise<void> {
  const trimmed = value.trim()
  if (!trimmed) {
    const { error } = await supabase
      .from('workbook_input_list_values')
      .delete()
      .eq('workbook_id', workbookId)
      .eq('row_id', rowId)
      .eq('column_id', columnId)
    if (error) throw error
    return
  }

  const { error } = await supabase
    .from('workbook_input_list_values')
    .upsert({
      workbook_id: workbookId,
      row_id: rowId,
      column_id: columnId,
      value: trimmed,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'workbook_id,row_id,column_id' })
  if (error) throw error
}

function valueKey(rowId: string, columnId: string) {
  return `${rowId}:${columnId}`
}

export async function loadWorkbookInputListDocuments(
  workbookId: string,
  locations: Location[],
  preferredLocationIds: string[] = [],
): Promise<InputListPrintDocument[]> {
  const [configurationEntries, workbookValues] = await Promise.all([
    Promise.all(locations.map(async location => ({
      location,
      sections: await loadInputListConfiguration(location.id),
    }))),
    loadWorkbookInputListValues(workbookId),
  ])

  const valueByKey = new Map(workbookValues.map(value => [
    valueKey(value.row_id, value.column_id),
    value.value,
  ]))
  const preferred = new Set(preferredLocationIds)

  const withValues = new Set<string>()
  for (const entry of configurationEntries) {
    const rowIds = new Set(entry.sections.flatMap(section => section.rows.map(row => row.id)))
    if (workbookValues.some(value => rowIds.has(value.row_id))) withValues.add(entry.location.id)
  }

  return configurationEntries
    .filter(entry => entry.sections.length > 0)
    .filter(entry => preferred.size === 0 || preferred.has(entry.location.id) || withValues.has(entry.location.id))
    .map(entry => ({
      locationName: entry.location.name,
      sections: entry.sections.map(section => ({
        name: section.name,
        columns: section.columns.map(column => column.name),
        rows: section.rows.map(row => ({
          connectionType: INPUT_LIST_CONNECTION_TYPES.find(option => option.key === row.connection_type)?.label ?? row.connection_type,
          groupKey: inputListRowGroupKey(row, section.columns),
          values: section.columns.map(column => {
            if (column.value_source === 'room') {
              return row.room_values.find(value => value.column_id === column.id)?.value ?? ''
            }
            return valueByKey.get(valueKey(row.id, column.id)) ?? ''
          }),
        })),
      })),
    }))
}
