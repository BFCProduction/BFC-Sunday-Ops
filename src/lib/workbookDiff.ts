// ─────────────────────────────────────────────────────────────────────────────
// workbookDiff.ts — human-readable change summary between two workbook schedule
// snapshots. Powers "Send Update": what changed since the last time the schedule
// was sent to crew.
// ─────────────────────────────────────────────────────────────────────────────

export interface DiffScheduleItem {
  id: string
  title: string
  scheduled_date: string
  start_time: string | null
  end_time: string | null
  location_id: string | null
  departments: string[]
}

export interface DiffEvent {
  id: string
  name: string
  eventTime: string | null
  eventEndTime: string | null
}

function fmtTime(time: string | null): string {
  if (!time) return 'TBD'
  const [hour, minute] = time.slice(0, 5).split(':').map(Number)
  if (Number.isNaN(hour)) return time
  const suffix = hour >= 12 ? 'PM' : 'AM'
  const h12 = hour % 12 || 12
  return `${h12}:${String(minute).padStart(2, '0')} ${suffix}`
}

function fmtRange(start: string | null, end: string | null): string {
  if (!start) return 'TBD'
  return end ? `${fmtTime(start)}–${fmtTime(end)}` : fmtTime(start)
}

function fmtDate(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function sameDepartments(a: string[], b: string[]): boolean {
  return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())
}

export function workbookScheduleDiff(
  prevItems: DiffScheduleItem[],
  currItems: DiffScheduleItem[],
  prevEvents: DiffEvent[],
  currEvents: DiffEvent[],
  locationName: (id: string | null) => string,
): string[] {
  const lines: string[] = []

  // ── Events ──
  const prevEvById = new Map(prevEvents.map(event => [event.id, event]))
  const currEvById = new Map(currEvents.map(event => [event.id, event]))
  for (const event of currEvents) {
    if (!prevEvById.has(event.id)) lines.push(`Added event: ${event.name}`)
  }
  for (const event of prevEvents) {
    if (!currEvById.has(event.id)) lines.push(`Removed event: ${event.name}`)
  }
  for (const event of currEvents) {
    const prev = prevEvById.get(event.id)
    if (!prev) continue
    if (prev.eventTime !== event.eventTime || prev.eventEndTime !== event.eventEndTime) {
      lines.push(`${event.name}: time ${fmtRange(prev.eventTime, prev.eventEndTime)} → ${fmtRange(event.eventTime, event.eventEndTime)}`)
    }
  }

  // ── Schedule items ──
  const prevById = new Map(prevItems.map(item => [item.id, item]))
  const currById = new Map(currItems.map(item => [item.id, item]))
  for (const item of currItems) {
    if (!prevById.has(item.id)) {
      lines.push(`Added: ${item.title} — ${fmtDate(item.scheduled_date)} ${fmtRange(item.start_time, item.end_time)}`)
    }
  }
  for (const item of prevItems) {
    if (!currById.has(item.id)) lines.push(`Removed: ${item.title}`)
  }
  for (const item of currItems) {
    const prev = prevById.get(item.id)
    if (!prev) continue
    const changes: string[] = []
    if (prev.scheduled_date !== item.scheduled_date) {
      changes.push(`date ${fmtDate(prev.scheduled_date)} → ${fmtDate(item.scheduled_date)}`)
    }
    if (prev.start_time !== item.start_time || prev.end_time !== item.end_time) {
      changes.push(`time ${fmtRange(prev.start_time, prev.end_time)} → ${fmtRange(item.start_time, item.end_time)}`)
    }
    if (prev.location_id !== item.location_id) {
      changes.push(`room ${locationName(prev.location_id)} → ${locationName(item.location_id)}`)
    }
    if (!sameDepartments(prev.departments, item.departments)) {
      changes.push(`departments ${prev.departments.join(', ') || 'none'} → ${item.departments.join(', ') || 'none'}`)
    }
    if (changes.length > 0) lines.push(`${item.title}: ${changes.join('; ')}`)
  }

  return lines
}
