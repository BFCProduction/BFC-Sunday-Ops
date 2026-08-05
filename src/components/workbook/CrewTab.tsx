import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
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
import { Check, DollarSign, GripVertical, Link2, Loader2, Pencil, RefreshCw, Trash2, UserPlus, X } from 'lucide-react'
import { Card } from '../ui/Card'
import { syncPcoWorkbookCrew } from '../../lib/adminApi'
import {
  addModuleCrewMember,
  deleteModuleCrewMember,
  reorderModuleCrew,
  updateModuleCrewMember,
} from '../../lib/moduleContent'
import {
  buildWorkbookPayLines,
  workbookCrewMemberHours,
  workbookCrewMemberPay,
  workbookCrewPersonName,
} from '../../lib/workbookCrewUtils'
import type { CrewRole, ModulePerson, Session, WorkbookCrewMember } from '../../types'

function money(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}
const FIELD = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500'

function formatDay(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function formatCrewTime(value: string | null) {
  if (!value) return '—'
  const [hour, minute] = value.slice(0, 5).split(':').map(Number)
  if (Number.isNaN(hour) || Number.isNaN(minute)) return '—'
  return new Date(2000, 0, 1, hour, minute).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

interface CrewTabProps {
  moduleId: string
  workbookId: string | null
  workbookDays: string[]
  linkedEvents: Session[]
  users: ModulePerson[]
  roles: CrewRole[]
  crew: WorkbookCrewMember[]
  editable: boolean
  isAdmin: boolean
  sessionToken: string
  onChanged: () => Promise<void>
}

function avatarFor(member: WorkbookCrewMember, users: ModulePerson[]) {
  const user = member.user_id ? users.find(u => u.id === member.user_id) : undefined
  const name = user?.name ?? member.person_name ?? 'TBD'
  const initials = name.split(' ').map(part => part[0]).slice(0, 2).join('').toUpperCase()
  if (user?.avatar_url) {
    return <img src={user.avatar_url} alt="" className="h-7 w-7 flex-shrink-0 rounded-full object-cover" />
  }
  if (member.pco_photo_url) {
    return <img src={member.pco_photo_url} alt="" className="h-7 w-7 flex-shrink-0 rounded-full object-cover" />
  }
  return <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700">{initials}</span>
}

function InlineCrewTimeInput({
  moduleId,
  sessionToken,
  memberId,
  field,
  label,
  value,
  onSaved,
}: {
  moduleId: string
  sessionToken: string
  memberId: string
  field: 'call_time' | 'release_time'
  label: string
  value: string | null
  onSaved: () => Promise<void>
}) {
  const savedValue = value?.slice(0, 5) ?? ''
  const [draft, setDraft] = useState(savedValue)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!saving) setDraft(savedValue)
  }, [savedValue, saving])

  async function save() {
    if (saving || draft === savedValue) return
    setSaving(true)
    setError('')
    try {
      await updateModuleCrewMember(sessionToken, moduleId, memberId, field === 'call_time'
        ? { callTime: draft || null }
        : { releaseTime: draft || null })
      await onSaved()
    } catch (saveError) {
      setDraft(savedValue)
      setError(saveError instanceof Error ? saveError.message : `Unable to save ${label.toLowerCase()}.`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-w-[8rem] items-center gap-1.5">
      <input
        type="time"
        value={draft}
        onChange={event => setDraft(event.target.value)}
        onBlur={() => void save()}
        onKeyDown={event => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') {
            event.preventDefault()
            setDraft(savedValue)
          }
        }}
        aria-label={`${label} time`}
        aria-invalid={Boolean(error)}
        title={error || `${label} time — saves when you leave the field`}
        className={`w-[7rem] rounded-md border bg-white px-2 py-1.5 text-xs text-gray-700 outline-none transition focus:ring-2 ${
          error
            ? 'border-red-300 focus:border-red-400 focus:ring-red-100'
            : 'border-gray-200 focus:border-blue-400 focus:ring-blue-100'
        }`}
      />
      {saving && <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-blue-500" aria-label="Saving" />}
    </div>
  )
}

function InlineCrewSelect({
  value,
  label,
  options,
  onSave,
}: {
  value: string
  label: string
  options: Array<{ value: string; label: string }>
  onSave: (value: string) => Promise<void>
}) {
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!saving) setDraft(value)
  }, [saving, value])

  async function save(nextValue: string) {
    setDraft(nextValue)
    setSaving(true)
    setError('')
    try {
      await onSave(nextValue)
    } catch (saveError) {
      setDraft(value)
      setError(saveError instanceof Error ? saveError.message : `Unable to save ${label.toLowerCase()}.`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-w-[8rem] items-center gap-1.5">
      <select
        value={draft}
        onChange={event => void save(event.target.value)}
        disabled={saving}
        aria-label={label}
        aria-invalid={Boolean(error)}
        title={error || `${label} — saves immediately`}
        className={`w-full rounded-md border bg-white px-2 py-1.5 text-xs text-gray-700 outline-none transition focus:ring-2 disabled:opacity-60 ${
          error
            ? 'border-red-300 focus:border-red-400 focus:ring-red-100'
            : 'border-gray-200 focus:border-blue-400 focus:ring-blue-100'
        }`}
      >
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      {saving && <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-blue-500" aria-label="Saving" />}
    </div>
  )
}

function SortableCrewRow({
  id,
  disabled,
  children,
}: {
  id: string
  disabled: boolean
  children: (dragHandle: ReactNode) => ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled })
  const dragHandle = disabled ? null : (
    <button
      type="button"
      {...attributes}
      {...listeners}
      className="flex-shrink-0 cursor-grab touch-none rounded p-1 text-gray-300 hover:bg-gray-100 hover:text-gray-500 active:cursor-grabbing"
      aria-label="Drag to reorder crew member"
      title="Drag to reorder"
    >
      <GripVertical className="h-4 w-4" />
    </button>
  )

  return (
    <tr
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`border-b border-gray-50 last:border-0 ${isDragging ? 'relative z-10 bg-white shadow-lg' : 'bg-white'}`}
    >
      {children(dragHandle)}
    </tr>
  )
}

function AddCrewModal({
  moduleId, workbookDays, users, roles, isAdmin, sessionToken, onSaved, onClose,
}: {
  moduleId: string
  workbookDays: string[]
  users: ModulePerson[]
  roles: CrewRole[]
  isAdmin: boolean
  sessionToken: string
  onSaved: () => Promise<void>
  onClose: () => void
}) {
  const [person, setPerson] = useState('')
  const [roleId, setRoleId] = useState('')
  const [date, setDate] = useState(workbookDays[0] ?? '')
  const [callTime, setCallTime] = useState('')
  const [releaseTime, setReleaseTime] = useState('')
  const [isPaid, setIsPaid] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function pickRole(nextRoleId: string) {
    setRoleId(nextRoleId)
  }

  async function submit(formEvent: FormEvent) {
    formEvent.preventDefault()
    if (!date) { setError('Pick a day.'); return }
    const trimmed = person.trim()
    const isOpen = trimmed === '' || trimmed.toLowerCase() === 'tbd'
    const input = {
      scheduledDate: date,
      personName: isOpen ? null : trimmed,
      isOpen,
      roleId: roleId || null,
      callTime: callTime || null,
      releaseTime: releaseTime || null,
      isPaid,
    }
    setSaving(true)
    setError('')
    try {
      await addModuleCrewMember(sessionToken, moduleId, input)
      await onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save crew member.')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
      <form onSubmit={submit} className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-bold text-gray-900">Add crew member</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Person</label>
              <input list="crew-person-options" className={FIELD} value={person} onChange={e => setPerson(e.target.value)} placeholder="Person or TBD" />
              <datalist id="crew-person-options">
                {users.map(user => <option key={user.id} value={user.name} />)}
                <option value="TBD" />
              </datalist>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Role</label>
              <select className={FIELD} value={roleId} onChange={e => pickRole(e.target.value)}>
                <option value="">No role</option>
                {roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Day</label>
              <select className={FIELD} value={date} onChange={e => setDate(e.target.value)}>
                {workbookDays.map(day => <option key={day} value={day}>{formatDay(day)}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Call time</label>
              <input type="time" className={FIELD} value={callTime} onChange={e => setCallTime(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Release time</label>
              <input type="time" className={FIELD} value={releaseTime} onChange={e => setReleaseTime(e.target.value)} />
            </div>
          </div>
          {isAdmin && <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={isPaid} onChange={e => setIsPaid(e.target.checked)} />
            Paid (vs volunteer)
          </label>}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
          <button disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving...' : 'Add crew'}
          </button>
        </div>
      </form>
    </div>
  )
}

export function CrewTab({ moduleId, workbookId, workbookDays, linkedEvents, users, roles, crew, editable, isAdmin, sessionToken, onChanged }: CrewTabProps) {
  const [showModal, setShowModal] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')
  const [syncError, setSyncError] = useState('')
  const editMode = editable && isEditing
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const roleOptions = [
    { value: '', label: 'Not assigned' },
    ...roles.map(role => ({ value: role.id, label: role.name })),
  ]
  const payTypeOptions = [
    { value: 'volunteer', label: 'Volunteer' },
    { value: 'paid', label: 'Paid' },
  ]

  const assignedRole = (member: WorkbookCrewMember) =>
    member.role_id ? roles.find(role => role.id === member.role_id) ?? null : null

  const payDisplay = (member: WorkbookCrewMember) => {
    if (!member.is_paid) return { label: '—', warning: false }
    const role = member.role_id ? roles.find(item => item.id === member.role_id) : null
    if (!role) return { label: 'Role not assigned', warning: true }
    if (Number(role.hourly_rate) <= 0) return { label: 'Rate not set', warning: true }
    return { label: money(workbookCrewMemberPay(member, roles)), warning: false }
  }

  const syncFromPco = useCallback(async () => {
    if (!isAdmin || !workbookId || linkedEvents.length === 0) return
    setSyncing(true)
    setSyncError('')
    try {
      const result = await syncPcoWorkbookCrew(sessionToken, workbookId)
      await onChanged()
      setSyncMessage(`PCO crew up to date · ${result.assignments} assignment${result.assignments === 1 ? '' : 's'}`)
      if (result.errors.length > 0) {
        setSyncError(`${result.errors.length} event${result.errors.length === 1 ? '' : 's'} could not be synced. ${result.errors[0].error}`)
      }
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Unable to sync assigned crew from Planning Center.')
    } finally {
      setSyncing(false)
    }
  }, [isAdmin, linkedEvents.length, onChanged, sessionToken, workbookId])

  const linkedEventIdsKey = linkedEvents.map(event => event.id).join(',')
  useEffect(() => {
    if (!isAdmin) return
    void syncFromPco()
  }, [isAdmin, linkedEventIdsKey, syncFromPco])

  // Keep all pay calculation out of the non-admin render path.
  const paySummary = isAdmin
    ? buildWorkbookPayLines(crew, users, roles)
    : { lines: [], totalHours: 0, totalPay: 0 }
  const { lines: payLines, totalHours, totalPay } = paySummary
  const unpricedPaidAssignments = isAdmin
    ? crew.filter(member => {
        if (!member.is_paid) return false
        const role = assignedRole(member)
        return !role || Number(role.hourly_rate) <= 0
      }).length
    : 0

  // Crew grouped by event; crew with no event are grouped by day.
  const groups = (() => {
    const map = new Map<string, { key: string; label: string; date: string; members: WorkbookCrewMember[] }>()
    for (const member of crew) {
      let key: string, label: string, date: string
      if (member.event_id) {
        const event = linkedEvents.find(item => item.id === member.event_id)
        date = event?.date ?? member.scheduled_date
        key = `event:${member.event_id}`
        label = `${formatDay(date)} · ${event?.name ?? 'Event'}`
      } else {
        date = member.scheduled_date
        key = `day:${member.scheduled_date}`
        label = `${formatDay(date)} · Whole day`
      }
      const group = map.get(key) ?? { key, label, date, members: [] }
      group.members.push(member)
      map.set(key, group)
    }
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label))
  })()

  async function remove(id: string) {
    await deleteModuleCrewMember(sessionToken, moduleId, id)
    setConfirmDelete(null)
    await onChanged()
  }

  async function reorderGroup(members: WorkbookCrewMember[], event: DragEndEvent) {
    if (!editMode) return
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = members.findIndex(member => member.id === active.id)
    const newIndex = members.findIndex(member => member.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    setSyncError('')
    try {
      const reordered = arrayMove(members, oldIndex, newIndex)
      await reorderModuleCrew(sessionToken, moduleId, reordered.map(member => member.id))
      await onChanged()
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Unable to save the crew order.')
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-gray-900">Crew</p>
            <p className="mt-0.5 text-xs text-gray-500">
              {isAdmin
                ? 'Planning Center assignments can sync into Event Crew modules. Call / release times, pay status, local role adjustments, and drag ordering stay in Sunday Ops.'
                : 'View or edit assigned crew, local roles, and call / release times for this live module.'}
            </p>
            {editMode && <p className="mt-1 text-xs font-medium text-blue-600">Edit mode · changes save automatically</p>}
            {(syncMessage || syncError) && (
              <div className="mt-2">
                {syncMessage && !syncError && <p className="text-xs font-medium text-emerald-600">{syncMessage}</p>}
                {syncError && <p className="text-xs font-medium text-red-600">{syncError}</p>}
              </div>
            )}
          </div>
          {editable && <div className="flex flex-shrink-0 items-center gap-2">
            {isAdmin && workbookId && <button
              type="button"
              onClick={() => void syncFromPco()}
              disabled={editMode || syncing || linkedEvents.length === 0 || !sessionToken}
              title={editMode ? 'Finish editing before syncing from Planning Center.' : 'Sync assigned crew from Planning Center'}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {syncing ? 'Syncing…' : 'Sync PCO'}
            </button>}
            {editMode && (
              <button
                onClick={() => setShowModal(true)}
                disabled={workbookDays.length === 0}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                <UserPlus className="h-4 w-4" /> Add crew
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setIsEditing(current => !current)
                setConfirmDelete(null)
                setShowModal(false)
              }}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${
                editMode
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {editMode ? <Check className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
              {editMode ? 'Done' : 'Edit crew'}
            </button>
          </div>}
        </div>
      </Card>

      {crew.length === 0 ? (
        <Card className="p-8 text-center text-sm text-gray-400">
          {syncing ? 'Loading assigned crew from Planning Center…' : 'No assigned PCO crew or manually added crew yet.'}
        </Card>
      ) : groups.map(group => (
        <Card key={group.key} className="overflow-hidden">
          <div className="bg-gray-800 px-4 py-2 text-sm font-semibold text-white">{group.label}</div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={event => void reorderGroup(group.members, event)}>
            <SortableContext items={group.members.map(member => member.id)} strategy={verticalListSortingStrategy}>
              <div className="overflow-x-auto">
                <table className={`w-full table-fixed text-sm ${isAdmin ? 'min-w-[1100px]' : 'min-w-[820px]'}`}>
                  <colgroup>
                    {isAdmin ? (
                      <>
                        <col style={{ width: editMode ? '21%' : '31%' }} />
                        <col style={{ width: editMode ? '18%' : '20%' }} />
                        <col style={{ width: editMode ? '14%' : '11%' }} />
                        <col style={{ width: editMode ? '14%' : '11%' }} />
                        <col style={{ width: editMode ? '14%' : '10%' }} />
                        <col style={{ width: editMode ? '7%' : '8%' }} />
                        <col style={{ width: editMode ? '8%' : '9%' }} />
                        {editMode && <col style={{ width: '4%' }} />}
                      </>
                    ) : (
                      <>
                        <col style={{ width: editMode ? '30%' : '34%' }} />
                        <col style={{ width: editMode ? '24%' : '26%' }} />
                        <col style={{ width: '15%' }} />
                        <col style={{ width: '15%' }} />
                        <col style={{ width: '10%' }} />
                        {editMode && <col style={{ width: '6%' }} />}
                      </>
                    )}
                  </colgroup>
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                      <th className="px-4 py-2">Name</th>
                      <th className="px-3 py-2">Role</th>
                      <th className="px-3 py-2">Call</th>
                      <th className="px-3 py-2">Release</th>
                      {isAdmin && <th className="px-3 py-2">Type</th>}
                      <th className="px-3 py-2 text-right">Hours</th>
                      {isAdmin && <th className="px-3 py-2 text-right">Pay</th>}
                      {editMode && <th className="px-3 py-2" />}
                    </tr>
                  </thead>
                  <tbody>
                {group.members.map(member => {
                  const pay = isAdmin ? payDisplay(member) : null
                  const role = assignedRole(member)
                  return <SortableCrewRow key={member.id} id={member.id} disabled={!editMode}>
                    {dragHandle => <>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        {dragHandle}
                        {avatarFor(member, users)}
                        <span className="font-semibold text-gray-900">
                          {workbookCrewPersonName(member, users)}
                          {member.is_open && <span className="ml-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">Open</span>}
                          {member.source === 'pco' && (
                            <span className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700">
                              <Link2 className="h-2.5 w-2.5" /> PCO
                            </span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-gray-600">
                      {editMode ? (
                        <InlineCrewSelect
                          value={member.role_id ?? ''}
                          label={`Role for ${workbookCrewPersonName(member, users)}`}
                          options={roleOptions}
                          onSave={async value => {
                            await updateModuleCrewMember(sessionToken, moduleId, member.id, { roleId: value || null })
                            await onChanged()
                          }}
                        />
                      ) : role ? role.name : (
                        <span
                          className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700"
                          title={member.pco_role_name ? `No Sunday Ops role matches the PCO position “${member.pco_role_name}”.` : 'No Sunday Ops role is assigned.'}
                        >
                          Not assigned
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {editMode ? (
                        <InlineCrewTimeInput
                          moduleId={moduleId}
                          sessionToken={sessionToken}
                          memberId={member.id}
                          field="call_time"
                          label="Call"
                          value={member.call_time}
                          onSaved={onChanged}
                        />
                      ) : <span className="text-gray-700">{formatCrewTime(member.call_time)}</span>}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {editMode ? (
                        <InlineCrewTimeInput
                          moduleId={moduleId}
                          sessionToken={sessionToken}
                          memberId={member.id}
                          field="release_time"
                          label="Release"
                          value={member.release_time}
                          onSaved={onChanged}
                        />
                      ) : <span className="text-gray-700">{formatCrewTime(member.release_time)}</span>}
                    </td>
                    {isAdmin && <td className="px-3 py-2.5 whitespace-nowrap">
                      {editMode ? (
                        <InlineCrewSelect
                          value={member.is_paid ? 'paid' : 'volunteer'}
                          label={`Pay type for ${workbookCrewPersonName(member, users)}`}
                          options={payTypeOptions}
                          onSave={async value => {
                            await updateModuleCrewMember(sessionToken, moduleId, member.id, { isPaid: value === 'paid' })
                            await onChanged()
                          }}
                        />
                      ) : (
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${member.is_paid ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
                          {member.is_paid ? 'Paid' : 'Volunteer'}
                        </span>
                      )}
                    </td>}
                    <td className="px-3 py-2.5 text-right whitespace-nowrap text-gray-700">{workbookCrewMemberHours(member).toFixed(1)}</td>
                    {isAdmin && pay && (
                      <td className={`px-3 py-2.5 text-right whitespace-nowrap font-semibold ${pay.warning ? 'text-xs text-amber-700' : 'text-gray-900'}`}>
                        {pay.label}
                      </td>
                    )}
                    {editMode && (
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          {member.source !== 'pco' && (
                            confirmDelete === member.id ? (
                              <button onClick={() => void remove(member.id)} className="rounded-lg bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700">Sure?</button>
                            ) : (
                              <button onClick={() => setConfirmDelete(member.id)} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" aria-label="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                            )
                          )}
                        </div>
                      </td>
                    )}
                    </>}
                  </SortableCrewRow>
                })}
                  </tbody>
                </table>
              </div>
            </SortableContext>
          </DndContext>
        </Card>
      ))}

      {isAdmin && payLines.length > 0 && (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">
            <DollarSign className="h-4 w-4" /> Total pay — this Crew module
            <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold uppercase">admin only</span>
          </div>
          {unpricedPaidAssignments > 0 && (
            <div className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-800">
              Pay total is incomplete: {unpricedPaidAssignments} paid assignment{unpricedPaidAssignments === 1 ? '' : 's'} need a local role and hourly rate.
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  <th className="px-4 py-2">Crew member</th>
                  <th className="px-3 py-2 text-right">Hours</th>
                  <th className="px-3 py-2 text-right">Pay</th>
                </tr>
              </thead>
              <tbody>
                {payLines.map(line => (
                  <tr key={line.name} className="border-b border-gray-50">
                    <td className="px-4 py-2.5 text-gray-800">{line.name}</td>
                    <td className="px-3 py-2.5 text-right text-gray-600">{line.hours.toFixed(1)}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-gray-900">{money(line.pay)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-bold text-gray-900">
                  <td className="px-4 py-2.5">Total</td>
                  <td className="px-3 py-2.5 text-right">{totalHours.toFixed(1)}</td>
                  <td className="px-3 py-2.5 text-right">{money(totalPay)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      {showModal && editMode && (
        <AddCrewModal
          moduleId={moduleId}
          workbookDays={workbookDays}
          users={users}
          roles={roles}
          isAdmin={isAdmin}
          sessionToken={sessionToken}
          onSaved={onChanged}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}
