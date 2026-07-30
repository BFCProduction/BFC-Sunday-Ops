import { useEffect, useMemo, useState } from 'react'
import {
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  MapPin,
  TableProperties,
} from 'lucide-react'
import { Card } from '../ui/Card'
import {
  INPUT_LIST_CONNECTION_TYPES,
  inputListColumnIsVisible,
  inputListRowGroupKey,
  loadInputListConfiguration,
  loadWorkbookInputListValues,
  saveWorkbookInputListValue,
} from '../../lib/inputLists'
import type {
  InputListConnectionType,
  InputListRoomRow,
  InputListSection,
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

function valueKey(rowId: string, columnId: string) {
  return `${rowId}:${columnId}`
}

function roomValue(row: InputListRoomRow, columnId: string) {
  return row.room_values.find(value => value.column_id === columnId)?.value ?? ''
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
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [savingKey, setSavingKey] = useState('')
  const [savedKey, setSavedKey] = useState('')
  const [error, setError] = useState('')
  const usedConnectionTypes = useMemo(
    () => INPUT_LIST_CONNECTION_TYPES.filter(option =>
      sections.some(section => section.rows.some(row => row.connection_type === option.key))),
    [sections],
  )

  useEffect(() => {
    if (orderedLocations.some(location => location.id === locationId)) return
    setLocationId(eventLocationIds[0] ?? orderedLocations[0]?.id ?? '')
  }, [eventLocationIds, locationId, orderedLocations])

  useEffect(() => {
    if (!locationId) {
      setSections([])
      setValues({})
      return
    }

    let active = true
    setLoading(true)
    setError('')
    Promise.all([
      loadInputListConfiguration(locationId),
      loadWorkbookInputListValues(workbook.id),
    ])
      .then(([nextSections, nextValues]) => {
        if (!active) return
        setSections(nextSections)
        setValues(Object.fromEntries(nextValues.map(value => [
          valueKey(value.row_id, value.column_id),
          value.value,
        ])))
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
    const key = valueKey(rowId, columnId)
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
              destination, device, and monitor assignments here.
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
                              const key = valueKey(row.id, column.id)
                              const value = column.value_source === 'room'
                                ? roomValue(row, column.id)
                                : values[key] ?? ''
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
                                <td key={column.id} className="border-r border-gray-100 p-1.5 last:border-r-0">
                                  {column.value_source === 'room' || !editable ? (
                                    <span className={`block min-h-8 whitespace-nowrap px-2 py-1.5 text-sm ${value ? 'text-gray-800' : 'text-gray-300'}`}>
                                      {value || '—'}
                                    </span>
                                  ) : (
                                    <div className="relative">
                                      <input
                                        value={value}
                                        onChange={event => setValues(current => ({ ...current, [key]: event.target.value }))}
                                        onBlur={() => void persistValue(row.id, column.id)}
                                        onKeyDown={event => {
                                          if (event.key === 'Enter') event.currentTarget.blur()
                                        }}
                                        className="w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 pr-7 text-sm text-gray-900 outline-none hover:border-gray-200 hover:bg-white/70 focus:border-blue-500 focus:bg-white focus:ring-1 focus:ring-blue-500"
                                      />
                                      {savingKey === key && <Loader2 className="absolute right-2 top-2 h-3.5 w-3.5 animate-spin text-blue-500" />}
                                      {savedKey === key && <Check className="absolute right-2 top-2 h-3.5 w-3.5 text-emerald-600" />}
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
    </div>
  )
}
