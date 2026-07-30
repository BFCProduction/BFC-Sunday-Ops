import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { DollarSign, Link2, Loader2, Pencil, RefreshCw, Trash2, UserPlus, X } from 'lucide-react'
import { Card } from '../ui/Card'
import { syncPcoWorkbookCrew, type AppUser } from '../../lib/adminApi'
import {
  createCrewMember,
  updateCrewMember,
  updateCrewMemberTime,
  deleteCrewMember,
  type CrewMemberInput,
} from '../../lib/workbooks'
import {
  buildWorkbookPayLines,
  workbookCrewMemberHours,
  workbookCrewMemberPay,
  workbookCrewPersonName,
} from '../../lib/workbookCrewUtils'
import type { CrewRole, Session, Workbook, WorkbookCrewMember } from '../../types'

function money(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}
const FIELD = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500'

function formatDay(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

interface CrewTabProps {
  workbook: Workbook
  workbookDays: string[]
  linkedEvents: Session[]
  users: AppUser[]
  roles: CrewRole[]
  crew: WorkbookCrewMember[]
  sessionToken: string | null
  onChanged: () => Promise<void>
}

function avatarFor(member: WorkbookCrewMember, users: AppUser[]) {
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
  memberId,
  field,
  label,
  value,
  onSaved,
}: {
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
      await updateCrewMemberTime(memberId, field, draft || null)
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
        className={`w-[7rem] rounded-md border bg-white px-2 py-1.5 font-mono text-xs text-gray-700 outline-none transition focus:ring-2 ${
          error
            ? 'border-red-300 focus:border-red-400 focus:ring-red-100'
            : 'border-gray-200 focus:border-blue-400 focus:ring-blue-100'
        }`}
      />
      {saving && <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-blue-500" aria-label="Saving" />}
    </div>
  )
}

function CrewMemberModal({
  workbookId, workbookDays, linkedEvents, users, roles, existing, onSaved, onClose,
}: {
  workbookId: string
  workbookDays: string[]
  linkedEvents: Session[]
  users: AppUser[]
  roles: CrewRole[]
  existing: WorkbookCrewMember | null
  onSaved: () => Promise<void>
  onClose: () => void
}) {
  const initialPerson = existing
    ? (existing.is_open ? 'TBD' : (existing.user_id ? users.find(u => u.id === existing.user_id)?.name ?? '' : existing.person_name ?? ''))
    : ''
  const [person, setPerson] = useState(initialPerson)
  const [roleId, setRoleId] = useState(existing?.role_id ?? '')
  const [date, setDate] = useState(existing?.scheduled_date ?? workbookDays[0] ?? '')
  const [eventId, setEventId] = useState(existing?.event_id ?? '')
  const [callTime, setCallTime] = useState(existing?.call_time?.slice(0, 5) ?? '')
  const [releaseTime, setReleaseTime] = useState(existing?.release_time?.slice(0, 5) ?? '')
  const [isPaid, setIsPaid] = useState(existing?.is_paid ?? false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function pickRole(nextRoleId: string) {
    setRoleId(nextRoleId)
  }

  const eventsForDay = linkedEvents.filter(event => event.date === date)

  async function submit(formEvent: FormEvent) {
    formEvent.preventDefault()
    if (!date) { setError('Pick a day.'); return }
    const trimmed = person.trim()
    const isOpen = trimmed === '' || trimmed.toLowerCase() === 'tbd'
    const matchedUser = users.find(user => user.name.toLowerCase() === trimmed.toLowerCase())
    const input: CrewMemberInput = {
      workbookId,
      eventId: eventId || null,
      scheduledDate: date,
      userId: isOpen ? null : (matchedUser?.id ?? null),
      personName: isOpen ? null : (matchedUser ? null : trimmed),
      isOpen,
      roleId: roleId || null,
      callTime: callTime || null,
      releaseTime: releaseTime || null,
      isPaid,
    }
    setSaving(true)
    setError('')
    try {
      if (existing) await updateCrewMember(existing.id, input)
      else await createCrewMember(input)
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
          <h2 className="text-base font-bold text-gray-900">{existing ? 'Edit crew member' : 'Add crew member'}</h2>
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
              <select className={FIELD} value={date} onChange={e => { setDate(e.target.value); setEventId('') }}>
                {workbookDays.map(day => <option key={day} value={day}>{formatDay(day)}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Event (optional)</label>
              <select className={FIELD} value={eventId} onChange={e => setEventId(e.target.value)}>
                <option value="">Whole day / production</option>
                {eventsForDay.map(event => <option key={event.id} value={event.id}>{event.name}</option>)}
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
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={isPaid} onChange={e => setIsPaid(e.target.checked)} />
            Paid (vs volunteer) — admin only; pay math comes later
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
          <button disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving...' : existing ? 'Save' : 'Add crew'}
          </button>
        </div>
      </form>
    </div>
  )
}

export function CrewTab({ workbook, workbookDays, linkedEvents, users, roles, crew, sessionToken, onChanged }: CrewTabProps) {
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<WorkbookCrewMember | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')
  const [syncError, setSyncError] = useState('')

  const roleName = (member: WorkbookCrewMember) =>
    (member.role_id ? roles.find(role => role.id === member.role_id)?.name : null)
    ?? member.pco_role_name
    ?? '—'

  const syncFromPco = useCallback(async () => {
    if (!sessionToken || linkedEvents.length === 0) return
    setSyncing(true)
    setSyncError('')
    try {
      const result = await syncPcoWorkbookCrew(sessionToken, workbook.id)
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
  }, [linkedEvents.length, onChanged, sessionToken, workbook.id])

  const linkedEventIdsKey = linkedEvents.map(event => event.id).join(',')
  useEffect(() => {
    void syncFromPco()
  }, [linkedEventIdsKey, syncFromPco])

  // Pay computed client-side (admin-only tab): per-event hours × role rate, summed per person.
  const { lines: payLines, totalHours, totalPay } = buildWorkbookPayLines(crew, users, roles)

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
    await deleteCrewMember(id)
    setConfirmDelete(null)
    await onChanged()
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-gray-900">Crew</p>
            <p className="mt-0.5 text-xs text-gray-500">
              Assigned crew sync automatically from each linked Planning Center plan. Call / release times, pay status,
              and local role adjustments stay in Sunday Ops.
            </p>
            {(syncMessage || syncError) && (
              <div className="mt-2">
                {syncMessage && !syncError && <p className="text-xs font-medium text-emerald-600">{syncMessage}</p>}
                {syncError && <p className="text-xs font-medium text-red-600">{syncError}</p>}
              </div>
            )}
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void syncFromPco()}
              disabled={syncing || linkedEvents.length === 0 || !sessionToken}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {syncing ? 'Syncing…' : 'Sync PCO'}
            </button>
            <button
              onClick={() => { setEditing(null); setShowModal(true) }}
              disabled={workbookDays.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              <UserPlus className="h-4 w-4" /> Add crew
            </button>
          </div>
        </div>
      </Card>

      {crew.length === 0 ? (
        <Card className="p-8 text-center text-sm text-gray-400">
          {syncing ? 'Loading assigned crew from Planning Center…' : 'No assigned PCO crew or manually added crew yet.'}
        </Card>
      ) : groups.map(group => (
        <Card key={group.key} className="overflow-hidden">
          <div className="bg-gray-800 px-4 py-2 text-sm font-semibold text-white">{group.label}</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  <th className="px-4 py-2">Name</th>
                  <th className="px-3 py-2">Role</th>
                  <th className="px-3 py-2">Call</th>
                  <th className="px-3 py-2">Release</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2 text-right">Hours</th>
                  <th className="px-3 py-2 text-right">Pay</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {group.members.map(member => (
                  <tr key={member.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
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
                    <td className="px-3 py-2.5 text-gray-600">{roleName(member)}</td>
                    <td className="px-3 py-2.5">
                      <InlineCrewTimeInput
                        memberId={member.id}
                        field="call_time"
                        label="Call"
                        value={member.call_time}
                        onSaved={onChanged}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <InlineCrewTimeInput
                        memberId={member.id}
                        field="release_time"
                        label="Release"
                        value={member.release_time}
                        onSaved={onChanged}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${member.is_paid ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
                        {member.is_paid ? 'Paid' : 'Volunteer'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-700">{workbookCrewMemberHours(member).toFixed(1)}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold text-gray-900">{member.is_paid ? money(workbookCrewMemberPay(member, roles)) : '—'}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => { setEditing(member); setShowModal(true) }} className="rounded-lg p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600" aria-label="Edit"><Pencil className="h-3.5 w-3.5" /></button>
                        {member.source !== 'pco' && (
                          confirmDelete === member.id ? (
                            <button onClick={() => void remove(member.id)} className="rounded-lg bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700">Sure?</button>
                          ) : (
                            <button onClick={() => setConfirmDelete(member.id)} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" aria-label="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}

      {payLines.length > 0 && (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">
            <DollarSign className="h-4 w-4" /> Total pay — all crew across the workbook
            <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold uppercase">admin only</span>
          </div>
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
                    <td className="px-3 py-2.5 text-right font-mono text-gray-600">{line.hours.toFixed(1)}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold text-gray-900">{money(line.pay)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-bold text-gray-900">
                  <td className="px-4 py-2.5">Total</td>
                  <td className="px-3 py-2.5 text-right font-mono">{totalHours.toFixed(1)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{money(totalPay)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      {showModal && (
        <CrewMemberModal
          workbookId={workbook.id}
          workbookDays={workbookDays}
          linkedEvents={linkedEvents}
          users={users}
          roles={roles}
          existing={editing}
          onSaved={onChanged}
          onClose={() => { setShowModal(false); setEditing(null) }}
        />
      )}
    </div>
  )
}
