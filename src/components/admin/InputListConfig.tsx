import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Check,
  Columns3,
  GripVertical,
  Loader2,
  Plus,
  Save,
  TableProperties,
  Trash2,
} from 'lucide-react'
import { Card } from '../ui/Card'
import {
  INPUT_LIST_CONNECTION_TYPES,
  createInputListColumn,
  createInputListRow,
  createInputListSection,
  deleteInputListColumn,
  deleteInputListRow,
  deleteInputListSection,
  groupInputListRows,
  loadInputListConfiguration,
  renameInputListSection,
  reorderInputListColumns,
  reorderInputListRows,
  reorderInputListSections,
  saveInputListRoomValue,
  updateInputListColumn,
  updateInputListRowType,
} from '../../lib/inputLists'
import type {
  InputListColumnSource,
  InputListConnectionType,
  InputListRoomRow,
  InputListSection,
  InputListSectionColumn,
  Location,
} from '../../types'

const FIELD = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500'

function nextSortOrder(rows: Array<{ sort_order: number }>) {
  return rows.length > 0 ? Math.max(...rows.map(row => row.sort_order)) + 1 : 0
}

function nextUniqueName(base: string, existing: string[]) {
  const normalized = new Set(existing.map(name => name.trim().toLowerCase()))
  if (!normalized.has(base.toLowerCase())) return base
  let suffix = 2
  while (normalized.has(`${base} ${suffix}`.toLowerCase())) suffix++
  return `${base} ${suffix}`
}

function roomValue(row: InputListRoomRow, columnId: string) {
  return row.room_values.find(value => value.column_id === columnId)?.value ?? ''
}

function SortableShell({
  id,
  label,
  asTableRow = false,
  children,
}: {
  id: string
  label: string
  asTableRow?: boolean
  children: (handle: ReactNode) => ReactNode
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }
  const handle = (
    <button
      type="button"
      {...attributes}
      {...listeners}
      aria-label={`Drag to reorder ${label}`}
      className="touch-none cursor-grab rounded-md p-1.5 text-gray-300 hover:bg-white hover:text-gray-500 active:cursor-grabbing"
    >
      <GripVertical className="h-4 w-4" />
    </button>
  )

  if (asTableRow) {
    return (
      <tr ref={setNodeRef} style={style} className={isDragging ? 'relative z-10 bg-blue-50 shadow-lg' : ''}>
        {children(handle)}
      </tr>
    )
  }

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? 'relative z-10 opacity-80 shadow-lg' : ''}>
      {children(handle)}
    </div>
  )
}

interface InputListConfigProps {
  locations: Location[]
}

export function InputListConfig({ locations }: InputListConfigProps) {
  const [locationId, setLocationId] = useState(locations[0]?.id ?? '')
  const [sections, setSections] = useState<InputListSection[]>([])
  const [activeSectionId, setActiveSectionId] = useState('')
  const [newSectionName, setNewSectionName] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [confirmDeleteSection, setConfirmDeleteSection] = useState(false)
  const [confirmDeleteColumn, setConfirmDeleteColumn] = useState<string | null>(null)
  const [confirmDeleteRow, setConfirmDeleteRow] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const activeSection = useMemo(
    () => sections.find(section => section.id === activeSectionId) ?? null,
    [activeSectionId, sections],
  )
  const roomColumns = activeSection?.columns.filter(column => column.value_source === 'room') ?? []

  useEffect(() => {
    if (locations.some(location => location.id === locationId)) return
    setLocationId(locations[0]?.id ?? '')
  }, [locationId, locations])

  useEffect(() => {
    if (!locationId) {
      setSections([])
      setActiveSectionId('')
      return
    }

    let active = true
    setLoading(true)
    setError('')
    loadInputListConfiguration(locationId)
      .then(nextSections => {
        if (!active) return
        setSections(nextSections)
        setActiveSectionId(current =>
          nextSections.some(section => section.id === current)
            ? current
            : nextSections[0]?.id ?? '',
        )
      })
      .catch(err => {
        if (active) setError(err instanceof Error ? err.message : 'Unable to load input-list configuration.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [locationId])

  async function reload(preferredSectionId?: string) {
    if (!locationId) return
    const nextSections = await loadInputListConfiguration(locationId)
    setSections(nextSections)
    setActiveSectionId(current => {
      if (preferredSectionId && nextSections.some(section => section.id === preferredSectionId)) return preferredSectionId
      if (nextSections.some(section => section.id === current)) return current
      return nextSections[0]?.id ?? ''
    })
  }

  async function run(action: () => Promise<void>, success?: string) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action()
      if (success) setNotice(success)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save input-list configuration.')
    } finally {
      setBusy(false)
    }
  }

  async function addSection() {
    const name = newSectionName.trim()
    if (!name || !locationId) return
    await run(async () => {
      const created = await createInputListSection(locationId, name, nextSortOrder(sections))
      setNewSectionName('')
      await reload(created.id)
    }, 'Section added.')
  }

  async function renameSection(name: string) {
    if (!activeSection || !name.trim()) return
    const sectionId = activeSection.id
    setSections(current => current.map(section => section.id === sectionId ? { ...section, name } : section))
    try {
      await renameInputListSection(sectionId, name)
      setNotice('Section name saved.')
    } catch (err) {
      await reload(sectionId)
      setError(err instanceof Error ? err.message : 'Unable to rename section.')
    }
  }

  async function removeSection() {
    if (!activeSection) return
    await run(async () => {
      await deleteInputListSection(activeSection.id)
      setConfirmDeleteSection(false)
      await reload()
    }, 'Section deleted.')
  }

  async function reorderSections(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = sections.findIndex(section => section.id === active.id)
    const newIndex = sections.findIndex(section => section.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const previous = sections
    const reordered = arrayMove(sections, oldIndex, newIndex).map((section, index) => ({ ...section, sort_order: index }))
    setSections(reordered)
    try {
      await reorderInputListSections(reordered.map(section => section.id))
      setNotice('Section order saved.')
    } catch (err) {
      setSections(previous)
      setError(err instanceof Error ? err.message : 'Unable to reorder sections.')
    }
  }

  async function addColumn() {
    if (!activeSection) return
    const name = nextUniqueName('New column', activeSection.columns.map(column => column.name))
    await run(async () => {
      await createInputListColumn(
        activeSection.id,
        name,
        'workbook',
        nextSortOrder(activeSection.columns),
      )
      await reload(activeSection.id)
    }, 'Column added.')
  }

  function updateColumnLocal(columnId: string, patch: Partial<InputListSectionColumn>) {
    setSections(current => current.map(section => section.id !== activeSectionId ? section : {
      ...section,
      columns: section.columns.map(column => column.id === columnId ? { ...column, ...patch } : column),
    }))
  }

  async function persistColumn(column: InputListSectionColumn) {
    if (!column.name.trim()) {
      await reload(activeSectionId)
      setError('Column names cannot be blank.')
      return
    }
    try {
      await updateInputListColumn(column.id, {
        name: column.name,
        valueSource: column.value_source,
      })
      setNotice('Column saved.')
    } catch (err) {
      await reload(activeSectionId)
      setError(err instanceof Error ? err.message : 'Unable to save column.')
    }
  }

  async function removeColumn(columnId: string) {
    await run(async () => {
      await deleteInputListColumn(columnId)
      setConfirmDeleteColumn(null)
      await reload(activeSectionId)
    }, 'Column deleted.')
  }

  async function reorderColumns(event: DragEndEvent) {
    if (!activeSection) return
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = activeSection.columns.findIndex(column => column.id === active.id)
    const newIndex = activeSection.columns.findIndex(column => column.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const previous = activeSection.columns
    const reordered = arrayMove(activeSection.columns, oldIndex, newIndex)
      .map((column, index) => ({ ...column, sort_order: index }))
    setSections(current => current.map(section =>
      section.id === activeSection.id ? { ...section, columns: reordered } : section,
    ))
    try {
      await reorderInputListColumns(reordered.map(column => column.id))
      setNotice('Column order saved.')
    } catch (err) {
      setSections(current => current.map(section =>
        section.id === activeSection.id ? { ...section, columns: previous } : section,
      ))
      setError(err instanceof Error ? err.message : 'Unable to reorder columns.')
    }
  }

  async function addConnection() {
    if (!activeSection) return
    await run(async () => {
      await createInputListRow(activeSection.id, 'audio_input', nextSortOrder(activeSection.rows))
      await reload(activeSection.id)
    }, 'Connection added.')
  }

  function updateRowLocal(rowId: string, patch: Partial<InputListRoomRow>) {
    setSections(current => current.map(section => section.id !== activeSectionId ? section : {
      ...section,
      rows: section.rows.map(row => row.id === rowId ? { ...row, ...patch } : row),
    }))
  }

  function updateRoomValueLocal(rowId: string, columnId: string, value: string) {
    setSections(current => current.map(section => section.id !== activeSectionId ? section : {
      ...section,
      rows: section.rows.map(row => {
        if (row.id !== rowId) return row
        const existing = row.room_values.find(roomCell => roomCell.column_id === columnId)
        return {
          ...row,
          room_values: existing
            ? row.room_values.map(roomCell => roomCell.column_id === columnId ? { ...roomCell, value } : roomCell)
            : [...row.room_values, {
              row_id: rowId,
              column_id: columnId,
              value,
              updated_at: new Date().toISOString(),
            }],
        }
      }),
    }))
  }

  async function persistRoomValue(rowId: string, columnId: string, value: string) {
    try {
      await saveInputListRoomValue(rowId, columnId, value)
      if (columnId === roomColumns[0]?.id) {
        const nextSections = await loadInputListConfiguration(locationId)
        const nextSection = nextSections.find(section => section.id === activeSectionId)
        if (nextSection) await reorderInputListRows(nextSection.rows.map(row => row.id))
        await reload(activeSectionId)
      }
      setNotice('Room value saved.')
    } catch (err) {
      await reload(activeSectionId)
      setError(err instanceof Error ? err.message : 'Unable to save room value.')
    }
  }

  async function changeConnectionType(rowId: string, connectionType: InputListConnectionType) {
    updateRowLocal(rowId, { connection_type: connectionType })
    try {
      await updateInputListRowType(rowId, connectionType)
      setNotice('Connection type saved.')
    } catch (err) {
      await reload(activeSectionId)
      setError(err instanceof Error ? err.message : 'Unable to save connection type.')
    }
  }

  async function removeConnection(rowId: string) {
    await run(async () => {
      await deleteInputListRow(rowId)
      setConfirmDeleteRow(null)
      await reload(activeSectionId)
    }, 'Connection deleted.')
  }

  async function reorderConnections(event: DragEndEvent) {
    if (!activeSection) return
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = activeSection.rows.findIndex(row => row.id === active.id)
    const newIndex = activeSection.rows.findIndex(row => row.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const previous = activeSection.rows
    const reordered = groupInputListRows(
      arrayMove(activeSection.rows, oldIndex, newIndex),
      activeSection.columns,
    ).map((row, index) => ({ ...row, sort_order: index }))
    setSections(current => current.map(section =>
      section.id === activeSection.id ? { ...section, rows: reordered } : section,
    ))
    try {
      await reorderInputListRows(reordered.map(row => row.id))
      setNotice('Connection order saved.')
    } catch (err) {
      setSections(current => current.map(section =>
        section.id === activeSection.id ? { ...section, rows: previous } : section,
      ))
      setError(err instanceof Error ? err.message : 'Unable to reorder connections.')
    }
  }

  if (locations.length === 0) {
    return <Card className="p-6 text-sm text-gray-500">Add a Location before configuring an input list.</Card>
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-gray-100 p-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <TableProperties className="h-4 w-4 text-blue-600" /> Input List Configuration
          </p>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-gray-500">
            Build a reusable room document from ordered sections, columns, and connections. Room-defined values are
            read-only in a workbook; workbook-entry columns are filled per production.
          </p>
        </div>
        <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Location
          <select className={`${FIELD} mt-1 min-w-52 normal-case`} value={locationId} onChange={event => setLocationId(event.target.value)}>
            {locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
          </select>
        </label>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 p-6 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading room configuration…</div>
      ) : (
        <div className="grid min-h-[520px] lg:grid-cols-[230px_minmax(0,1fr)]">
          <aside className="border-b border-gray-100 bg-gray-50 p-3 lg:border-b-0 lg:border-r">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorderSections}>
              <SortableContext items={sections.map(section => section.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-1.5">
                  {sections.map(section => (
                    <SortableShell key={section.id} id={section.id} label={section.name}>
                      {handle => (
                        <div className={`flex items-center gap-1 rounded-lg border px-1 py-1 ${
                          activeSectionId === section.id ? 'border-blue-200 bg-blue-50' : 'border-transparent'
                        }`}>
                          {handle}
                          <button
                            type="button"
                            onClick={() => {
                              setActiveSectionId(section.id)
                              setConfirmDeleteSection(false)
                              setConfirmDeleteColumn(null)
                              setConfirmDeleteRow(null)
                            }}
                            className={`min-w-0 flex-1 rounded-md px-2 py-2 text-left text-sm font-semibold ${
                              activeSectionId === section.id ? 'text-blue-800' : 'text-gray-700 hover:bg-white'
                            }`}
                          >
                            <span className="block truncate">{section.name}</span>
                            <span className="mt-0.5 block text-[10px] font-medium text-gray-400">
                              {section.columns.length} columns · {section.rows.length} rows
                            </span>
                          </button>
                        </div>
                      )}
                    </SortableShell>
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            <div className="mt-4 space-y-2 border-t border-gray-200 pt-4">
              <input
                className={FIELD}
                value={newSectionName}
                onChange={event => setNewSectionName(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void addSection()
                  }
                }}
                placeholder="New section"
              />
              <button
                type="button"
                onClick={() => void addSection()}
                disabled={busy || !newSectionName.trim()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" /> Add section
              </button>
            </div>
          </aside>

          <div className="min-w-0 p-5">
            {!activeSection ? (
              <div className="py-20 text-center text-sm text-gray-400">Add a section to begin configuring this room.</div>
            ) : (
              <div className="space-y-7">
                <div className="flex flex-col gap-3 border-b border-gray-100 pb-5 sm:flex-row sm:items-end sm:justify-between">
                  <label className="min-w-0 flex-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Section name
                    <input
                      className={`${FIELD} mt-1 max-w-md normal-case`}
                      value={activeSection.name}
                      onChange={event => setSections(current => current.map(section =>
                        section.id === activeSection.id ? { ...section, name: event.target.value } : section,
                      ))}
                      onBlur={event => void renameSection(event.target.value)}
                    />
                  </label>
                  {confirmDeleteSection ? (
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setConfirmDeleteSection(false)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-600">Cancel</button>
                      <button type="button" onClick={() => void removeSection()} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white">Delete section</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setConfirmDeleteSection(true)} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-gray-400 hover:bg-red-50 hover:text-red-600">
                      <Trash2 className="h-4 w-4" /> Delete section
                    </button>
                  )}
                </div>

                <div>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="flex items-center gap-2 text-sm font-semibold text-gray-900"><Columns3 className="h-4 w-4 text-blue-600" /> Columns</p>
                      <p className="mt-0.5 text-xs text-gray-500">Drag to control left-to-right workbook order.</p>
                    </div>
                    <button type="button" onClick={() => void addColumn()} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                      <Plus className="h-4 w-4" /> Add column
                    </button>
                  </div>

                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorderColumns}>
                    <SortableContext items={activeSection.columns.map(column => column.id)} strategy={verticalListSortingStrategy}>
                      <div className="space-y-2">
                        {activeSection.columns.map(column => (
                          <SortableShell key={column.id} id={column.id} label={column.name}>
                            {handle => (
                              <div className="grid gap-2 rounded-xl border border-gray-100 bg-gray-50 p-2 sm:grid-cols-[auto_minmax(140px,1fr)_minmax(150px,220px)_auto] sm:items-center">
                                {handle}
                                <input
                                  className={FIELD}
                                  value={column.name}
                                  onChange={event => updateColumnLocal(column.id, { name: event.target.value })}
                                  onBlur={() => void persistColumn(column)}
                                  aria-label="Column name"
                                />
                                <select
                                  className={FIELD}
                                  value={column.value_source}
                                  onChange={event => {
                                    const valueSource = event.target.value as InputListColumnSource
                                    const updated = { ...column, value_source: valueSource }
                                    updateColumnLocal(column.id, { value_source: valueSource })
                                    void persistColumn(updated)
                                  }}
                                  aria-label={`${column.name} value source`}
                                >
                                  <option value="room">Room-defined value</option>
                                  <option value="workbook">Workbook entry</option>
                                </select>
                                {confirmDeleteColumn === column.id ? (
                                  <button type="button" onClick={() => void removeColumn(column.id)} className="rounded-lg bg-red-600 px-2.5 py-2 text-xs font-semibold text-white">Confirm</button>
                                ) : (
                                  <button type="button" onClick={() => setConfirmDeleteColumn(column.id)} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600" aria-label={`Delete ${column.name}`}>
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                            )}
                          </SortableShell>
                        ))}
                        {activeSection.columns.length === 0 && (
                          <p className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-400">No columns yet.</p>
                        )}
                      </div>
                    </SortableContext>
                  </DndContext>
                </div>

                <div>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Room connection inventory</p>
                      <p className="mt-0.5 text-xs text-gray-500">Drag rows to control their workbook and print order.</p>
                    </div>
                    <button type="button" onClick={() => void addConnection()} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                      <Plus className="h-4 w-4" /> Add connection
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorderConnections}>
                      <SortableContext items={activeSection.rows.map(row => row.id)} strategy={verticalListSortingStrategy}>
                        <table className="w-full min-w-[620px] text-sm">
                          <thead>
                            <tr className="border-b border-gray-100 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                              <th className="w-10 px-2 py-2" />
                              {roomColumns.map(column => <th key={column.id} className="px-2 py-2">{column.name}</th>)}
                              <th className="min-w-40 px-2 py-2">Connection type</th>
                              <th className="w-16 px-2 py-2" />
                            </tr>
                          </thead>
                          <tbody>
                            {activeSection.rows.map(row => (
                              <SortableShell key={row.id} id={row.id} label={`connection ${row.sort_order + 1}`} asTableRow>
                                {handle => (
                                  <>
                                    <td className="border-b border-gray-50 px-1 py-2">{handle}</td>
                                    {roomColumns.map(column => (
                                      <td key={column.id} className="border-b border-gray-50 px-2 py-2">
                                        <input
                                          className={FIELD}
                                          value={roomValue(row, column.id)}
                                          onChange={event => updateRoomValueLocal(row.id, column.id, event.target.value)}
                                          onBlur={event => void persistRoomValue(row.id, column.id, event.target.value)}
                                          aria-label={`${column.name} row ${row.sort_order + 1}`}
                                        />
                                      </td>
                                    ))}
                                    <td className="border-b border-gray-50 px-2 py-2">
                                      <select
                                        className={FIELD}
                                        value={row.connection_type}
                                        onChange={event => void changeConnectionType(row.id, event.target.value as InputListConnectionType)}
                                      >
                                        {INPUT_LIST_CONNECTION_TYPES.map(type => <option key={type.key} value={type.key}>{type.label}</option>)}
                                      </select>
                                    </td>
                                    <td className="border-b border-gray-50 px-2 py-2 text-right">
                                      {confirmDeleteRow === row.id ? (
                                        <button type="button" onClick={() => void removeConnection(row.id)} className="rounded-lg bg-red-600 px-2.5 py-2 text-xs font-semibold text-white">Confirm</button>
                                      ) : (
                                        <button type="button" onClick={() => setConfirmDeleteRow(row.id)} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600" aria-label="Delete connection">
                                          <Trash2 className="h-4 w-4" />
                                        </button>
                                      )}
                                    </td>
                                  </>
                                )}
                              </SortableShell>
                            ))}
                          </tbody>
                        </table>
                      </SortableContext>
                    </DndContext>
                  </div>
                  {roomColumns.length === 0 && (
                    <p className="mt-3 text-xs text-amber-700">Add at least one room-defined column to label these connections.</p>
                  )}
                  {activeSection.rows.length === 0 && (
                    <p className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-400">No room connections yet.</p>
                  )}
                </div>
              </div>
            )}

            {(notice || error || busy) && (
              <div className="mt-5 flex items-center gap-2 border-t border-gray-100 pt-4 text-xs">
                {busy ? <><Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" /><span className="text-gray-500">Saving…</span></>
                  : error ? <span className="text-red-600">{error}</span>
                    : <><Check className="h-3.5 w-3.5 text-emerald-600" /><span className="text-emerald-700">{notice}</span></>}
              </div>
            )}
          </div>
        </div>
      )}

      {!loading && !error && sections.length > 0 && (
        <div className="flex items-center gap-2 border-t border-gray-100 bg-gray-50 px-5 py-3 text-xs text-gray-500">
          <Save className="h-3.5 w-3.5" /> Changes save as you edit and reorder.
        </div>
      )}
    </Card>
  )
}
