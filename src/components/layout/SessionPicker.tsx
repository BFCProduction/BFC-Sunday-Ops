import { useEffect, useMemo, useRef, useState } from 'react'
import { Calendar, CalendarDays, Search, X } from 'lucide-react'
import type { Session } from '../../types'

interface Props {
  allSessions: Session[]
  activeEventId: string
  onSelect: (id: string) => void
  onClose: () => void
}

// ── Grouping helpers ───────────────────────────────────────────────────────────

interface DateGroup {
  date: string
  sundays: Session[]   // sunday-9am, sunday-11am
  specials: Session[]  // special events
}

interface MonthGroup {
  monthKey: string  // "2026-04"
  label: string     // "April 2026"
  dateGroups: DateGroup[]
}

function groupIntoMonths(sessions: Session[]): MonthGroup[] {
  const byDate = new Map<string, DateGroup>()
  for (const s of sessions) {
    if (!byDate.has(s.date)) byDate.set(s.date, { date: s.date, sundays: [], specials: [] })
    const g = byDate.get(s.date)!
    if (s.serviceTypeSlug === 'special') g.specials.push(s)
    else g.sundays.push(s)
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

// ── Component ─────────────────────────────────────────────────────────────────

export function SessionPicker({ allSessions, activeEventId, onSelect, onClose }: Props) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const activeRef = useRef<HTMLButtonElement>(null)
  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    inputRef.current?.focus()
    // Scroll active item into view after mount
    setTimeout(() => activeRef.current?.scrollIntoView({ block: 'center', behavior: 'instant' }), 50)
  }, [])

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const q = query.trim().toLowerCase()

  // When searching: flat filtered list
  const searchResults = useMemo(() => {
    if (!q) return null
    return allSessions.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.date.includes(q) ||
      formatDayLabel(s.date).toLowerCase().includes(q)
    )
  }, [allSessions, q])

  // When not searching: split upcoming/past, group by month
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

  // ── Render helpers ───────────────────────────────────────────────────────────

  function SundayRow({ s }: { s: Session }) {
    const isActive = s.id === activeEventId
    const label = s.serviceTypeSlug === 'sunday-9am' ? '9:00 AM' : '11:00 AM'
    return (
      <button
        ref={isActive ? activeRef : undefined}
        onClick={() => handleSelect(s.id)}
        className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-sm ${
          isActive
            ? 'bg-blue-50 text-blue-800 ring-1 ring-blue-300'
            : 'hover:bg-gray-50 text-gray-700'
        }`}
      >
        <Calendar className="w-3.5 h-3.5 flex-shrink-0" style={{ color: s.serviceTypeColor }} />
        <span className="flex-1 truncate font-medium">{label}</span>
        <span className="text-xs text-gray-400 flex-shrink-0">{formatDayLabel(s.date)}</span>
      </button>
    )
  }

  function SpecialRow({ s }: { s: Session }) {
    const isActive = s.id === activeEventId
    return (
      <button
        ref={isActive ? activeRef : undefined}
        onClick={() => handleSelect(s.id)}
        className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-sm ${
          isActive
            ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-300'
            : 'hover:bg-gray-50 text-gray-700'
        }`}
      >
        <CalendarDays className="w-3.5 h-3.5 flex-shrink-0" style={{ color: s.serviceTypeColor }} />
        <span className="flex-1 truncate font-medium">{s.name}</span>
        <span className="text-xs text-gray-400 flex-shrink-0">{formatDayLabel(s.date)}</span>
      </button>
    )
  }

  function DateRow({ dg }: { dg: DateGroup }) {
    return (
      <div className="py-1.5">
        {[...dg.sundays].sort((a, b) => a.serviceTypeSlug.localeCompare(b.serviceTypeSlug)).map(s => <SundayRow key={s.id} s={s} />)}
        {dg.specials.map(s => <SpecialRow key={s.id} s={s} />)}
      </div>
    )
  }

  function MonthSection({ mg }: { mg: MonthGroup }) {
    return (
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 px-3 pt-4 pb-1">
          {mg.label}
        </p>
        <div className="divide-y divide-gray-50">
          {mg.dateGroups.map(dg => <DateRow key={dg.date} dg={dg} />)}
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
            /* Search results — flat list */
            <div className="p-2">
              {searchResults.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-8">No sessions match "{query}"</p>
              ) : (
                searchResults.map(s => {
                  const isActive = s.id === activeEventId
                  const isSpecial = s.serviceTypeSlug === 'special'
                  return (
                    <button
                      key={s.id}
                      ref={isActive ? activeRef : undefined}
                      onClick={() => handleSelect(s.id)}
                      className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                        isActive ? 'bg-blue-50 ring-1 ring-blue-200' : 'hover:bg-gray-50'
                      }`}
                    >
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0 mt-0.5"
                        style={{ backgroundColor: s.serviceTypeColor }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{isSpecial ? s.name : s.serviceTypeName}</p>
                        <p className="text-xs text-gray-400">{formatDayLabel(s.date)}</p>
                      </div>
                      {isActive && <span className="text-xs font-semibold text-blue-600">Current</span>}
                    </button>
                  )
                })
              )}
            </div>
          ) : (
            /* Grouped view */
            <>
              {upcomingCount > 0 && (
                <div>
                  <div className="sticky top-0 bg-white border-b border-gray-100 px-3 py-2 flex items-center justify-between">
                    <p className="text-xs font-bold text-gray-700 uppercase tracking-wider">Upcoming</p>
                    <p className="text-xs text-gray-400">{upcomingCount} session{upcomingCount !== 1 ? 's' : ''}</p>
                  </div>
                  {upcomingMonths.map(mg => <MonthSection key={mg.monthKey} mg={mg} />)}
                </div>
              )}
              {pastCount > 0 && (
                <div>
                  <div className="sticky top-0 bg-white border-b border-gray-100 px-3 py-2 flex items-center justify-between">
                    <p className="text-xs font-bold text-gray-700 uppercase tracking-wider">Past</p>
                    <p className="text-xs text-gray-400">{pastCount} session{pastCount !== 1 ? 's' : ''}</p>
                  </div>
                  {pastMonths.map(mg => <MonthSection key={mg.monthKey} mg={mg} />)}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
