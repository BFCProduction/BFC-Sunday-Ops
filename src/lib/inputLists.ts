import { supabase } from './supabase'
import type {
  InputListCellLink,
  InputListColumnSource,
  InputListConnectionType,
  InputListRoomRow,
  InputListRoomValue,
  InputListSection,
  InputListSectionColumn,
  Location,
  WorkbookInputListValue,
} from '../types'

export { INPUT_LIST_CONNECTION_TYPES } from './inputListConnectionTypes'

export interface InputListPrintRow {
  connectionType: InputListConnectionType
  groupKey: string
  values: string[]
}

export interface InputListPrintSection {
  name: string
  columns: string[]
  groupColumnIndex: number | null
  rows: InputListPrintRow[]
}

export interface InputListPrintDocument {
  locationName: string
  sections: InputListPrintSection[]
}

export interface InputListCellLinkChange {
  target_row_id: string
  target_column_id: string
  source_row_id: string | null
  source_column_id: string | null
}

export interface WorkbookInputListValueChange {
  row_id: string
  column_id: string
  value: string
}

export function inputListCellKey(rowId: string, columnId: string) {
  return `${rowId}:${columnId}`
}

export function inputListColumnIsVisible(column: Pick<InputListSectionColumn, 'name'>): boolean {
  return column.name.trim().toLocaleLowerCase() !== 'type'
}

export function inputListRowLabel(
  row: InputListRoomRow,
  columns: InputListSectionColumn[],
): string {
  const visibleLabels = columns
    .filter(column => column.value_source === 'room' && inputListColumnIsVisible(column))
    .map(column => row.room_values.find(value => value.column_id === column.id)?.value.trim() ?? '')
    .filter(Boolean)
  if (visibleLabels.length > 0) return visibleLabels.join(' · ')

  const fallbackLabel = columns
    .filter(column => column.value_source === 'room')
    .map(column => row.room_values.find(value => value.column_id === column.id)?.value.trim() ?? '')
    .find(Boolean)
  return fallbackLabel || `Connection ${row.sort_order + 1}`
}

export function incrementTrailingNumber(value: string, offset: number): string {
  const match = value.match(/^(.*?)(\d+)(\s*)$/)
  if (!match) return value
  const [, prefix, digits, suffix] = match
  const nextNumber = Number.parseInt(digits, 10) + offset
  return `${prefix}${String(nextNumber).padStart(digits.length, '0')}${suffix}`
}

export function buildResolvedInputListValueMap(
  sections: InputListSection[],
  workbookValues: Pick<WorkbookInputListValue, 'row_id' | 'column_id' | 'value'>[],
  links: Pick<InputListCellLink, 'target_row_id' | 'target_column_id' | 'source_row_id' | 'source_column_id'>[],
): Map<string, string> {
  const workbookValueByKey = new Map(workbookValues.map(value => [
    inputListCellKey(value.row_id, value.column_id),
    value.value,
  ]))
  const baseValues = new Map<string, string>()
  for (const section of sections) {
    for (const row of section.rows) {
      for (const column of section.columns) {
        const key = inputListCellKey(row.id, column.id)
        baseValues.set(key, column.value_source === 'room'
          ? row.room_values.find(value => value.column_id === column.id)?.value ?? ''
          : workbookValueByKey.get(key) ?? '')
      }
    }
  }

  const linkByTarget = new Map(links.map(link => [
    inputListCellKey(link.target_row_id, link.target_column_id),
    link,
  ]))
  const resolvedValues = new Map<string, string>()
  const resolving = new Set<string>()

  function resolve(key: string): string {
    if (resolvedValues.has(key)) return resolvedValues.get(key) ?? ''
    if (resolving.has(key)) return '#REF!'
    resolving.add(key)
    const link = linkByTarget.get(key)
    const value = link
      ? resolve(inputListCellKey(link.source_row_id, link.source_column_id))
      : baseValues.get(key) ?? ''
    resolving.delete(key)
    resolvedValues.set(key, value)
    return value
  }

  for (const key of new Set([...baseValues.keys(), ...linkByTarget.keys()])) resolve(key)
  return resolvedValues
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

export async function loadInputListCellLinks(locationId: string): Promise<InputListCellLink[]> {
  const { data, error } = await supabase
    .from('input_list_cell_links')
    .select('*')
    .eq('location_id', locationId)
  if (error) throw error
  return (data ?? []) as InputListCellLink[]
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

export async function saveWorkbookInputListValuesBulk(
  workbookId: string,
  cells: WorkbookInputListValueChange[],
): Promise<void> {
  if (cells.length === 0) return
  const { error } = await supabase.rpc('save_workbook_input_list_values_bulk', {
    target_workbook_id: workbookId,
    cells,
  })
  if (error) throw error
}

export async function saveInputListCellLinksBulk(
  locationId: string,
  cells: InputListCellLinkChange[],
): Promise<void> {
  if (cells.length === 0) return
  const { error } = await supabase.rpc('save_input_list_cell_links_bulk', {
    target_location_id: locationId,
    cells,
  })
  if (error) throw error
}

export async function loadWorkbookInputListDocuments(
  workbookId: string,
  locations: Location[],
  preferredLocationIds: string[] = [],
): Promise<InputListPrintDocument[]> {
  const [configurationEntries, workbookValues] = await Promise.all([
    Promise.all(locations.map(async location => {
      const [sections, links] = await Promise.all([
        loadInputListConfiguration(location.id),
        loadInputListCellLinks(location.id),
      ])
      return { location, sections, links }
    })),
    loadWorkbookInputListValues(workbookId),
  ])
  const preferred = new Set(preferredLocationIds)

  const withValues = new Set<string>()
  for (const entry of configurationEntries) {
    const rowIds = new Set(entry.sections.flatMap(section => section.rows.map(row => row.id)))
    if (workbookValues.some(value => rowIds.has(value.row_id))) withValues.add(entry.location.id)
  }

  return configurationEntries
    .filter(entry => entry.sections.length > 0)
    .filter(entry => preferred.size === 0 || preferred.has(entry.location.id) || withValues.has(entry.location.id))
    .map(entry => {
      const resolvedValues = buildResolvedInputListValueMap(entry.sections, workbookValues, entry.links)
      return {
        locationName: entry.location.name,
        sections: entry.sections.map(section => {
          const visibleColumns = section.columns.filter(inputListColumnIsVisible)
          return {
            name: section.name,
            columns: visibleColumns.map(column => column.name),
            groupColumnIndex: (() => {
              const index = visibleColumns.findIndex(column => column.value_source === 'room')
              return index >= 0 ? index : null
            })(),
            rows: section.rows.map(row => ({
              connectionType: row.connection_type,
              groupKey: inputListRowGroupKey(row, section.columns),
              values: visibleColumns.map(column => {
                if (column.value_source === 'room') {
                  return row.room_values.find(value => value.column_id === column.id)?.value ?? ''
                }
                return resolvedValues.get(inputListCellKey(row.id, column.id)) ?? ''
              }),
            })),
          }
        }),
      }
    })
}
