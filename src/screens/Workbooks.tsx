import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  AlertTriangle, BookOpen, CalendarDays, Columns3, Filter, History,
  LayoutGrid, Link2, List, MapPin, Pencil, Plus, Printer, Save,
  Trash2, Users, X,
} from 'lucide-react'
import { useAdmin } from '../context/adminState'
import { useSunday } from '../context/SundayContext'
import { fetchAppUsers, fetchPcoPlanTimes, type AppUser, type PcoPlanTimeResult } from '../lib/adminApi'
import { generateWorkbookScheduleHtml, type WorkbookScheduleExportRow } from '../lib/generateWorkbookScheduleHtml'
import { loadAllSessions, supabase } from '../lib/supabase'
import {
  attachEventToWorkbook,
  createScheduleItem,
  createWorkbook,
  deleteScheduleItem,
  detachEventFromWorkbook,
  loadPcoTimeMeta,
  loadWorkbookScheduleItems,
  loadWorkbooks,
  publishWorkbookSchedule,
  updateScheduleItem,
  updateWorkbookEventSchedule,
  upsertPcoTimeMeta,
  type PcoTimeMeta,
  type ScheduleAssignmentInput,
  type ScheduleItemInput,
} from '../lib/workbooks'
import {
  loadLocations,
  loadDepartments,
  loadScheduleItemTypes,
  createScheduleItemType,
} from '../lib/productionConfig'
import { Card } from '../components/ui/Card'
import { SectionLabel } from '../components/ui/SectionLabel'
import { ScheduleTimeGrid, type TimeGridColumn, type TimeGridItem } from '../components/workbook/ScheduleTimeGrid'
import type {
  Department,
  Location,
  ScheduleItemType,
  Session,
  Workbook,
  WorkbookScheduleItem,
} from '../types'

type Screen = 'home' | 'dashboard' | 'checklist' | 'issues' | 'data' | 'evaluation' | 'analytics' | 'settings' | 'docs' | 'workbooks'

interface Props {
  allSessions: Session[]
  onSessionsChange: (sessions: Session[]) => void
  setScreen: (screen: Screen) => void
}

interface DisplayRow extends WorkbookScheduleExportRow {
  eventId: string | null
  locationId: string | null
  departments: string[]
  pcoTimeId: string | null
  item: WorkbookScheduleItem | null
}

interface AssignmentDraft {
  personName: string
  role: string
  department: string
}

const FIELD_CLASS = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500'

/** Day-N label: Day 1 = the workbook's earliest event date; the day before is Day 0, then Day -1. */
function daysBetween(from: string, to: string) {
  const a = new Date(`${from}T12:00:00`).getTime()
  const b = new Date(`${to}T12:00:00`).getTime()
  return Math.round((b - a) / 86400000)
}
function dayLabel(date: string, anchor: string | null) {
  if (!anchor) return null
  return daysBetween(anchor, date) + 1
}

function formatDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function formatLongDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatTime(time: string | null) {
  if (!time) return 'Time TBD'
  const [hour, minute] = time.slice(0, 5).split(':').map(Number)
  const d = new Date()
  d.setHours(hour, minute, 0, 0)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function timeRange(start: string | null, end: string | null) {
  if (!start) return 'Time TBD'
  return end ? `${formatTime(start)} - ${formatTime(end)}` : formatTime(start)
}

function toMinutes(time: string | null): number | null {
  if (!time) return null
  const [hour, minute] = time.slice(0, 5).split(':').map(Number)
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null
  return hour * 60 + minute
}

/** Local "HH:MM:SS" for an ISO timestamp in the given IANA timezone. */
function localTimeOfDay(iso: string, tz: string): string | null {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return null
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date(ms))
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? '00'
  const hour = get('hour') === '24' ? '00' : get('hour')
  return `${hour}:${get('minute')}:${get('second')}`
}

/** Map a schedule row onto a time-grid item for the room or department axis. */
function rowToGridItem(row: DisplayRow, axis: 'rooms' | 'departments'): TimeGridItem | null {
  const start = toMinutes(row.startTime)
  if (start === null) return null
  const endRaw = toMinutes(row.endTime)
  const end = endRaw !== null && endRaw > start ? endRaw : start + 30
  const columnKeys = axis === 'rooms'
    ? [row.locationId ?? '__noloc__']
    : (row.departments.length > 0 ? row.departments : ['__general__'])
  return {
    id: row.id,
    start,
    end,
    title: row.title,
    timeLabel: timeRange(row.startTime, row.endTime),
    kind: row.kind,
    columnKeys,
  }
}

function rangeLabel(workbook: Workbook) {
  if (workbook.start_date === workbook.end_date) return formatLongDate(workbook.start_date)
  return `${formatLongDate(workbook.start_date)} - ${formatLongDate(workbook.end_date)}`
}

function stringList(value: string) {
  return value.split(',').map(item => item.trim()).filter(Boolean)
}

function assignmentsForDisplay(item: WorkbookScheduleItem) {
  return item.assignments.map(assignment => {
    const person = assignment.is_open ? 'TBD' : assignment.person_name
    return [assignment.role, person].filter(Boolean).join(' | ') || 'TBD'
  })
}

function CreateWorkbookModal({
  onCreate,
  onClose,
}: {
  onCreate: (workbook: Workbook) => void
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [venue, setVenue] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim() || !startDate || !endDate) {
      setError('Name and date range are required.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const workbook = await createWorkbook({
        name: name.trim(),
        startDate,
        endDate,
        venue: venue.trim() || null,
        description: description.trim() || null,
      })
      onCreate(workbook)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create workbook.')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
      <form onSubmit={submit} className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-bold text-gray-900">New Workbook</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Name</label>
            <input className={FIELD_CLASS} value={name} onChange={event => setName(event.target.value)} placeholder="District Assembly 2026" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Start Date</label>
              <input className={FIELD_CLASS} type="date" value={startDate} onChange={event => setStartDate(event.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">End Date</label>
              <input className={FIELD_CLASS} type="date" value={endDate} onChange={event => setEndDate(event.target.value)} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Venue</label>
            <input className={FIELD_CLASS} value={venue} onChange={event => setVenue(event.target.value)} placeholder="BFC Campus" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Description</label>
            <textarea className={`${FIELD_CLASS} min-h-20`} value={description} onChange={event => setDescription(event.target.value)} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Creating...' : 'Create Workbook'}
          </button>
        </div>
      </form>
    </div>
  )
}

function ScheduleItemEditor({
  workbook,
  locations,
  departmentOptions,
  scheduleTypes,
  onCreateType,
  linkedEvents,
  users,
  existing,
  onSaved,
  onCancel,
}: {
  workbook: Workbook
  locations: Location[]
  departmentOptions: Department[]
  scheduleTypes: ScheduleItemType[]
  onCreateType: (label: string) => Promise<ScheduleItemType>
  linkedEvents: Session[]
  users: AppUser[]
  existing: WorkbookScheduleItem | null
  onSaved: () => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(existing?.title ?? '')
  const [date, setDate] = useState(existing?.scheduled_date ?? workbook.start_date)
  const [startTime, setStartTime] = useState(existing?.start_time.slice(0, 5) ?? '')
  const [endTime, setEndTime] = useState(existing?.end_time?.slice(0, 5) ?? '')
  const [locationId, setLocationId] = useState(existing?.location_id ?? '')
  const [eventId, setEventId] = useState(existing?.event_id ?? '')
  const [itemType, setItemType] = useState<string>(existing?.item_type ?? 'task')
  const [addingType, setAddingType] = useState(false)
  const [newTypeLabel, setNewTypeLabel] = useState('')
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>(existing?.departments ?? [])
  const [tags, setTags] = useState((existing?.tags ?? []).join(', '))
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [assignments, setAssignments] = useState<AssignmentDraft[]>(
    existing?.assignments.map(assignment => ({
      personName: assignment.is_open ? 'TBD' : (assignment.person_name ?? ''),
      role: assignment.role ?? '',
      department: assignment.department ?? '',
    })) ?? [],
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function updateAssignment(index: number, key: keyof AssignmentDraft, value: string) {
    setAssignments(current => current.map((assignment, assignmentIndex) =>
      assignmentIndex === index ? { ...assignment, [key]: value } : assignment
    ))
  }

  async function handleAddType() {
    const label = newTypeLabel.trim()
    if (!label) return
    try {
      const created = await onCreateType(label)
      setItemType(created.key)
      setAddingType(false)
      setNewTypeLabel('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add type.')
    }
  }

  function toggleDepartment(name: string) {
    setSelectedDepartments(current =>
      current.includes(name) ? current.filter(entry => entry !== name) : [...current, name])
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!title.trim() || !date || !startTime) {
      setError('Title, date, and start time are required.')
      return
    }

    const normalizedAssignments: ScheduleAssignmentInput[] = assignments
      .filter(assignment => assignment.personName.trim() || assignment.role.trim() || assignment.department.trim())
      .map(assignment => {
        const name = assignment.personName.trim()
        const isOpen = name.toLowerCase() === 'tbd' || !name
        const user = users.find(candidate => candidate.name.toLowerCase() === name.toLowerCase())
        return {
          userId: isOpen ? null : (user?.id ?? null),
          personName: isOpen ? null : name,
          role: assignment.role.trim() || null,
          department: assignment.department.trim() || null,
          isOpen,
        }
      })

    const input: ScheduleItemInput = {
      workbookId: workbook.id,
      eventId: eventId || null,
      locationId: locationId || null,
      title: title.trim(),
      itemType,
      scheduledDate: date,
      startTime,
      endTime: endTime || null,
      notes: notes.trim() || null,
      departments: selectedDepartments,
      tags: stringList(tags),
      assignments: normalizedAssignments,
    }

    setSaving(true)
    setError('')
    try {
      if (existing) {
        await updateScheduleItem(existing.id, input)
      } else {
        await createScheduleItem(input)
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save schedule item.')
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-blue-100 bg-blue-50/30 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-bold text-gray-900">{existing ? 'Edit Schedule Item' : 'Add Schedule Item'}</p>
        <button type="button" onClick={onCancel} className="rounded p-1 text-gray-400 hover:bg-white hover:text-gray-600">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid gap-3 lg:grid-cols-[112px_112px_minmax(190px,1fr)_170px_170px]">
        <input className={FIELD_CLASS} type="date" value={date} onChange={event => setDate(event.target.value)} aria-label="Date" />
        <div className="flex gap-1">
          <input className={FIELD_CLASS} type="time" value={startTime} onChange={event => setStartTime(event.target.value)} aria-label="Start time" />
        </div>
        <input className={FIELD_CLASS} value={title} onChange={event => setTitle(event.target.value)} placeholder="Activity title" />
        <select aria-label="Location" className={FIELD_CLASS} value={locationId} onChange={event => setLocationId(event.target.value)}>
          <option value="">No location</option>
          {locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
        </select>
        <select aria-label="Belongs to" className={FIELD_CLASS} value={eventId} onChange={event => setEventId(event.target.value)}>
          <option value="">Whole production</option>
          {linkedEvents.map(linkedEvent => <option key={linkedEvent.id} value={linkedEvent.id}>{linkedEvent.name}</option>)}
        </select>
      </div>
      <p className="mt-2 text-[11px] text-gray-400">
        <span className="font-semibold text-gray-500">Belongs to:</span> leave as <span className="font-medium">Whole production</span> for load-in, meals, and general crew calls; pick a specific event for that event&apos;s calls, rehearsals, and soundchecks.
      </p>
      <div className="mt-3 grid gap-3 lg:grid-cols-4">
        <div>
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gray-500">End Time</label>
          <input className={FIELD_CLASS} type="time" value={endTime} onChange={event => setEndTime(event.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gray-500">Type</label>
          {addingType ? (
            <div className="flex gap-1">
              <input
                autoFocus
                className={FIELD_CLASS}
                value={newTypeLabel}
                onChange={event => setNewTypeLabel(event.target.value)}
                onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void handleAddType() } }}
                placeholder="New type name"
              />
              <button type="button" onClick={() => void handleAddType()} className="rounded-lg bg-blue-600 px-2 text-white hover:bg-blue-700" aria-label="Save type"><Save className="h-4 w-4" /></button>
              <button type="button" onClick={() => { setAddingType(false); setNewTypeLabel('') }} className="rounded-lg px-1 text-gray-400 hover:bg-gray-100" aria-label="Cancel"><X className="h-4 w-4" /></button>
            </div>
          ) : (
            <select
              className={FIELD_CLASS}
              value={itemType}
              onChange={event => { if (event.target.value === '__add__') { setAddingType(true) } else { setItemType(event.target.value) } }}
            >
              {scheduleTypes.map(type => <option key={type.id} value={type.key}>{type.label}</option>)}
              <option value="__add__">+ Add new type…</option>
            </select>
          )}
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gray-500">Departments</label>
          {departmentOptions.length === 0 ? (
            <p className="text-[11px] text-gray-400 pt-1.5">Add departments in Settings → Production Config.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {departmentOptions.map(department => {
                const on = selectedDepartments.includes(department.name)
                return (
                  <button
                    type="button"
                    key={department.id}
                    onClick={() => toggleDepartment(department.name)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium ${on ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'}`}
                  >
                    {department.name}
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gray-500">Tags</label>
          <input className={FIELD_CLASS} value={tags} onChange={event => setTags(event.target.value)} placeholder="Call Time, Rigging" />
        </div>
      </div>
      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Assignments</p>
          <button
            type="button"
            onClick={() => setAssignments(current => [...current, { personName: '', role: '', department: '' }])}
            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-800"
          >
            <Plus className="h-3.5 w-3.5" /> Add assignment
          </button>
        </div>
        <datalist id="workbook-person-options">
          {users.map(user => <option key={user.id} value={user.name} />)}
          <option value="TBD" />
        </datalist>
        {assignments.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-200 bg-white px-3 py-2 text-xs text-gray-400">
            Attach named PCO users, manually entered guests, or open roles marked TBD.
          </p>
        ) : (
          <div className="space-y-2">
            {assignments.map((assignment, index) => (
              <div key={index} className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto]">
                <input list="workbook-person-options" className={FIELD_CLASS} value={assignment.personName} onChange={event => updateAssignment(index, 'personName', event.target.value)} placeholder="Person or TBD" />
                <input className={FIELD_CLASS} value={assignment.role} onChange={event => updateAssignment(index, 'role', event.target.value)} placeholder="Role, e.g. A1" />
                <input className={FIELD_CLASS} value={assignment.department} onChange={event => updateAssignment(index, 'department', event.target.value)} placeholder="Department" />
                <button type="button" onClick={() => setAssignments(current => current.filter((_, assignmentIndex) => assignmentIndex !== index))} className="rounded-lg px-2 text-gray-400 hover:bg-red-50 hover:text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="mt-3">
        <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gray-500">Notes</label>
        <textarea className={`${FIELD_CLASS} min-h-16`} value={notes} onChange={event => setNotes(event.target.value)} />
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">
          Cancel
        </button>
        <button disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
          <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save Item'}
        </button>
      </div>
    </form>
  )
}

function PcoTimeMetaModal({
  row,
  workbookId,
  locations,
  departmentOptions,
  onSaved,
  onClose,
}: {
  row: DisplayRow
  workbookId: string
  locations: Location[]
  departmentOptions: Department[]
  onSaved: () => Promise<void>
  onClose: () => void
}) {
  const [locationId, setLocationId] = useState(row.locationId ?? '')
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>(row.departments)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!row.eventId || !row.pcoTimeId) return
    setSaving(true)
    setError('')
    try {
      await upsertPcoTimeMeta({
        workbookId,
        eventId: row.eventId,
        pcoTimeId: row.pcoTimeId,
        locationId: locationId || null,
        departments: selectedDepartments,
      })
      await onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save.')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-gray-900">Assign room &amp; departments</h2>
            <p className="mt-0.5 text-xs text-gray-500">{row.title} · {timeRange(row.startTime, row.endTime)}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
            This time comes from Planning Center and stays read-only. You&apos;re only setting where it happens and which departments own it in this workbook.
          </p>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Room</label>
            <select className={FIELD_CLASS} value={locationId} onChange={event => setLocationId(event.target.value)}>
              <option value="">No room</option>
              {locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Departments</label>
            {departmentOptions.length === 0 ? (
              <p className="text-xs text-gray-400">Add departments in Settings → Production Config.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {departmentOptions.map(department => {
                  const on = selectedDepartments.includes(department.name)
                  return (
                    <button
                      type="button"
                      key={department.id}
                      onClick={() => setSelectedDepartments(current => on ? current.filter(name => name !== department.name) : [...current, department.name])}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${on ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'}`}
                    >
                      {department.name}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ScheduleRow({
  row,
  locationName,
  onOpenEvent,
  onEdit,
  onDelete,
  onAssignPco,
  editable,
}: {
  row: DisplayRow
  locationName: string | null
  onOpenEvent: (eventId: string) => void
  onEdit: (item: WorkbookScheduleItem) => void
  onDelete: (itemId: string) => void
  onAssignPco: (row: DisplayRow) => void
  editable: boolean
}) {
  return (
    <div className={`grid gap-3 border-b border-gray-100 px-4 py-3 last:border-0 md:grid-cols-[152px_minmax(220px,1fr)_190px_auto] ${row.kind === 'event' ? 'bg-blue-50/35' : 'bg-white'}`}>
      <p className="text-sm font-semibold text-gray-700">{timeRange(row.startTime, row.endTime)}</p>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className={`text-sm font-bold ${row.kind === 'event' ? 'text-blue-800' : 'text-gray-950'}`}>{row.title}</p>
          {row.kind === 'event' && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700">Event</span>}
        </div>
        <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-500">
          {locationName && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{locationName}</span>}
          {row.departments.map(department => <span key={department} className="rounded-full bg-teal-50 px-2 py-0.5 text-teal-700">{department}</span>)}
          {row.pcoTimeId && !locationName && row.departments.length === 0 && (
            <span className="italic text-gray-400">No room or department assigned</span>
          )}
          {row.relatedEvent && row.kind !== 'event' && <span className="rounded-full bg-gray-100 px-2 py-0.5">{row.relatedEvent}</span>}
        </div>
        {row.assignments.length > 0 && (
          <p className="mt-2 text-xs leading-5 text-gray-600">{row.assignments.join('  |  ')}</p>
        )}
      </div>
      <p className="text-sm text-gray-500">{row.notes || ''}</p>
      <div className="flex items-start justify-end gap-1">
        {editable && row.pcoTimeId && (
          <button onClick={() => onAssignPco(row)} title="Assign room & departments"
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-teal-700 hover:bg-teal-50">
            <MapPin className="h-3.5 w-3.5" /> Assign
          </button>
        )}
        {row.kind === 'event' && row.eventId && !row.pcoTimeId && (
          <button onClick={() => onOpenEvent(row.eventId!)} className="rounded-lg px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100">
            Open
          </button>
        )}
        {editable && row.item && (
          <>
            <button onClick={() => onEdit(row.item!)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
              <Pencil className="h-4 w-4" />
            </button>
            <button onClick={() => onDelete(row.item!.id)} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600">
              <Trash2 className="h-4 w-4" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function EventSetupRow({
  event,
  locations,
  onSave,
  onOpen,
  onDetach,
}: {
  event: Session
  locations: Location[]
  onSave: (eventId: string, endTime: string | null, locationId: string | null) => Promise<void>
  onOpen: (eventId: string) => void
  onDetach: (eventId: string) => Promise<void>
}) {
  const [endTime, setEndTime] = useState(event.eventEndTime?.slice(0, 5) ?? '')
  const [locationId, setLocationId] = useState(event.workbookLocationId ?? '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    await onSave(event.id, endTime || null, locationId || null)
    setSaving(false)
  }

  return (
    <Card className="p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-gray-950">{event.name}</p>
          <p className="mt-1 text-xs text-gray-500">{formatDate(event.date)} | Starts {formatTime(event.eventTime)}</p>
        </div>
        <select value={locationId} onChange={changeEvent => setLocationId(changeEvent.target.value)} className={`${FIELD_CLASS} lg:w-48`}>
          <option value="">Primary location</option>
          {locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
        </select>
        <input type="time" value={endTime} onChange={changeEvent => setEndTime(changeEvent.target.value)} className={`${FIELD_CLASS} lg:w-32`} aria-label="Event end time" />
        <button onClick={save} disabled={saving} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button onClick={() => onOpen(event.id)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
          Open
        </button>
        <button onClick={() => void onDetach(event.id)} className="rounded-lg px-2 py-2 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Remove from workbook">
          <X className="h-4 w-4" />
        </button>
      </div>
    </Card>
  )
}

export function Workbooks({ allSessions, onSessionsChange, setScreen }: Props) {
  const { isAdmin, sessionToken, user } = useAdmin()
  const { navigateToEvent, timezone } = useSunday()
  const [workbooks, setWorkbooks] = useState<Workbook[]>([])
  const [activeWorkbookId, setActiveWorkbookId] = useState('')
  const [locations, setLocations] = useState<Location[]>([])
  const [departmentOptions, setDepartmentOptions] = useState<Department[]>([])
  const [scheduleTypes, setScheduleTypes] = useState<ScheduleItemType[]>([])
  const [items, setItems] = useState<WorkbookScheduleItem[]>([])
  const [pcoTimesByEvent, setPcoTimesByEvent] = useState<Record<string, PcoPlanTimeResult[]>>({})
  const [pcoMeta, setPcoMeta] = useState<Record<string, PcoTimeMeta>>({})
  const [assigningPcoRow, setAssigningPcoRow] = useState<DisplayRow | null>(null)
  const [users, setUsers] = useState<AppUser[]>([])
  const [tab, setTab] = useState<'schedule' | 'events'>('schedule')
  const [view, setView] = useState<'detail' | 'rooms' | 'departments' | 'mine'>(isAdmin ? 'detail' : 'mine')
  const [loading, setLoading] = useState(true)
  const [workspaceLoading, setWorkspaceLoading] = useState(false)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showEditor, setShowEditor] = useState(false)
  const [editingItem, setEditingItem] = useState<WorkbookScheduleItem | null>(null)
  const [selectedEventToAttach, setSelectedEventToAttach] = useState('')
  const [dayFilter, setDayFilter] = useState('all')
  const [locationFilter, setLocationFilter] = useState('all')
  const [eventFilter, setEventFilter] = useState('all')
  const [departmentFilter, setDepartmentFilter] = useState('all')
  const [personFilter, setPersonFilter] = useState('all')
  const [publishing, setPublishing] = useState(false)

  const activeWorkbook = workbooks.find(workbook => workbook.id === activeWorkbookId) ?? null
  const linkedEvents = allSessions.filter(session => session.workbookId === activeWorkbookId)

  useEffect(() => {
    loadWorkbooks()
      .then(data => {
        setWorkbooks(data)
        setActiveWorkbookId(previous => previous || data[0]?.id || '')
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Unable to load workbooks.'))
      .finally(() => setLoading(false))
  }, [])

  // Account-level reference data (Production Config), shared across all workbooks.
  useEffect(() => {
    Promise.all([loadLocations(), loadDepartments(), loadScheduleItemTypes()])
      .then(([loc, dep, typ]) => {
        setLocations(loc)
        setDepartmentOptions(dep)
        setScheduleTypes(typ)
      })
      .catch(() => { /* reference data is optional to first paint */ })
  }, [])

  const reloadScheduleTypes = useCallback(async () => {
    setScheduleTypes(await loadScheduleItemTypes())
  }, [])

  async function handleCreateType(label: string): Promise<ScheduleItemType> {
    const created = await createScheduleItemType(label, scheduleTypes.length)
    await reloadScheduleTypes()
    return created
  }

  useEffect(() => {
    if (!isAdmin || !sessionToken) return
    fetchAppUsers(sessionToken)
      .then(setUsers)
      .catch(() => setUsers([]))
  }, [isAdmin, sessionToken])

  // Pull each linked event's PCO plan times (service, rehearsal, etc.) as
  // read-only, always-fresh rows — the scheduled blocks, not the run-of-show.
  const linkedEventIdsKey = linkedEvents.map(event => event.id).join(',')
  useEffect(() => {
    if (!sessionToken || linkedEvents.length === 0) {
      setPcoTimesByEvent({})
      return
    }
    let active = true
    void (async () => {
      const entries = await Promise.all(linkedEvents.map(async event => {
        try {
          return [event.id, await fetchPcoPlanTimes(sessionToken, event.id)] as const
        } catch {
          return [event.id, [] as PcoPlanTimeResult[]] as const
        }
      }))
      if (active) setPcoTimesByEvent(Object.fromEntries(entries))
    })()
    return () => { active = false }
    // linkedEvents captured via linkedEventIdsKey to avoid refetch loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedEventIdsKey, sessionToken])

  const refreshPcoMeta = useCallback(async () => {
    const ids = linkedEvents.map(event => event.id)
    setPcoMeta(ids.length ? await loadPcoTimeMeta(ids) : {})
    // linkedEvents captured via linkedEventIdsKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedEventIdsKey])

  useEffect(() => { void refreshPcoMeta() }, [refreshPcoMeta])

  const refreshWorkspace = useCallback(async () => {
    if (!activeWorkbookId) return
    setWorkspaceLoading(true)
    try {
      setItems(await loadWorkbookScheduleItems(activeWorkbookId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load workbook schedule.')
    } finally {
      setWorkspaceLoading(false)
    }
  }, [activeWorkbookId])

  useEffect(() => {
    if (!activeWorkbookId) {
      setItems([])
      return
    }
    void refreshWorkspace()

    const channel = supabase
      .channel(`workbook-schedule-${activeWorkbookId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'workbook_schedule_items', filter: `workbook_id=eq.${activeWorkbookId}` },
        () => { void refreshWorkspace() },
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'workbook_schedule_assignments' },
        () => { void refreshWorkspace() },
      )
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [activeWorkbookId, refreshWorkspace])

  const locationMap = useMemo(
    () => Object.fromEntries(locations.map(location => [location.id, location.name])),
    [locations],
  )

  const rows = useMemo<DisplayRow[]>(() => {
    // PCO plan times → read-only rows (the scheduled service/rehearsal blocks,
    // converted to church-local time). Not the run-of-show items.
    const pcoRows = linkedEvents.flatMap(event => {
      const planTimes = pcoTimesByEvent[event.id] ?? []
      return planTimes.flatMap(planTime => {
        const startTime = localTimeOfDay(planTime.starts_at, timezone)
        if (!startTime) return []
        const endTime = planTime.ends_at ? localTimeOfDay(planTime.ends_at, timezone) : null
        const title = planTime.name?.trim()
          ? planTime.name.trim()
          : planTime.time_type === 'service' ? event.name
          : planTime.time_type === 'rehearsal' ? 'Rehearsal'
          : 'Scheduled time'
        const meta = pcoMeta[`${event.id}:${planTime.id}`]
        const locationId = meta?.location_id ?? event.workbookLocationId
        return [{
          id: `pco-${event.id}-${planTime.id}`,
          kind: 'event' as const,
          date: event.date,
          startTime,
          endTime,
          title,
          location: locationId ? locationMap[locationId] ?? null : null,
          relatedEvent: event.name,
          assignments: [],
          notes: null,
          eventId: event.id,
          locationId,
          departments: meta?.departments ?? [],
          pcoTimeId: planTime.id,
          item: null,
        }]
      })
    })
    const eventsWithPco = new Set(pcoRows.map(row => row.eventId))

    // Events without granular PCO items keep their single principal time block.
    const eventRows = linkedEvents
      .filter(event => !eventsWithPco.has(event.id))
      .map(event => ({
        id: `event-${event.id}`,
        kind: 'event' as const,
        date: event.date,
        startTime: event.eventTime,
        endTime: event.eventEndTime,
        title: event.name,
        location: event.workbookLocationId ? locationMap[event.workbookLocationId] ?? null : null,
        relatedEvent: null,
        assignments: [],
        notes: null,
        eventId: event.id,
        locationId: event.workbookLocationId,
        departments: [],
        pcoTimeId: null,
        item: null,
      }))
    const itemRows = items.map(item => {
      const linkedEvent = linkedEvents.find(event => event.id === item.event_id)
      return {
        id: item.id,
        kind: 'item' as const,
        date: item.scheduled_date,
        startTime: item.start_time,
        endTime: item.end_time,
        title: item.title,
        location: item.location_id ? locationMap[item.location_id] ?? null : null,
        relatedEvent: linkedEvent?.name ?? null,
        assignments: assignmentsForDisplay(item),
        notes: item.notes,
        eventId: item.event_id,
        locationId: item.location_id,
        departments: item.departments,
        pcoTimeId: null,
        item,
      }
    })
    return [...eventRows, ...pcoRows, ...itemRows].sort((a, b) =>
      a.date.localeCompare(b.date)
      || (a.startTime ?? '23:59:59').localeCompare(b.startTime ?? '23:59:59')
      || (a.kind === 'event' ? -1 : 1)
      || a.title.localeCompare(b.title)
    )
  }, [items, linkedEvents, locationMap, pcoTimesByEvent, pcoMeta, timezone])

  const days = [...new Set(rows.map(row => row.date))]
  const departments = [...new Set([
    ...rows.flatMap(row => row.departments),
    ...items.flatMap(item => item.assignments.map(assignment => assignment.department).filter((value): value is string => Boolean(value))),
  ])].sort()
  const people = [...new Set(items.flatMap(item => item.assignments
    .filter(assignment => !assignment.is_open && assignment.person_name)
    .map(assignment => assignment.person_name as string)))].sort()

  // Day 1 = the workbook's earliest event date (fallback: earliest scheduled row).
  const anchorDate = useMemo(() => {
    const eventDates = linkedEvents.map(event => event.date).filter(Boolean)
    const pool = eventDates.length ? eventDates : rows.map(row => row.date)
    return pool.length ? pool.reduce((min, date) => (date < min ? date : min)) : null
  }, [linkedEvents, rows])

  const usedLocationIds = useMemo(
    () => new Set(rows.map(row => row.locationId).filter((id): id is string => Boolean(id))),
    [rows],
  )

  const filteredRows = rows.filter(row => {
    const item = row.item
    const selectedPerson = view === 'mine' ? (user?.name ?? '') : personFilter
    if (dayFilter !== 'all' && row.date !== dayFilter) return false
    if (locationFilter !== 'all' && row.locationId !== locationFilter) return false
    if (eventFilter !== 'all' && row.eventId !== eventFilter) return false
    if (departmentFilter !== 'all' && (!item || ![
      ...item.departments,
      ...item.assignments.map(assignment => assignment.department ?? ''),
    ].includes(departmentFilter))) return false
    if (view === 'mine' && (!selectedPerson || !item || !item.assignments.some(assignment => assignment.person_name === selectedPerson))) return false
    if (view !== 'mine' && personFilter !== 'all' && (!item || !item.assignments.some(assignment => assignment.person_name === personFilter))) return false
    return true
  })

  const groupedRows = filteredRows.reduce<Array<[string, DisplayRow[]]>>((groups, row) => {
    const current = groups[groups.length - 1]
    if (current?.[0] === row.date) {
      current[1].push(row)
    } else {
      groups.push([row.date, [row]])
    }
    return groups
  }, [])

  async function reloadEvents() {
    const freshSessions = await loadAllSessions()
    onSessionsChange(freshSessions)
  }

  function openEvent(eventId: string) {
    navigateToEvent(eventId)
    setScreen('dashboard')
  }

  async function attachEvent() {
    if (!activeWorkbook || !selectedEventToAttach) return
    await attachEventToWorkbook(selectedEventToAttach, activeWorkbook.id)
    setSelectedEventToAttach('')
    await reloadEvents()
  }

  async function saveEventSchedule(eventId: string, endTime: string | null, locationId: string | null) {
    await updateWorkbookEventSchedule(eventId, endTime, locationId)
    await reloadEvents()
  }

  async function detachEvent(eventId: string) {
    await detachEventFromWorkbook(eventId)
    await reloadEvents()
  }

  async function removeItem(itemId: string) {
    await deleteScheduleItem(itemId)
    await refreshWorkspace()
  }

  async function publishSchedule() {
    if (!activeWorkbook) return
    setPublishing(true)
    try {
      const publishedWorkbook = await publishWorkbookSchedule(activeWorkbook, {
        workbook: activeWorkbook,
        locations,
        events: linkedEvents,
        scheduleItems: items,
      }, user?.id ?? null)
      setWorkbooks(current => current.map(workbook => workbook.id === publishedWorkbook.id ? publishedWorkbook : workbook))
    } finally {
      setPublishing(false)
    }
  }

  function exportSchedule() {
    if (!activeWorkbook) return
    const html = generateWorkbookScheduleHtml(activeWorkbook, rows)
    const win = window.open('', '_blank')
    if (!win) return
    win.document.open()
    win.document.write(html)
    win.document.close()
    setTimeout(() => win.print(), 500)
  }

  const unassignedEvents = allSessions.filter(session => !session.workbookId)

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><div className="h-7 w-7 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" /></div>
  }

  return (
    <div className="fade-in min-h-full bg-gray-50">
      <div className="border-b border-gray-200 bg-white px-4 py-5 md:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1 text-xs font-bold uppercase tracking-widest text-teal-700">
              <BookOpen className="h-3.5 w-3.5" /> Workbooks
            </div>
            <h1 className="mt-3 text-3xl font-bold text-gray-950">Production Workbooks</h1>
            <p className="mt-1 text-sm text-gray-500">Build one detailed schedule for a multi-event production, then view it by room or assignment.</p>
          </div>
          {isAdmin && (
            <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 rounded-lg bg-gray-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800">
              <Plus className="h-4 w-4" /> New Workbook
            </button>
          )}
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-5 p-4 md:p-6 lg:grid-cols-[265px_minmax(0,1fr)]">
        <aside className="space-y-2">
          <SectionLabel>All Workbooks</SectionLabel>
          {workbooks.length === 0 ? (
            <Card className="p-4 text-sm text-gray-500">No workbooks have been created yet.</Card>
          ) : workbooks.map(workbook => (
            <button
              key={workbook.id}
              onClick={() => setActiveWorkbookId(workbook.id)}
              className={`w-full rounded-xl border p-4 text-left transition-colors ${
                workbook.id === activeWorkbookId ? 'border-blue-300 bg-blue-50 shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <p className="truncate text-sm font-bold text-gray-950">{workbook.name}</p>
              <p className="mt-1 text-xs text-gray-500">{formatDate(workbook.start_date)} - {formatDate(workbook.end_date)}</p>
              <p className="mt-3 inline-flex rounded-full bg-gray-100 px-2 py-1 text-[10px] font-bold uppercase text-gray-600">
                {workbook.status === 'published' ? `Published v${workbook.published_version}` : workbook.status}
              </p>
            </button>
          ))}
        </aside>

        {!activeWorkbook ? (
          <Card className="flex min-h-64 items-center justify-center p-8 text-center text-gray-500">
            Create a workbook to begin building a large-event schedule.
          </Card>
        ) : (
          <section className="min-w-0 space-y-4">
            <Card className="overflow-hidden">
              <div className="flex flex-col gap-4 border-b border-gray-100 p-5 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-950">{activeWorkbook.name}</h2>
                  <p className="mt-1 text-sm text-gray-500">{rangeLabel(activeWorkbook)}{activeWorkbook.venue ? ` | ${activeWorkbook.venue}` : ''}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{linkedEvents.length} event{linkedEvents.length === 1 ? '' : 's'}</span>
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">{usedLocationIds.size} room{usedLocationIds.size === 1 ? '' : 's'}</span>
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">{items.length} schedule item{items.length === 1 ? '' : 's'}</span>
                    {activeWorkbook.published_version > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                        <History className="h-3 w-3" /> Published v{activeWorkbook.published_version}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={exportSchedule} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                    <Printer className="h-4 w-4" /> Export PDF
                  </button>
                  {isAdmin && (
                    <button onClick={() => void publishSchedule()} disabled={publishing} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                      <History className="h-4 w-4" /> {publishing ? 'Publishing...' : 'Publish Version'}
                    </button>
                  )}
                </div>
              </div>
              <div className="flex gap-1 px-5 pt-3">
                {([
                  ['schedule', 'Schedule', CalendarDays],
                  ['events', 'Events', Link2],
                ] as const).map(([id, label, Icon]) => (
                  <button key={id} onClick={() => setTab(id)} className={`inline-flex items-center gap-2 rounded-t-lg px-4 py-2 text-sm font-semibold ${tab === id ? 'bg-gray-100 text-gray-950' : 'text-gray-500 hover:text-gray-700'}`}>
                    <Icon className="h-4 w-4" /> {label}
                  </button>
                ))}
              </div>
            </Card>

            {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

            {tab === 'schedule' && (
              <>
                <Card className="p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      <button onClick={() => setView('detail')} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold ${view === 'detail' ? 'bg-gray-950 text-white' : 'bg-gray-100 text-gray-600'}`}>
                        <List className="h-4 w-4" /> Detail Schedule
                      </button>
                      <button onClick={() => setView('rooms')} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold ${view === 'rooms' ? 'bg-gray-950 text-white' : 'bg-gray-100 text-gray-600'}`}>
                        <LayoutGrid className="h-4 w-4" /> By Room
                      </button>
                      <button onClick={() => setView('departments')} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold ${view === 'departments' ? 'bg-gray-950 text-white' : 'bg-gray-100 text-gray-600'}`}>
                        <Columns3 className="h-4 w-4" /> By Department
                      </button>
                      <button onClick={() => setView('mine')} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold ${view === 'mine' ? 'bg-gray-950 text-white' : 'bg-gray-100 text-gray-600'}`}>
                        <Users className="h-4 w-4" /> My Schedule
                      </button>
                    </div>
                    {isAdmin && (
                      <button onClick={() => { setEditingItem(null); setShowEditor(true) }} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                        <Plus className="h-4 w-4" /> Add Schedule Item
                      </button>
                    )}
                  </div>
                  <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-gray-100 pt-4">
                    <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-400">
                      <Filter className="h-3.5 w-3.5" /> Filter
                    </div>
                    <select value={dayFilter} onChange={event => setDayFilter(event.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
                      <option value="all">All days</option>
                      {days.map(day => <option key={day} value={day}>{formatDate(day)}</option>)}
                    </select>
                    <select value={locationFilter} onChange={event => setLocationFilter(event.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
                      <option value="all">All rooms</option>
                      {locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
                    </select>
                    <select value={eventFilter} onChange={event => setEventFilter(event.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
                      <option value="all">All events</option>
                      {linkedEvents.map(linkedEvent => <option key={linkedEvent.id} value={linkedEvent.id}>{linkedEvent.name}</option>)}
                    </select>
                    <select value={departmentFilter} onChange={event => setDepartmentFilter(event.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
                      <option value="all">All departments</option>
                      {departments.map(department => <option key={department} value={department}>{department}</option>)}
                    </select>
                    <select value={personFilter} onChange={event => setPersonFilter(event.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
                      <option value="all">All people</option>
                      {people.map(person => <option key={person} value={person}>{person}</option>)}
                    </select>
                  </div>
                </Card>

                {showEditor && (
                  <ScheduleItemEditor
                    key={editingItem?.id ?? 'new'}
                    workbook={activeWorkbook}
                    locations={locations}
                    departmentOptions={departmentOptions}
                    scheduleTypes={scheduleTypes}
                    onCreateType={handleCreateType}
                    linkedEvents={linkedEvents}
                    users={users}
                    existing={editingItem}
                    onSaved={() => {
                      setShowEditor(false)
                      setEditingItem(null)
                      void refreshWorkspace()
                    }}
                    onCancel={() => {
                      setShowEditor(false)
                      setEditingItem(null)
                    }}
                  />
                )}

                {workspaceLoading ? (
                  <Card className="flex h-40 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" /></Card>
                ) : view === 'detail' || view === 'mine' ? (
                  <Card className="overflow-hidden">
                    {view === 'mine' && (
                      <div className="border-b border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                        Showing assignments for <span className="font-bold">{user?.name ?? 'your account'}</span>. Choose Detail Schedule to see the full production plan.
                      </div>
                    )}
                    {groupedRows.length === 0 ? (
                      <p className="p-8 text-center text-sm text-gray-400">No schedule items match these filters.</p>
                    ) : groupedRows.map(([date, dayRows]) => (
                      <div key={date}>
                        <div className="flex items-center gap-2.5 bg-gray-800 px-4 py-2 text-sm font-semibold text-white">
                          {dayLabel(date, anchorDate) !== null && (
                            <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-bold">Day {dayLabel(date, anchorDate)}</span>
                          )}
                          {formatLongDate(date)}
                        </div>
                        {dayRows?.map(row => (
                          <ScheduleRow
                            key={row.id}
                            row={row}
                            locationName={row.location}
                            onOpenEvent={openEvent}
                            onEdit={item => { setEditingItem(item); setShowEditor(true) }}
                            onDelete={itemId => void removeItem(itemId)}
                            onAssignPco={pcoRow => setAssigningPcoRow(pcoRow)}
                            editable={isAdmin}
                          />
                        ))}
                      </div>
                    ))}
                  </Card>
                ) : (() => {
                  const axis: 'rooms' | 'departments' = view === 'departments' ? 'departments' : 'rooms'
                  const gridDates = [...new Set(filteredRows.filter(row => row.startTime).map(row => row.date))].sort()
                  const untimedCount = filteredRows.filter(row => row.item && !row.startTime).length
                  if (gridDates.length === 0) {
                    return (
                      <Card className="p-8 text-center text-sm text-gray-400">
                        {axis === 'rooms'
                          ? 'No timed items yet. Give a schedule item a start time and a location to build the room grid.'
                          : 'No timed items yet. Give a schedule item a start time and a department to build the department grid.'}
                      </Card>
                    )
                  }
                  return (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-400">
                        <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm border border-blue-300 bg-blue-50" /> PCO event (read-only)</span>
                        <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm border border-teal-300 bg-teal-50" /> Workbook item</span>
                        <span className="inline-flex items-center gap-1 text-red-500"><AlertTriangle className="h-3 w-3" /> Overlap in a column = conflict</span>
                        {untimedCount > 0 && <span>{untimedCount} untimed item{untimedCount === 1 ? '' : 's'} not shown</span>}
                      </div>
                      {gridDates.map(date => {
                        const gridItems = filteredRows
                          .filter(row => row.date === date && row.startTime)
                          .map(row => rowToGridItem(row, axis))
                          .filter((item): item is TimeGridItem => item !== null)
                        const usedKeys = new Set(gridItems.flatMap(item => item.columnKeys))
                        const columns: TimeGridColumn[] = axis === 'rooms'
                          ? [
                              ...locations.filter(location => usedKeys.has(location.id)).map(location => ({ key: location.id, label: location.name })),
                              ...(usedKeys.has('__noloc__') ? [{ key: '__noloc__', label: 'No location' }] : []),
                            ]
                          : (() => {
                              const known = new Set(departmentOptions.map(department => department.name))
                              const extras = [...usedKeys].filter(key => key !== '__general__' && !known.has(key))
                              return [
                                ...departmentOptions.filter(department => usedKeys.has(department.name)).map(department => ({ key: department.name, label: department.name })),
                                ...extras.map(key => ({ key, label: key })),
                                ...(usedKeys.has('__general__') ? [{ key: '__general__', label: 'General' }] : []),
                              ]
                            })()
                        const dayNum = dayLabel(date, anchorDate)
                        return (
                          <Card key={date} className="overflow-hidden">
                            <div className="flex items-center gap-2.5 bg-gray-800 px-4 py-2 text-sm font-semibold text-white">
                              {dayNum !== null && <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-bold">Day {dayNum}</span>}
                              {formatLongDate(date)}
                            </div>
                            <div className="p-3">
                              <ScheduleTimeGrid columns={columns} items={gridItems} />
                            </div>
                          </Card>
                        )
                      })}
                    </div>
                  )
                })()}
              </>
            )}

            {tab === 'events' && (
              <div className="space-y-4">
                <Card className="p-4">
                  <SectionLabel>Rooms / Locations</SectionLabel>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {locations.length === 0 ? (
                      <span className="text-sm text-gray-400">No locations yet.</span>
                    ) : locations.map(location => (
                      <span key={location.id} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700">
                        <MapPin className="h-3.5 w-3.5" /> {location.name}
                      </span>
                    ))}
                  </div>
                  {isAdmin && (
                    <p className="mt-3 text-xs text-gray-400">
                      Locations are shared across all workbooks and managed in <span className="font-semibold text-gray-500">Settings → Production Config</span>.
                    </p>
                  )}
                </Card>

                {isAdmin && (
                  <Card className="p-4">
                    <SectionLabel>Attach Existing Event</SectionLabel>
                    <p className="mt-2 text-sm text-gray-500">Events remain their own Sunday Ops workspaces; the workbook coordinates them in one schedule.</p>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <select value={selectedEventToAttach} onChange={event => setSelectedEventToAttach(event.target.value)} className={FIELD_CLASS}>
                        <option value="">Choose an existing event...</option>
                        {unassignedEvents.map(session => <option key={session.id} value={session.id}>{formatDate(session.date)} | {session.name}</option>)}
                      </select>
                      <button onClick={() => void attachEvent()} disabled={!selectedEventToAttach} className="inline-flex flex-shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                        <Link2 className="h-4 w-4" /> Attach
                      </button>
                    </div>
                  </Card>
                )}

                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <SectionLabel>Workbook Events</SectionLabel>
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-400"><Users className="h-3.5 w-3.5" /> Event workspaces stay canonical</span>
                  </div>
                  <div className="space-y-2">
                    {linkedEvents.length === 0 ? (
                      <Card className="p-8 text-center text-sm text-gray-400">Attach an event to make its principal time block appear in the master schedule.</Card>
                    ) : linkedEvents.map(event => (
                      <EventSetupRow
                        key={event.id}
                        event={event}
                        locations={locations}
                        onSave={saveEventSchedule}
                        onOpen={openEvent}
                        onDetach={detachEvent}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>
        )}
      </div>

      {showCreate && (
        <CreateWorkbookModal
          onCreate={workbook => {
            setWorkbooks(current => [workbook, ...current])
            setActiveWorkbookId(workbook.id)
          }}
          onClose={() => setShowCreate(false)}
        />
      )}

      {assigningPcoRow && activeWorkbook && (
        <PcoTimeMetaModal
          row={assigningPcoRow}
          workbookId={activeWorkbook.id}
          locations={locations}
          departmentOptions={departmentOptions}
          onSaved={refreshPcoMeta}
          onClose={() => setAssigningPcoRow(null)}
        />
      )}
    </div>
  )
}
