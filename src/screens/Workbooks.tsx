import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  BookOpen, CalendarDays, Filter, History,
  LayoutGrid, Link2, List, MapPin, Pencil, Plus, Printer, Save,
  Trash2, Users, X,
} from 'lucide-react'
import { useAdmin } from '../context/adminState'
import { useSunday } from '../context/SundayContext'
import { fetchAppUsers, type AppUser } from '../lib/adminApi'
import { generateWorkbookScheduleHtml, type WorkbookScheduleExportRow } from '../lib/generateWorkbookScheduleHtml'
import { loadAllSessions, supabase } from '../lib/supabase'
import {
  attachEventToWorkbook,
  createScheduleItem,
  createWorkbook,
  createWorkbookLocation,
  deleteScheduleItem,
  detachEventFromWorkbook,
  loadWorkbookLocations,
  loadWorkbookScheduleItems,
  loadWorkbooks,
  publishWorkbookSchedule,
  updateScheduleItem,
  updateWorkbookEventSchedule,
  type ScheduleAssignmentInput,
  type ScheduleItemInput,
} from '../lib/workbooks'
import { Card } from '../components/ui/Card'
import { SectionLabel } from '../components/ui/SectionLabel'
import type {
  Session,
  Workbook,
  WorkbookLocation,
  WorkbookScheduleItem,
  WorkbookScheduleItemType,
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
  item: WorkbookScheduleItem | null
}

interface AssignmentDraft {
  personName: string
  role: string
  department: string
}

const ITEM_TYPES: Array<{ id: WorkbookScheduleItemType; label: string }> = [
  { id: 'call', label: 'Call Time' },
  { id: 'rehearsal', label: 'Rehearsal' },
  { id: 'meal', label: 'Crew Meal' },
  { id: 'meeting', label: 'Production Meeting' },
  { id: 'programming', label: 'Programming' },
  { id: 'transition', label: 'Stage Transition' },
  { id: 'load_in', label: 'Load-In' },
  { id: 'strike', label: 'Strike' },
  { id: 'task', label: 'Task' },
]

const FIELD_CLASS = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500'

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
  linkedEvents,
  users,
  existing,
  onSaved,
  onCancel,
}: {
  workbook: Workbook
  locations: WorkbookLocation[]
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
  const [itemType, setItemType] = useState<WorkbookScheduleItemType>(existing?.item_type ?? 'task')
  const [departments, setDepartments] = useState((existing?.departments ?? []).join(', '))
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
      departments: stringList(departments),
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
        <select className={FIELD_CLASS} value={locationId} onChange={event => setLocationId(event.target.value)}>
          <option value="">No location</option>
          {locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
        </select>
        <select className={FIELD_CLASS} value={eventId} onChange={event => setEventId(event.target.value)}>
          <option value="">Workbook-level item</option>
          {linkedEvents.map(linkedEvent => <option key={linkedEvent.id} value={linkedEvent.id}>{linkedEvent.name}</option>)}
        </select>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-4">
        <div>
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gray-500">End Time</label>
          <input className={FIELD_CLASS} type="time" value={endTime} onChange={event => setEndTime(event.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gray-500">Type</label>
          <select className={FIELD_CLASS} value={itemType} onChange={event => setItemType(event.target.value as WorkbookScheduleItemType)}>
            {ITEM_TYPES.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gray-500">Departments</label>
          <input className={FIELD_CLASS} value={departments} onChange={event => setDepartments(event.target.value)} placeholder="Audio, Video" />
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

function ScheduleRow({
  row,
  locationName,
  onOpenEvent,
  onEdit,
  onDelete,
  editable,
}: {
  row: DisplayRow
  locationName: string | null
  onOpenEvent: (eventId: string) => void
  onEdit: (item: WorkbookScheduleItem) => void
  onDelete: (itemId: string) => void
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
          {row.relatedEvent && row.kind !== 'event' && <span className="rounded-full bg-gray-100 px-2 py-0.5">{row.relatedEvent}</span>}
        </div>
        {row.assignments.length > 0 && (
          <p className="mt-2 text-xs leading-5 text-gray-600">{row.assignments.join('  |  ')}</p>
        )}
      </div>
      <p className="text-sm text-gray-500">{row.notes || ''}</p>
      <div className="flex items-start justify-end gap-1">
        {row.kind === 'event' && row.eventId && (
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
  locations: WorkbookLocation[]
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
  const { navigateToEvent } = useSunday()
  const [workbooks, setWorkbooks] = useState<Workbook[]>([])
  const [activeWorkbookId, setActiveWorkbookId] = useState('')
  const [locations, setLocations] = useState<WorkbookLocation[]>([])
  const [items, setItems] = useState<WorkbookScheduleItem[]>([])
  const [users, setUsers] = useState<AppUser[]>([])
  const [tab, setTab] = useState<'schedule' | 'events'>('schedule')
  const [view, setView] = useState<'detail' | 'rooms' | 'mine'>(isAdmin ? 'detail' : 'mine')
  const [loading, setLoading] = useState(true)
  const [workspaceLoading, setWorkspaceLoading] = useState(false)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showEditor, setShowEditor] = useState(false)
  const [editingItem, setEditingItem] = useState<WorkbookScheduleItem | null>(null)
  const [newLocationName, setNewLocationName] = useState('')
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

  useEffect(() => {
    if (!isAdmin || !sessionToken) return
    fetchAppUsers(sessionToken)
      .then(setUsers)
      .catch(() => setUsers([]))
  }, [isAdmin, sessionToken])

  const refreshWorkspace = useCallback(async () => {
    if (!activeWorkbookId) return
    setWorkspaceLoading(true)
    try {
      const [freshLocations, freshItems] = await Promise.all([
        loadWorkbookLocations(activeWorkbookId),
        loadWorkbookScheduleItems(activeWorkbookId),
      ])
      setLocations(freshLocations)
      setItems(freshItems)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load workbook schedule.')
    } finally {
      setWorkspaceLoading(false)
    }
  }, [activeWorkbookId])

  useEffect(() => {
    if (!activeWorkbookId) {
      setLocations([])
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
        { event: '*', schema: 'public', table: 'workbook_locations', filter: `workbook_id=eq.${activeWorkbookId}` },
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
    const eventRows = linkedEvents.map(event => ({
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
        item,
      }
    })
    return [...eventRows, ...itemRows].sort((a, b) =>
      a.date.localeCompare(b.date)
      || (a.startTime ?? '23:59:59').localeCompare(b.startTime ?? '23:59:59')
      || (a.kind === 'event' ? -1 : 1)
      || a.title.localeCompare(b.title)
    )
  }, [items, linkedEvents, locationMap])

  const days = [...new Set(rows.map(row => row.date))]
  const departments = [...new Set(items.flatMap(item => [
    ...item.departments,
    ...item.assignments.map(assignment => assignment.department).filter((value): value is string => Boolean(value)),
  ]))].sort()
  const people = [...new Set(items.flatMap(item => item.assignments
    .filter(assignment => !assignment.is_open && assignment.person_name)
    .map(assignment => assignment.person_name as string)))].sort()

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

  async function addLocation(event: FormEvent) {
    event.preventDefault()
    if (!activeWorkbook || !newLocationName.trim()) return
    await createWorkbookLocation(activeWorkbook.id, newLocationName)
    setNewLocationName('')
    await refreshWorkspace()
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
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">{locations.length} room{locations.length === 1 ? '' : 's'}</span>
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
                        <LayoutGrid className="h-4 w-4" /> Rooms
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
                        <div className="bg-gray-800 px-4 py-2 text-sm font-semibold text-white">{formatLongDate(date)}</div>
                        {dayRows?.map(row => (
                          <ScheduleRow
                            key={row.id}
                            row={row}
                            locationName={row.location}
                            onOpenEvent={openEvent}
                            onEdit={item => { setEditingItem(item); setShowEditor(true) }}
                            onDelete={itemId => void removeItem(itemId)}
                            editable={isAdmin}
                          />
                        ))}
                      </div>
                    ))}
                  </Card>
                ) : (
                  <Card className="overflow-x-auto p-4">
                    {locations.length === 0 ? (
                      <p className="p-6 text-center text-sm text-gray-400">Add rooms from the Events tab to build a side-by-side view.</p>
                    ) : (
                      <div className="grid min-w-[720px] gap-3" style={{ gridTemplateColumns: `repeat(${locations.length}, minmax(210px, 1fr))` }}>
                        {locations.map(location => {
                          const roomRows = filteredRows.filter(row => row.locationId === location.id)
                          return (
                            <div key={location.id} className="rounded-lg border border-gray-200 bg-gray-50 p-2">
                              <div className="mb-2 rounded-md bg-gray-800 px-3 py-2 text-sm font-bold text-white">{location.name}</div>
                              <div className="space-y-2">
                                {roomRows.length === 0 ? (
                                  <p className="px-2 py-3 text-xs text-gray-400">No scheduled activity</p>
                                ) : roomRows.map(row => (
                                  <div key={row.id} className={`rounded-lg border p-2.5 ${row.kind === 'event' ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-white'}`}>
                                    {dayFilter === 'all' && <p className="text-[10px] font-bold uppercase text-gray-400">{formatDate(row.date)}</p>}
                                    <p className="mt-0.5 text-xs font-semibold text-gray-600">{timeRange(row.startTime, row.endTime)}</p>
                                    <p className={`mt-1 text-sm font-bold ${row.kind === 'event' ? 'text-blue-800' : 'text-gray-900'}`}>{row.title}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </Card>
                )}
              </>
            )}

            {tab === 'events' && (
              <div className="space-y-4">
                <Card className="p-4">
                  <SectionLabel>Rooms / Locations</SectionLabel>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {locations.map(location => (
                      <span key={location.id} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700">
                        <MapPin className="h-3.5 w-3.5" /> {location.name}
                      </span>
                    ))}
                  </div>
                  {isAdmin && (
                    <form onSubmit={addLocation} className="mt-3 flex max-w-md gap-2">
                      <input value={newLocationName} onChange={event => setNewLocationName(event.target.value)} className={FIELD_CLASS} placeholder="Add room or location" />
                      <button className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Add</button>
                    </form>
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
    </div>
  )
}
