import { useState, type FormEvent } from 'react'
import { DollarSign, FileText, Pencil, Trash2, UserPlus, X } from 'lucide-react'
import { Card } from '../ui/Card'
import type { AppUser } from '../../lib/adminApi'
import { createCrewMember, updateCrewMember, deleteCrewMember, type CrewMemberInput } from '../../lib/workbooks'
import { generateCallSheetHtml, type CallSheetPerson } from '../../lib/generateCallSheetHtml'
import { generatePayReportHtml, type PayLine } from '../../lib/generatePayReportHtml'
import type { CrewRole, Session, Workbook, WorkbookCrewMember } from '../../types'

function money(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}
function toMinutes(time: string | null): number | null {
  if (!time) return null
  const [hour, minute] = time.slice(0, 5).split(':').map(Number)
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null
  return hour * 60 + minute
}
// Per-event hours: this row's call → release, rounded to the nearest half hour.
function memberHours(member: WorkbookCrewMember): number {
  const call = toMinutes(member.call_time)
  const release = toMinutes(member.release_time)
  if (call === null || release === null || release <= call) return 0
  return Math.round(((release - call) / 60) * 2) / 2
}
function memberPay(member: WorkbookCrewMember, roles: CrewRole[]): number {
  if (!member.is_paid) return 0
  const rate = member.role_id ? (roles.find(role => role.id === member.role_id)?.hourly_rate ?? 0) : 0
  return Math.round(memberHours(member) * rate * 100) / 100
}

const FIELD = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500'

function formatDay(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function formatTime(time: string | null) {
  if (!time) return '—'
  const [hour, minute] = time.slice(0, 5).split(':').map(Number)
  if (Number.isNaN(hour)) return time
  const suffix = hour >= 12 ? 'PM' : 'AM'
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${suffix}`
}

function personName(member: WorkbookCrewMember, users: AppUser[]): string {
  if (member.is_open) return 'TBD'
  if (member.user_id) return users.find(user => user.id === member.user_id)?.name ?? 'Unknown'
  return member.person_name ?? 'Unknown'
}

interface CrewTabProps {
  workbook: Workbook
  workbookDays: string[]
  linkedEvents: Session[]
  users: AppUser[]
  roles: CrewRole[]
  crew: WorkbookCrewMember[]
  onChanged: () => Promise<void>
}

function avatarFor(member: WorkbookCrewMember, users: AppUser[]) {
  const user = member.user_id ? users.find(u => u.id === member.user_id) : undefined
  const name = user?.name ?? member.person_name ?? 'TBD'
  const initials = name.split(' ').map(part => part[0]).slice(0, 2).join('').toUpperCase()
  if (user?.avatar_url) {
    return <img src={user.avatar_url} alt="" className="h-7 w-7 flex-shrink-0 rounded-full object-cover" />
  }
  return <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700">{initials}</span>
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

export function CrewTab({ workbook, workbookDays, linkedEvents, users, roles, crew, onChanged }: CrewTabProps) {
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<WorkbookCrewMember | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const roleName = (id: string | null) => (id ? roles.find(role => role.id === id)?.name ?? '—' : '—')
  const eventName = (id: string | null) => (id ? linkedEvents.find(event => event.id === id)?.name ?? null : null)

  // Pay computed client-side (admin-only tab): per-event hours × role rate, summed per person.
  const payLines: PayLine[] = (() => {
    const map = new Map<string, PayLine>()
    for (const member of crew) {
      if (!member.is_paid || member.is_open) continue
      const key = member.user_id ?? `name:${member.person_name}`
      const line = map.get(key) ?? { name: personName(member, users), hours: 0, pay: 0 }
      line.hours = Math.round((line.hours + memberHours(member)) * 2) / 2
      line.pay = Math.round((line.pay + memberPay(member, roles)) * 100) / 100
      map.set(key, line)
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
  })()
  const totalHours = Math.round(payLines.reduce((sum, line) => sum + line.hours, 0) * 2) / 2
  const totalPay = Math.round(payLines.reduce((sum, line) => sum + line.pay, 0) * 100) / 100

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

  function openPayReport() {
    const range = workbookDays.length ? `${formatDay(workbookDays[0])} – ${formatDay(workbookDays[workbookDays.length - 1])}` : ''
    const html = generatePayReportHtml(workbook.name, range, payLines, totalHours, totalPay)
    const win = window.open('', '_blank')
    if (!win) { alert('Pop-up was blocked. Please allow pop-ups and try again.'); return }
    win.document.open()
    win.document.write(html)
    win.document.close()
    setTimeout(() => win.print(), 500)
  }

  function openCallSheets() {
    const byPerson = new Map<string, CallSheetPerson>()
    for (const member of crew) {
      if (member.is_open) continue
      const key = member.user_id ?? `name:${member.person_name}`
      const entry = byPerson.get(key) ?? { name: personName(member, users), shifts: [] }
      entry.shifts.push({
        date: member.scheduled_date,
        event: eventName(member.event_id),
        role: member.role_id ? roleName(member.role_id) : null,
        call: member.call_time,
        release: member.release_time,
      })
      byPerson.set(key, entry)
    }
    const people = [...byPerson.values()]
      .map(person => ({
        ...person,
        shifts: [...person.shifts].sort((a, b) => a.date.localeCompare(b.date) || (a.call ?? '').localeCompare(b.call ?? '')),
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
    const range = workbookDays.length
      ? `${formatDay(workbookDays[0])} – ${formatDay(workbookDays[workbookDays.length - 1])}`
      : ''
    const html = generateCallSheetHtml(workbook.name, range, people)
    const win = window.open('', '_blank')
    if (!win) { alert('Pop-up was blocked. Please allow pop-ups and try again.'); return }
    win.document.open()
    win.document.write(html)
    win.document.close()
    setTimeout(() => win.print(), 500)
  }

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
              Who&apos;s working, their role, call / release times, and pay per event. Call times cluster onto the schedule.
              Pay is admin-only and never shown to volunteers.
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <button
              onClick={openCallSheets}
              disabled={crew.length === 0}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              <FileText className="h-4 w-4" /> Call sheets
            </button>
            <button
              onClick={openPayReport}
              disabled={payLines.length === 0}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              <DollarSign className="h-4 w-4" /> Pay report
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
        <Card className="p-8 text-center text-sm text-gray-400">No crew added yet. Use “Add crew” to build the roster.</Card>
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
                          {personName(member, users)}
                          {member.is_open && <span className="ml-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">Open</span>}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-gray-600">{roleName(member.role_id)}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-600">{formatTime(member.call_time)}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-600">{formatTime(member.release_time)}</td>
                    <td className="px-3 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${member.is_paid ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
                        {member.is_paid ? 'Paid' : 'Volunteer'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-700">{memberHours(member).toFixed(1)}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold text-gray-900">{member.is_paid ? money(memberPay(member, roles)) : '—'}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => { setEditing(member); setShowModal(true) }} className="rounded-lg p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600" aria-label="Edit"><Pencil className="h-3.5 w-3.5" /></button>
                        {confirmDelete === member.id ? (
                          <button onClick={() => void remove(member.id)} className="rounded-lg bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700">Sure?</button>
                        ) : (
                          <button onClick={() => setConfirmDelete(member.id)} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" aria-label="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
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
