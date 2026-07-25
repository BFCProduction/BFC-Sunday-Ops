import type { AppUser } from './adminApi'
import type { CrewRole, Session, WorkbookCrewMember } from '../types'
import type { CallSheetPerson } from './generateCallSheetHtml'
import type { PayLine } from './generatePayReportHtml'

function toMinutes(time: string | null): number | null {
  if (!time) return null
  const [hour, minute] = time.slice(0, 5).split(':').map(Number)
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null
  return hour * 60 + minute
}

export function workbookCrewPersonName(member: WorkbookCrewMember, users: AppUser[]): string {
  if (member.is_open) return 'TBD'
  if (member.user_id) return users.find(user => user.id === member.user_id)?.name ?? 'Unknown'
  return member.person_name ?? 'Unknown'
}

/** Per-event hours: this crew row's call → release, rounded to a half hour. */
export function workbookCrewMemberHours(member: WorkbookCrewMember): number {
  const call = toMinutes(member.call_time)
  const release = toMinutes(member.release_time)
  if (call === null || release === null || release <= call) return 0
  return Math.round(((release - call) / 60) * 2) / 2
}

export function workbookCrewMemberPay(member: WorkbookCrewMember, roles: CrewRole[]): number {
  if (!member.is_paid) return 0
  const rate = member.role_id ? (roles.find(role => role.id === member.role_id)?.hourly_rate ?? 0) : 0
  return Math.round(workbookCrewMemberHours(member) * rate * 100) / 100
}

export function buildWorkbookPayLines(
  crew: WorkbookCrewMember[],
  users: AppUser[],
  roles: CrewRole[],
): { lines: PayLine[]; totalHours: number; totalPay: number } {
  const map = new Map<string, PayLine>()
  for (const member of crew) {
    if (!member.is_paid || member.is_open) continue
    const key = member.user_id ?? `name:${member.person_name}`
    const line = map.get(key) ?? { name: workbookCrewPersonName(member, users), hours: 0, pay: 0 }
    line.hours = Math.round((line.hours + workbookCrewMemberHours(member)) * 2) / 2
    line.pay = Math.round((line.pay + workbookCrewMemberPay(member, roles)) * 100) / 100
    map.set(key, line)
  }
  const lines = [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
  return {
    lines,
    totalHours: Math.round(lines.reduce((sum, line) => sum + line.hours, 0) * 2) / 2,
    totalPay: Math.round(lines.reduce((sum, line) => sum + line.pay, 0) * 100) / 100,
  }
}

export function buildWorkbookCallSheetPeople(
  crew: WorkbookCrewMember[],
  linkedEvents: Session[],
  users: AppUser[],
  roles: CrewRole[],
): CallSheetPerson[] {
  const byPerson = new Map<string, CallSheetPerson>()
  for (const member of crew) {
    if (member.is_open) continue
    const key = member.user_id ?? `name:${member.person_name}`
    const entry = byPerson.get(key) ?? { name: workbookCrewPersonName(member, users), shifts: [] }
    entry.shifts.push({
      date: member.scheduled_date,
      event: member.event_id ? linkedEvents.find(event => event.id === member.event_id)?.name ?? null : null,
      role: member.role_id ? roles.find(role => role.id === member.role_id)?.name ?? null : null,
      call: member.call_time,
      release: member.release_time,
    })
    byPerson.set(key, entry)
  }
  return [...byPerson.values()]
    .map(person => ({
      ...person,
      shifts: [...person.shifts].sort((a, b) => a.date.localeCompare(b.date) || (a.call ?? '').localeCompare(b.call ?? '')),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
