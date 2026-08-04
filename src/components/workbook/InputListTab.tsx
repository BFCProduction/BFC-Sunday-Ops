import { useEffect, useMemo, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import {
  Check,
  ChevronDown,
  ChevronRight,
  Link2,
  Loader2,
  MapPin,
  RotateCcw,
  Search,
  TableProperties,
  Unlink2,
  X,
} from 'lucide-react'
import { Card } from '../ui/Card'
import {
  INPUT_LIST_CONNECTION_TYPES,
  buildResolvedInputListValueMap,
  incrementTrailingNumber,
  inputListCellKey,
  inputListColumnIsVisible,
  inputListRowGroupKey,
  inputListRowLabel,
  loadInputListCellLinks,
  loadInputListConfiguration,
  loadWorkbookInputListValues,
  saveInputListCellLinksBulk,
  saveWorkbookInputListValue,
  saveWorkbookInputListValuesBulk,
} from '../../lib/inputLists'
import type {
  InputListCellLinkChange,
  WorkbookInputListValueChange,
} from '../../lib/inputLists'
import type {
  InputListCellLink,
  InputListConnectionType,
  InputListRoomRow,
  InputListSection,
  InputListSectionColumn,
  Location,
  Session,
  Workbook,
} from '../../types'

interface InputListTabProps {
  workbook: Workbook
  locations: Location[]
  linkedEvents: Session[]
  editable: boolean
}

function roomValue(row: InputListRoomRow, columnId: string) {
  return row.room_values.find(value => value.column_id === columnId)?.value ?? ''
}

interface CellOption {
  key: string
  rowId: string
  columnId: string
  sectionName: string
  rowLabel: string
  columnName: string
  value: string
}

interface LinkEditorState {
  targetRowId: string
  targetColumnId: string
  query: string
  selectedSourceKey: string
}

interface FillPreview {
  sectionId: string
  columnId: string
  startIndex: number
  endIndex: number
}

interface PendingLinkFill {
  changes: InputListCellLinkChange[]
  firstTargetLabel: string
  lastTargetLabel: string
}

type UndoAction =
  | {
    kind: 'values'
    label: string
    changes: WorkbookInputListValueChange[]
  }
  | {
    kind: 'links'
    label: string
    changes: InputListCellLinkChange[]
  }

function applyLinkChanges(
  current: InputListCellLink[],
  locationId: string,
  changes: InputListCellLinkChange[],
): InputListCellLink[] {
  const changedTargets = new Set(changes.map(change =>
    inputListCellKey(change.target_row_id, change.target_column_id)))
  const now = new Date().toISOString()
  return [
    ...current.filter(link =>
      !changedTargets.has(inputListCellKey(link.target_row_id, link.target_column_id))),
    ...changes
      .filter((change): change is InputListCellLinkChange & {
        source_row_id: string
        source_column_id: string
      } => Boolean(change.source_row_id && change.source_column_id))
      .map(change => ({
        location_id: locationId,
        target_row_id: change.target_row_id,
        target_column_id: change.target_column_id,
        source_row_id: change.source_row_id,
        source_column_id: change.source_column_id,
        created_at: now,
        updated_at: now,
      })),
  ]
}

const CONNECTION_TYPE_STYLES: Record<InputListConnectionType, {
  row: string
  swatch: string
}> = {
  audio_input: {
    row: 'bg-white',
    swatch: 'border-gray-300 bg-white',
  },
  audio_output: {
    row: 'bg-[#cccccc]',
    swatch: 'border-gray-500 bg-[#cccccc]',
  },
  monitor_output: {
    row: 'bg-[#efefef]',
    swatch: 'border-gray-400 bg-[#efefef]',
  },
  network: {
    row: 'bg-[#b7b7b7]',
    swatch: 'border-gray-500 bg-[#b7b7b7]',
  },
  fiber: {
    row: 'bg-[#ffff00]',
    swatch: 'border-yellow-500 bg-[#ffff00]',
  },
  bnc: {
    row: 'bg-[#999999]',
    swatch: 'border-gray-600 bg-[#999999]',
  },
}

export function InputListTab({ workbook, locations, linkedEvents, editable }: InputListTabProps) {
  const eventLocationIds = useMemo(
    () => [...new Set(linkedEvents.map(event => event.workbookLocationId).filter((id): id is string => Boolean(id)))],
    [linkedEvents],
  )
  const orderedLocations = useMemo(() => {
    const preferred = new Set(eventLocationIds)
    return [...locations].sort((a, b) => {
      const preferredDifference = Number(preferred.has(b.id)) - Number(preferred.has(a.id))
      return preferredDifference || a.sort_order - b.sort_order
    })
  }, [eventLocationIds, locations])

  const [locationId, setLocationId] = useState(eventLocationIds[0] ?? orderedLocations[0]?.id ?? '')
  const [sections, setSections] = useState<InputListSection[]>([])
  const [values, setValues] = useState<Record<string, string>>({})
  const [links, setLinks] = useState<InputListCellLink[]>([])
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [bulkSaving, setBulkSaving] = useState(false)
  const [savingKey, setSavingKey] = useState('')
  const [savedKey, setSavedKey] = useState('')
  const [error, setError] = useState('')
  const [activeCellKey, setActiveCellKey] = useState('')
  const [fillPreview, setFillPreview] = useState<FillPreview | null>(null)
  const [linkEditor, setLinkEditor] = useState<LinkEditorState | null>(null)
  const [pendingLinkFill, setPendingLinkFill] = useState<PendingLinkFill | null>(null)
  const [undoAction, setUndoAction] = useState<UndoAction | null>(null)
  const usedConnectionTypes = useMemo(
    () => INPUT_LIST_CONNECTION_TYPES.filter(option =>
      sections.some(section => section.rows.some(row => row.connection_type === option.key))),
    [sections],
  )
  const workbookValues = useMemo(() => sections.flatMap(section =>
    section.rows.flatMap(row => section.columns
      .filter(column => column.value_source === 'workbook')
      .map(column => ({
        row_id: row.id,
        column_id: column.id,
        value: values[inputListCellKey(row.id, column.id)] ?? '',
      })))), [sections, values])
  const resolvedValues = useMemo(
    () => buildResolvedInputListValueMap(sections, workbookValues, links),
    [links, sections, workbookValues],
  )
  const linkByTarget = useMemo(() => new Map(links.map(link => [
    inputListCellKey(link.target_row_id, link.target_column_id),
    link,
  ])), [links])
  const cellOptions = useMemo<CellOption[]>(() => sections.flatMap(section =>
    section.rows.flatMap(row => section.columns
      .filter(inputListColumnIsVisible)
      .map(column => {
        const key = inputListCellKey(row.id, column.id)
        return {
          key,
          rowId: row.id,
          columnId: column.id,
          sectionName: section.name,
          rowLabel: inputListRowLabel(row, section.columns),
          columnName: column.name,
          value: resolvedValues.get(key) ?? '',
        }
      }))), [resolvedValues, sections])
  const cellOptionByKey = useMemo(
    () => new Map(cellOptions.map(option => [option.key, option])),
    [cellOptions],
  )
  const linkTargetOption = linkEditor
    ? cellOptionByKey.get(inputListCellKey(linkEditor.targetRowId, linkEditor.targetColumnId)) ?? null
    : null
  const linkCandidates = useMemo(() => {
    if (!linkEditor) return []
    const targetKey = inputListCellKey(linkEditor.targetRowId, linkEditor.targetColumnId)
    const target = cellOptionByKey.get(targetKey)
    const query = linkEditor.query.trim().toLocaleLowerCase()
    return cellOptions
      .filter(option => option.key !== targetKey)
      .filter(option => !query || [option.sectionName, option.rowLabel, option.columnName, option.value]
        .join(' ')
        .toLocaleLowerCase()
        .includes(query))
      .map((option, index) => ({
        option,
        index,
        score: Number(option.key === linkEditor.selectedSourceKey) * 8
          + Number(option.sectionName === target?.sectionName) * 4
          + Number(option.columnName === target?.columnName) * 2,
      }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, 40)
      .map(entry => entry.option)
  }, [cellOptionByKey, cellOptions, linkEditor])
  const selectedLinkCandidate = linkEditor
    ? cellOptionByKey.get(linkEditor.selectedSourceKey) ?? null
    : null

  useEffect(() => {
    if (orderedLocations.some(location => location.id === locationId)) return
    setLocationId(eventLocationIds[0] ?? orderedLocations[0]?.id ?? '')
  }, [eventLocationIds, locationId, orderedLocations])

  useEffect(() => {
    if (!locationId) {
      setSections([])
      setValues({})
      setLinks([])
      return
    }

    let active = true
    setLoading(true)
    setError('')
    Promise.all([
      loadInputListConfiguration(locationId),
      loadWorkbookInputListValues(workbook.id),
      loadInputListCellLinks(locationId),
    ])
      .then(([nextSections, nextValues, nextLinks]) => {
        if (!active) return
        setSections(nextSections)
        setValues(Object.fromEntries(nextValues.map(value => [
          inputListCellKey(value.row_id, value.column_id),
          value.value,
        ])))
        setLinks(nextLinks)
        setActiveCellKey('')
        setLinkEditor(null)
        setPendingLinkFill(null)
        setUndoAction(null)
        setCollapsed(current => new Set([...current].filter(id => nextSections.some(section => section.id === id))))
      })
      .catch(err => {
        if (active) setError(err instanceof Error ? err.message : 'Unable to load this input list.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => { active = false }
  }, [locationId, workbook.id])

  async function persistValue(rowId: string, columnId: string) {
    const key = inputListCellKey(rowId, columnId)
    setSavingKey(key)
    setSavedKey('')
    setError('')
    try {
      await saveWorkbookInputListValue(workbook.id, rowId, columnId, values[key] ?? '')
      setSavedKey(key)
      window.setTimeout(() => setSavedKey(current => current === key ? '' : current), 1600)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save the input-list value.')
    } finally {
      setSavingKey('')
    }
  }

  function previousLinkChanges(changes: InputListCellLinkChange[]): InputListCellLinkChange[] {
    return changes.map(change => {
      const previous = linkByTarget.get(inputListCellKey(change.target_row_id, change.target_column_id))
      return {
        target_row_id: change.target_row_id,
        target_column_id: change.target_column_id,
        source_row_id: previous?.source_row_id ?? null,
        source_column_id: previous?.source_column_id ?? null,
      }
    })
  }

  async function persistLinkChanges(
    changes: InputListCellLinkChange[],
    undoLabel: string,
  ): Promise<boolean> {
    if (!locationId || changes.length === 0) return false
    const previous = previousLinkChanges(changes)
    setBulkSaving(true)
    setError('')
    try {
      await saveInputListCellLinksBulk(locationId, changes)
      setLinks(current => applyLinkChanges(current, locationId, changes))
      setUndoAction({ kind: 'links', label: undoLabel, changes: previous })
      const key = inputListCellKey(changes[0].target_row_id, changes[0].target_column_id)
      setSavedKey(key)
      window.setTimeout(() => setSavedKey(current => current === key ? '' : current), 1600)
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save the location-wide cell link.')
      return false
    } finally {
      setBulkSaving(false)
    }
  }

  function openLinkEditor(rowId: string, columnId: string) {
    const existing = linkByTarget.get(inputListCellKey(rowId, columnId))
    setLinkEditor({
      targetRowId: rowId,
      targetColumnId: columnId,
      query: '',
      selectedSourceKey: existing
        ? inputListCellKey(existing.source_row_id, existing.source_column_id)
        : '',
    })
  }

  async function confirmLinkEditor() {
    if (!linkEditor || !selectedLinkCandidate) return
    const targetLabel = linkTargetOption?.rowLabel ?? 'cell'
    const saved = await persistLinkChanges([{
      target_row_id: linkEditor.targetRowId,
      target_column_id: linkEditor.targetColumnId,
      source_row_id: selectedLinkCandidate.rowId,
      source_column_id: selectedLinkCandidate.columnId,
    }], `Linked ${targetLabel}`)
    if (saved) setLinkEditor(null)
  }

  async function removeLink() {
    if (!linkEditor) return
    const targetLabel = linkTargetOption?.rowLabel ?? 'cell'
    const saved = await persistLinkChanges([{
      target_row_id: linkEditor.targetRowId,
      target_column_id: linkEditor.targetColumnId,
      source_row_id: null,
      source_column_id: null,
    }], `Unlinked ${targetLabel}`)
    if (saved) setLinkEditor(null)
  }

  async function applyValueFill(
    section: InputListSection,
    column: InputListSectionColumn,
    startIndex: number,
    endIndex: number,
  ) {
    const sourceRow = section.rows[startIndex]
    const sourceKey = inputListCellKey(sourceRow.id, column.id)
    const sourceValue = values[sourceKey] ?? ''
    if (!sourceValue.trim()) return
    const targetRows = section.rows.slice(startIndex + 1, endIndex + 1)
    const linkedTarget = targetRows.find(row =>
      linkByTarget.has(inputListCellKey(row.id, column.id)))
    if (linkedTarget) {
      setError(`Fill stopped because ${inputListRowLabel(linkedTarget, section.columns)} is a linked cell.`)
      return
    }

    const targetChanges = targetRows.map((row, index) => ({
      row_id: row.id,
      column_id: column.id,
      value: incrementTrailingNumber(sourceValue, index + 1),
    }))
    const previous = targetChanges.map(change => ({
      ...change,
      value: values[inputListCellKey(change.row_id, change.column_id)] ?? '',
    }))

    setBulkSaving(true)
    setError('')
    try {
      await saveWorkbookInputListValuesBulk(workbook.id, [{
        row_id: sourceRow.id,
        column_id: column.id,
        value: sourceValue,
      }, ...targetChanges])
      setValues(current => {
        const next = { ...current }
        for (const change of targetChanges) {
          next[inputListCellKey(change.row_id, change.column_id)] = change.value
        }
        return next
      })
      setUndoAction({
        kind: 'values',
        label: `Filled ${targetChanges.length} ${targetChanges.length === 1 ? 'cell' : 'cells'}`,
        changes: previous,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to fill the selected cells.')
    } finally {
      setBulkSaving(false)
    }
  }

  function prepareLinkFill(
    section: InputListSection,
    column: InputListSectionColumn,
    startIndex: number,
    endIndex: number,
    sourceLink: InputListCellLink,
  ) {
    const sourceOption = cellOptionByKey.get(
      inputListCellKey(sourceLink.source_row_id, sourceLink.source_column_id),
    )
    const sourceSection = sections.find(candidate =>
      candidate.rows.some(row => row.id === sourceLink.source_row_id))
    if (!sourceOption || !sourceSection) {
      setError('The source for this linked cell is no longer available.')
      return
    }

    const changes: InputListCellLinkChange[] = []
    for (let targetIndex = startIndex + 1; targetIndex <= endIndex; targetIndex += 1) {
      const offset = targetIndex - startIndex
      const nextSourceLabel = incrementTrailingNumber(sourceOption.rowLabel, offset)
      const nextSourceRow = nextSourceLabel === sourceOption.rowLabel
        ? sourceSection.rows.find(row => row.id === sourceLink.source_row_id)
        : sourceSection.rows.find(row =>
          inputListRowLabel(row, sourceSection.columns).toLocaleLowerCase()
          === nextSourceLabel.toLocaleLowerCase())
      if (!nextSourceRow) {
        setError(`Fill stopped because ${nextSourceLabel} does not exist in ${sourceSection.name}.`)
        return
      }
      changes.push({
        target_row_id: section.rows[targetIndex].id,
        target_column_id: column.id,
        source_row_id: nextSourceRow.id,
        source_column_id: sourceLink.source_column_id,
      })
    }

    setPendingLinkFill({
      changes,
      firstTargetLabel: inputListRowLabel(section.rows[startIndex + 1], section.columns),
      lastTargetLabel: inputListRowLabel(section.rows[endIndex], section.columns),
    })
  }

  function beginFill(
    event: ReactPointerEvent<HTMLButtonElement>,
    section: InputListSection,
    rowIndex: number,
    column: InputListSectionColumn,
  ) {
    if (event.button !== 0 || bulkSaving) return
    event.preventDefault()
    event.stopPropagation()
    let endIndex = rowIndex
    setFillPreview({
      sectionId: section.id,
      columnId: column.id,
      startIndex: rowIndex,
      endIndex,
    })

    const handleMove = (pointerEvent: PointerEvent) => {
      const cell = document
        .elementFromPoint(pointerEvent.clientX, pointerEvent.clientY)
        ?.closest<HTMLElement>('[data-input-list-fill-cell="true"]')
      if (!cell
        || cell.dataset.sectionId !== section.id
        || cell.dataset.columnId !== column.id) return
      const nextIndex = Number(cell.dataset.rowIndex)
      if (!Number.isInteger(nextIndex) || nextIndex < rowIndex) return
      endIndex = nextIndex
      setFillPreview({
        sectionId: section.id,
        columnId: column.id,
        startIndex: rowIndex,
        endIndex,
      })
    }

    const cleanup = () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleCancel)
      setFillPreview(null)
    }
    const handleUp = () => {
      cleanup()
      if (endIndex <= rowIndex) return
      const sourceLink = linkByTarget.get(inputListCellKey(section.rows[rowIndex].id, column.id))
      if (sourceLink) prepareLinkFill(section, column, rowIndex, endIndex, sourceLink)
      else void applyValueFill(section, column, rowIndex, endIndex)
    }
    const handleCancel = () => cleanup()

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp, { once: true })
    window.addEventListener('pointercancel', handleCancel, { once: true })
  }

  async function confirmLinkFill() {
    if (!pendingLinkFill) return
    const { changes } = pendingLinkFill
    const saved = await persistLinkChanges(
      changes,
      `Created ${changes.length} location-wide links`,
    )
    if (saved) setPendingLinkFill(null)
  }

  async function undoLastAction() {
    if (!undoAction || bulkSaving || !locationId) return
    const action = undoAction
    setBulkSaving(true)
    setError('')
    try {
      if (action.kind === 'values') {
        await saveWorkbookInputListValuesBulk(workbook.id, action.changes)
        setValues(current => {
          const next = { ...current }
          for (const change of action.changes) {
            next[inputListCellKey(change.row_id, change.column_id)] = change.value
          }
          return next
        })
      } else {
        await saveInputListCellLinksBulk(locationId, action.changes)
        setLinks(current => applyLinkChanges(current, locationId, action.changes))
      }
      setUndoAction(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to undo the last input-list change.')
    } finally {
      setBulkSaving(false)
    }
  }

  function toggleSection(sectionId: string) {
    setCollapsed(current => {
      const next = new Set(current)
      if (next.has(sectionId)) next.delete(sectionId)
      else next.add(sectionId)
      return next
    })
  }

  const selectedLocation = orderedLocations.find(location => location.id === locationId) ?? null

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <TableProperties className="h-4 w-4 text-blue-600" />
              Input List
            </p>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-gray-500">
              Room infrastructure is set in Workbook Settings. Fill in the workbook-specific source,
              destination, device, and monitor assignments here. Type = to link a cell for every
              {selectedLocation ? ` ${selectedLocation.name}` : ''} workbook, or drag the blue fill handle to continue a numbered series.
            </p>
          </div>
          <label className="min-w-[220px]">
            <span className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400">
              <MapPin className="h-3.5 w-3.5" />
              Room
            </span>
            <select
              value={locationId}
              onChange={event => setLocationId(event.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {orderedLocations.map(location => (
                <option key={location.id} value={location.id}>{location.name}</option>
              ))}
            </select>
          </label>
        </div>
        {eventLocationIds.length > 0 && selectedLocation && eventLocationIds.includes(selectedLocation.id) && (
          <p className="mt-3 text-[11px] font-medium text-blue-600">
            {selectedLocation.name} is assigned to an attached event in this workbook.
          </p>
        )}
        {usedConnectionTypes.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-gray-100 pt-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
              Connection colors
            </span>
            {usedConnectionTypes.map(option => (
              <span key={option.key} className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-600">
                <span className={`h-3 w-3 rounded-sm border ${CONNECTION_TYPE_STYLES[option.key].swatch}`} />
                {option.label}
              </span>
            ))}
          </div>
        )}
      </Card>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {undoAction && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <span>{undoAction.label}.</span>
          <button
            type="button"
            onClick={() => void undoLastAction()}
            disabled={bulkSaving}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
          >
            {bulkSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            Undo
          </button>
        </div>
      )}

      {loading ? (
        <Card className="flex items-center gap-2 p-6 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading input list…
        </Card>
      ) : !selectedLocation ? (
        <Card className="p-8 text-center text-sm text-gray-500">
          Add a room in Settings before building an input list.
        </Card>
      ) : sections.length === 0 ? (
        <Card className="p-8 text-center">
          <TableProperties className="mx-auto mb-3 h-8 w-8 text-gray-300" />
          <p className="text-sm font-semibold text-gray-800">No input list is configured for {selectedLocation.name}</p>
          <p className="mt-1 text-xs text-gray-500">
            Configure sections, columns, and room connections in Settings → Workbook Settings → Input Lists.
          </p>
        </Card>
      ) : (
        sections.map(section => {
          const isCollapsed = collapsed.has(section.id)
          const visibleColumns = section.columns.filter(inputListColumnIsVisible)
          return (
            <Card key={section.id} className="overflow-hidden">
              <button
                type="button"
                onClick={() => toggleSection(section.id)}
                className="flex w-full items-center gap-2 border-b border-gray-100 px-4 py-3 text-left hover:bg-gray-50"
              >
                {isCollapsed
                  ? <ChevronRight className="h-4 w-4 text-gray-400" />
                  : <ChevronDown className="h-4 w-4 text-gray-400" />}
                <span className="flex-1 text-sm font-bold text-gray-900">{section.name}</span>
                <span className="text-xs font-medium text-gray-400">
                  {section.rows.length} {section.rows.length === 1 ? 'connection' : 'connections'}
                </span>
              </button>

              {!isCollapsed && (
                visibleColumns.length === 0 ? (
                  <p className="px-5 py-6 text-sm text-gray-500">This section does not have any columns yet.</p>
                ) : section.rows.length === 0 ? (
                  <p className="px-5 py-6 text-sm text-gray-500">This section does not have any room connections yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse text-left">
                      <thead className="bg-gray-50">
                        <tr>
                          {visibleColumns.map(column => (
                            <th
                              key={column.id}
                              className={`${column.value_source === 'room' ? 'min-w-[120px]' : 'min-w-[150px]'} border-b border-r border-gray-200 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-gray-400 last:border-r-0`}
                            >
                              {column.name}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {section.rows.map((row, rowIndex) => {
                          const groupColumn = visibleColumns.find(column => column.value_source === 'room')
                          const groupKey = inputListRowGroupKey(row, section.columns)
                          const isGroupStart = rowIndex === 0
                            || groupKey !== inputListRowGroupKey(section.rows[rowIndex - 1], section.columns)
                          let groupRowSpan = 1
                          if (isGroupStart) {
                            while (
                              rowIndex + groupRowSpan < section.rows.length
                              && inputListRowGroupKey(section.rows[rowIndex + groupRowSpan], section.columns) === groupKey
                            ) {
                              groupRowSpan += 1
                            }
                          }
                          return (
                            <tr
                              key={row.id}
                              className={`border-b border-gray-100 last:border-b-0 ${CONNECTION_TYPE_STYLES[row.connection_type].row} ${isGroupStart && rowIndex > 0 ? 'border-t-2 border-t-gray-300' : ''}`}
                            >
                            {visibleColumns.map(column => {
                              if (column.id === groupColumn?.id && !isGroupStart) return null
                              const key = inputListCellKey(row.id, column.id)
                              const literalValue = values[key] ?? ''
                              const cellLink = linkByTarget.get(key)
                              const value = column.value_source === 'room'
                                ? roomValue(row, column.id)
                                : resolvedValues.get(key) ?? ''
                              const isFillRange = fillPreview?.sectionId === section.id
                                && fillPreview.columnId === column.id
                                && rowIndex >= fillPreview.startIndex
                                && rowIndex <= fillPreview.endIndex
                              const sourceOption = cellLink
                                ? cellOptionByKey.get(inputListCellKey(cellLink.source_row_id, cellLink.source_column_id))
                                : null
                              if (column.id === groupColumn?.id && groupRowSpan > 1) {
                                return (
                                  <td
                                    key={column.id}
                                    rowSpan={groupRowSpan}
                                    className="whitespace-nowrap border-r-2 border-gray-300 bg-white px-3 py-2 text-center align-middle text-sm font-bold text-gray-900"
                                  >
                                    {value || '—'}
                                  </td>
                                )
                              }
                              return (
                                <td
                                  key={column.id}
                                  data-input-list-fill-cell={editable && column.value_source === 'workbook' ? 'true' : undefined}
                                  data-section-id={section.id}
                                  data-column-id={column.id}
                                  data-row-index={rowIndex}
                                  className={`border-r border-gray-100 p-1.5 last:border-r-0 ${isFillRange ? 'relative z-10 outline outline-2 -outline-offset-2 outline-blue-500' : ''}`}
                                >
                                  {column.value_source === 'room' || !editable ? (
                                    <span className={`flex min-h-8 items-center gap-1.5 whitespace-nowrap px-2 py-1.5 text-sm ${value ? 'text-gray-800' : 'text-gray-300'}`}>
                                      {cellLink && <Link2 className="h-3.5 w-3.5 shrink-0 text-blue-500" />}
                                      {value || '—'}
                                    </span>
                                  ) : (
                                    <div className="relative">
                                      <input
                                        data-input-list-column={column.id}
                                        value={cellLink ? value : literalValue}
                                        readOnly={Boolean(cellLink)}
                                        title={cellLink && sourceOption
                                          ? `Linked for ${selectedLocation?.name ?? 'this location'} to ${sourceOption.sectionName} → ${sourceOption.rowLabel} → ${sourceOption.columnName}`
                                          : undefined}
                                        onChange={event => {
                                          if (!cellLink) setValues(current => ({ ...current, [key]: event.target.value }))
                                        }}
                                        onFocus={() => setActiveCellKey(key)}
                                        onBlur={() => {
                                          if (!cellLink) void persistValue(row.id, column.id)
                                        }}
                                        onKeyDown={event => {
                                          if (event.nativeEvent.isComposing) return
                                          if (event.key === '=') {
                                            event.preventDefault()
                                            openLinkEditor(row.id, column.id)
                                            return
                                          }
                                          if (event.key !== 'Enter') return
                                          event.preventDefault()
                                          const nextInput = event.currentTarget
                                            .closest('tr')
                                            ?.nextElementSibling
                                            ?.querySelector<HTMLInputElement>(`input[data-input-list-column="${column.id}"]`)
                                          if (nextInput) nextInput.focus()
                                          else event.currentTarget.blur()
                                        }}
                                        className={`w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 pr-8 text-sm outline-none hover:border-gray-200 hover:bg-white/70 focus:border-blue-500 focus:bg-white focus:ring-1 focus:ring-blue-500 ${cellLink ? 'cursor-default font-medium text-blue-800' : 'text-gray-900'}`}
                                      />
                                      {cellLink ? (
                                        <button
                                          type="button"
                                          onMouseDown={event => event.preventDefault()}
                                          onClick={() => openLinkEditor(row.id, column.id)}
                                          className="absolute right-1.5 top-1.5 rounded p-0.5 text-blue-500 hover:bg-blue-50 hover:text-blue-700"
                                          aria-label={`Edit link for ${inputListRowLabel(row, section.columns)} ${column.name}`}
                                        >
                                          <Link2 className="h-3.5 w-3.5" />
                                        </button>
                                      ) : (
                                        <>
                                          {savingKey === key && <Loader2 className="absolute right-2 top-2 h-3.5 w-3.5 animate-spin text-blue-500" />}
                                          {savedKey === key && <Check className="absolute right-2 top-2 h-3.5 w-3.5 text-emerald-600" />}
                                        </>
                                      )}
                                      {activeCellKey === key && (cellLink || literalValue.trim()) && (
                                        <button
                                          type="button"
                                          onPointerDown={event => beginFill(event, section, rowIndex, column)}
                                          className="absolute -bottom-1 -right-1 z-20 h-3 w-3 touch-none cursor-crosshair rounded-[2px] border border-white bg-blue-600 shadow-sm"
                                          aria-label={`Fill down from ${inputListRowLabel(row, section.columns)} ${column.name}`}
                                          title="Drag down to fill"
                                        />
                                      )}
                                    </div>
                                  )}
                                </td>
                              )
                            })}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </Card>
          )
        })
      )}

      {linkEditor && selectedLocation && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-gray-950/45 p-4" role="dialog" aria-modal="true" aria-labelledby="input-list-link-title">
          <div className="flex max-h-[min(720px,calc(100vh-2rem))] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start gap-3 border-b border-gray-100 px-5 py-4">
              <div className="rounded-xl bg-blue-50 p-2 text-blue-600"><Link2 className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1">
                <h2 id="input-list-link-title" className="text-base font-bold text-gray-900">Link this cell</h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  {linkTargetOption?.sectionName} → {linkTargetOption?.rowLabel} → {linkTargetOption?.columnName}
                </p>
              </div>
              <button type="button" onClick={() => setLinkEditor(null)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Close link picker">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="border-b border-amber-100 bg-amber-50 px-5 py-3 text-xs leading-relaxed text-amber-800">
              This is a <strong>{selectedLocation.name}-wide link</strong>. It will apply to this cell in every workbook that uses this location.
            </div>

            <div className="min-h-0 flex-1 p-5">
              <label className="relative block">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <input
                  autoFocus
                  value={linkEditor.query}
                  onChange={event => setLinkEditor(current => current ? { ...current, query: event.target.value } : current)}
                  onKeyDown={event => { if (event.key === 'Escape') setLinkEditor(null) }}
                  placeholder="Search a row, column, or current value…"
                  className="w-full rounded-xl border border-gray-200 py-2 pl-9 pr-3 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </label>

              <div className="mt-3 max-h-72 space-y-1 overflow-y-auto rounded-xl border border-gray-100 p-1.5">
                {linkCandidates.map(option => {
                  const isSelected = option.key === linkEditor.selectedSourceKey
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setLinkEditor(current => current ? { ...current, selectedSourceKey: option.key } : current)}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${isSelected ? 'bg-blue-50 ring-1 ring-blue-200' : 'hover:bg-gray-50'}`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-bold text-gray-800">
                          {option.sectionName} → {option.rowLabel} → {option.columnName}
                        </span>
                        <span className={`mt-0.5 block truncate text-xs ${option.value ? 'text-gray-500' : 'italic text-gray-300'}`}>
                          {option.value || 'Currently empty'}
                        </span>
                      </span>
                      {isSelected && <Check className="h-4 w-4 shrink-0 text-blue-600" />}
                    </button>
                  )
                })}
                {linkCandidates.length === 0 && (
                  <p className="px-3 py-8 text-center text-sm text-gray-400">No matching input-list cells.</p>
                )}
              </div>

              {selectedLinkCandidate && (
                <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
                  Formula: <span className="font-mono font-semibold text-gray-800">=[{selectedLinkCandidate.sectionName}].[{selectedLinkCandidate.rowLabel}].[{selectedLinkCandidate.columnName}]</span>
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-5 py-4">
              {linkByTarget.has(inputListCellKey(linkEditor.targetRowId, linkEditor.targetColumnId)) ? (
                <button
                  type="button"
                  onClick={() => void removeLink()}
                  disabled={bulkSaving}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  <Unlink2 className="h-4 w-4" /> Remove link
                </button>
              ) : <span />}
              <div className="flex gap-2">
                <button type="button" onClick={() => setLinkEditor(null)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
                <button
                  type="button"
                  onClick={() => void confirmLinkEditor()}
                  disabled={!selectedLinkCandidate || bulkSaving}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {bulkSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save location link
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {pendingLinkFill && selectedLocation && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-gray-950/45 p-4" role="dialog" aria-modal="true" aria-labelledby="input-list-fill-title">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-blue-50 p-2 text-blue-600"><Link2 className="h-5 w-5" /></div>
              <div>
                <h2 id="input-list-fill-title" className="text-base font-bold text-gray-900">Fill location-wide links?</h2>
                <p className="mt-1 text-sm leading-relaxed text-gray-600">
                  This will create {pendingLinkFill.changes.length} links from {pendingLinkFill.firstTargetLabel} through {pendingLinkFill.lastTargetLabel} for every workbook using {selectedLocation.name}.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setPendingLinkFill(null)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
              <button
                type="button"
                onClick={() => void confirmLinkFill()}
                disabled={bulkSaving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {bulkSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                Create links
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
