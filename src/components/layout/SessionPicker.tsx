import { useEffect, useMemo, useRef, useState } from 'react'
import { Calendar, CalendarDays, Loader2, Search, Trash2, X } from 'lucide-react'
import type { Session } from '../../types'

interface Props {
  allSessions: Session[]
  activeEventId: string
  onSelect: (id: string) => void
  onClose: () => void
  isAdmin?: boolean
  onDelete?: (sessionId: string) => Promise<void>
}

// ── Grouping helpers ───────────────────────────────────────────────────────────

interface DateGroup {
  date: string
  events: Session[]
}

interface MonthGroup {
  monthKey: string  // "2026-04"
  label: string     // "April 2026"
  dateGroups: DateGroup[]
}

function groupIntoMonths(sessions: Session[]): MonthGroup[] {
  const byDate = new Map<string, DateGroup>()
  for (const s of sessions) {
    if (!byDate.has(s.date)) byDate.set(s.date, { date: s.date, events: [] })
    byDate.get(s.date)!.events.push(s)
  }

  const byMonth = new Map<string, MonthGroup>()
  for (const [date, dg] of byDate) {
    const monthKey = date.slice(0, 7)
    if (!byMonth.has(monthKey)) {
      const d = new Date(date + 'T12:00:00')
      byMonth.set(monthKey, {
        monthKey,
        label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        dateGroups: [],
      })
    }
    byMonth.get(monthKey)!.dateGroups.push(dg)
  }
  return Array.from(byMonth.values())
}

function formatDayLabel(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function sessionTimeValue(s: Session): string {
  if (s.eventTime) return s.eventTime
  if (s.serviceTypeSlug === 'sunday-9am') return '09:00:00'
  if (s.serviceTypeSlug === 'sunday-11am') return '11:00:00'
  return '23:59:59'
}

function compareByTime(a: Session, b: Session, descending = false): number {
  const diff = sessionTimeValue(a).localeCompare(sessionTimeValue(b))
  return descending ? -diff : diff
}

// Compatibility bridge only; the picker still presents a single event list.
function usesEventScopedChecklist(s: Session) {
  return s.legacySpecialEventId !== null || s.serviceTypeSlug === 'special'
}

function eventTypeLabel(s: Session) {
  return usesEventScopedChecklist(s) ? 'Event' : s.serviceTypeName
}

function eventTimeLabel(s: Session) {
  if (!s.eventTime && usesEventScopedChecklist(s)) return 'Time TBD'
  return sessionTimeValue(s).slice(0, 5)
}

function eventTitle(s: Session) {
  return s.name || s.serviceTypeName
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SessionPicker({ allSessions, activeEventId, onSelect, onClose, isAdmin, onDelete }: Props) {
  const [query, setQuery] = useState('')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [deletingId,   setDeletingId]   = useState<string | null>(null)
  const [deleteError,  setDeleteError]  = useState('')
  const inputRef  = useRef<HTMLInputElement>(null)
  const activeRef = useRef<HTMLDivElement>(null)
  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    inputRef.current?.focus()
    setTimeout(() => activeRef.current?.scrollIntoView({ block: 'center', behavior: 'instant' }), 50)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleDelete(id: string) {
    if (!onDelete) return
    setDeletingId(id)
    setDeleteError('')
    setConfirmingId(null)
    try {
      await onDelete(id)
      onClose()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete event')
      setDeletingId(null)
    }
  }

  function handleDeleteClick(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    if (confirmingId === id) {
      void handleDelete(id)
    } else {
      setConfirmingId(id)
    }
  }

  const canDelete = isAdmin && !!onDelete && allSessions.length > 1

  const q = query.trim().toLowerCase()

  const searchResults = useMemo(() => {
    if (!q) return null
    return allSessions.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.date.includes(q) ||
      formatDayLabel(s.date).toLowerCase().includes(q)
    )
  }, [allSessions, q])

  const { upcomingMonths, pastMonths } = useMemo(() => {
    if (searchResults) return { upcomingMonths: [], pastMonths: [] }
    const upcoming = allSessions.filter(s => s.date >= today)
    const past = [...allSessions.filter(s => s.date < today)].reverse()
    return {
      upcomingMonths: groupIntoMonths(upcoming),
      pastMonths: groupIntoMonths(past),
    }
  }, [allSessions, searchResults, today])

  function handleSelect(id: string) {
    onSelect(id)
    onClose()
  }

  // ── Delete button ─────────────────────────────────────────────────────────────

  function DeleteBtn({ s }: { s: Session }) {
    if (!canDelete) return null
    const isDeleting   = deletingId === s.id
    const isConfirming = confirmingId === s.id

    return (
      <button
        onClick={e => handleDeleteClick(e, s.id)}
        onMouseLeave={() => { if (confirmingId === s.id) setConfirmingId(null) }}
        disabled={isDeleting}
        className={`flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold transition-all
          opacity-0 group-hover:opacity-100 focus:opacity-100
          ${isConfirming
            ? 'bg-red-100 text-red-700 hover:bg-red-200 opacity-100'
            : 'text-gray-400 hover:text-red-600 hover:bg-red-50'
          }
          disabled:opacity-40 disabled:cursor-not-allowed`}
        title={isConfirming ? 'Click again to confirm deletion' : 'Delete this event'}
      >
        {isDeleting
          ? <Loader2 className="w-3 h-3 animate-spin" />
          : isConfirming
            ? 'Are you sure?'
            : <Trash2 className="w-3.5 h-3.5" />
        }
      </button>
    )
  }

  // ── Row components ────────────────────────────────────────────────────────────

  function EventRow({ s }: { s: Session }) {
    const isActive = s.id === activeEventId
    const isEventScoped = usesEventScopedChecklist(s)
    const Icon = isEventScoped ? CalendarDays : Calendar
    return (
      <div
        ref={isActive ? activeRef : undefined}
        className={`group flex items-center gap-1 px-2 py-1 rounded-lg transition-all ${
          isActive ? 'bg-blue-50 ring-1 ring-blue-300' : 'hover:bg-gray-50'
        }`}
      >
        <button
          onClick={() => handleSelect(s.id)}
          className="flex-1 flex items-center gap-2 px-1 py-1 text-sm text-left min-w-0"
        >
          <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: s.serviceTypeColor }} />
          <div className="min-w-0 flex-1">
            <p className={`truncate font-medium ${isActive ? 'text-blue-800' : 'text-gray-700'}`}>
              {eventTitle(s)}
            </p>
            <p className="truncate text-xs text-gray-400">
              {formatDayLabel(s.date)} · {eventTimeLabel(s)} · {eventTypeLabel(s)}
            </p>
          </div>
          {isActive && <span className="text-xs font-semibold text-blue-600 flex-shrink-0">Current</span>}
        </button>
        <DeleteBtn s={s} />
      </div>
    )
  }

  function DateRow({ dg, descending = false }: { dg: DateGroup; descending?: boolean }) {
    return (
      <div className="py-1.5">
        {[...dg.events].sort((a, b) => compareByTime(a, b, descending)).map(s => <EventRow key={s.id} s={s} />)}
      </div>
    )
  }

  function MonthSection({ mg, descending = false }: { mg: MonthGroup; descending?: boolean }) {
    return (
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 px-3 pt-4 pb-1">
          {mg.label}
        </p>
        <div className="divide-y divide-gray-50">
          {mg.dateGroups.map(dg => <DateRow key={dg.date} dg={dg} descending={descending} />)}
        </div>
      </div>
    )
  }

  const upcomingCount = allSessions.filter(s => s.date >= today).length
  const pastCount = allSessions.filter(s => s.date < today).length

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by name or date…"
            className="flex-1 text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
          />
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {searchResults ? (
            <div className="p-2">
              {searchResults.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-8">No events match "{query}"</p>
              ) : (
                searchResults.map(s => <EventRow key={s.id} s={s} />)
              )}
            </div>
          ) : (
            <>
              {upcomingCount > 0 && (
                <div>
                  <div className="sticky top-0 bg-white border-b border-gray-100 px-3 py-2 flex items-center justify-between">
                    <p className="text-xs font-bold text-gray-700 uppercase tracking-wider">Upcoming</p>
                    <p className="text-xs text-gray-400">{upcomingCount} event{upcomingCount !== 1 ? 's' : ''}</p>
                  </div>
                  {upcomingMonths.map(mg => <MonthSection key={mg.monthKey} mg={mg} />)}
                </div>
              )}
              {pastCount > 0 && (
                <div>
                  <div className="sticky top-0 bg-white border-b border-gray-100 px-3 py-2 flex items-center justify-between">
                    <p className="text-xs font-bold text-gray-700 uppercase tracking-wider">Past</p>
                    <p className="text-xs text-gray-400">{pastCount} event{pastCount !== 1 ? 's' : ''}</p>
                  </div>
                  {pastMonths.map(mg => <MonthSection key={mg.monthKey} mg={mg} descending />)}
                </div>
              )}
            </>
          )}
        </div>

        {/* Error footer */}
        {deleteError && (
          <div className="px-4 py-2 border-t border-red-100 bg-red-50">
            <p className="text-xs text-red-600">{deleteError}</p>
          </div>
        )}
      </div>
    </div>
  )
}
