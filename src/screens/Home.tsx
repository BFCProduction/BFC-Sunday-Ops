import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, BarChart2, Calendar, CalendarDays, CheckCircle2,
  ChevronRight, Clock3, ClipboardCheck, ExternalLink, FolderOpen, Home as HomeIcon,
  Newspaper, Plus, Settings as SettingsIcon, Star, TrendingUp, BookOpen,
  type LucideIcon,
} from 'lucide-react'
import { ensureEventChecklistSeeded, supabase } from '../lib/supabase'
import { getChurchDateString } from '../lib/churchTime'
import { changelogUrl, releaseNotes, type ReleaseNote } from '../lib/releaseNotes'
import { useSunday } from '../context/SundayContext'
import { useAdmin } from '../context/adminState'
import { QuickCreateModal } from '../components/layout/QuickCreateModal'
import { Card } from '../components/ui/Card'
import { SectionLabel } from '../components/ui/SectionLabel'
import type { Session } from '../types'

type Screen = 'home' | 'dashboard' | 'checklist' | 'issues' | 'data' | 'evaluation' | 'analytics' | 'settings' | 'docs'

interface HomeProps {
  allSessions: Session[]
  onSessionsChange: (sessions: Session[]) => void
  setScreen: (screen: Screen) => void
}

interface IssueStats {
  active: number
  high: number
}

interface ChecklistStats {
  done: number
  total: number
  pct: number
}

type EventStatus = 'current' | 'today' | 'upcoming' | 'recent' | 'past'

interface Readiness {
  label: string
  className: string
}

const DEFAULT_TIMES: Record<string, string> = {
  'sunday-9am':  '09:00:00',
  'sunday-11am': '11:00:00',
}

function displayTimeValue(session: Session): string | null {
  return session.eventTime || DEFAULT_TIMES[session.serviceTypeSlug] || null
}

function sortTimeValue(session: Session): string {
  return displayTimeValue(session) || '23:59:59'
}

function startMs(session: Session) {
  return new Date(`${session.date}T${sortTimeValue(session).slice(0, 5)}:00`).getTime()
}

function formatDate(date: string, options: Intl.DateTimeFormatOptions = {}) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'short',
    month:   'short',
    day:     'numeric',
    ...options,
  })
}

function formatTime(time: string | null) {
  if (!time) return 'Time TBD'
  const [hour, minute] = time.slice(0, 5).split(':').map(Number)
  const d = new Date()
  d.setHours(hour, minute, 0, 0)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function usesEventScopedChecklist(session: Session) {
  return Boolean(session.id)
}

function eventTypeLabel(session: Session) {
  return session.serviceTypeName
}

function eventTitle(session: Session) {
  return session.name || session.serviceTypeName
}

function eventMeta(session: Session) {
  const time = displayTimeValue(session)
  return [formatDate(session.date), time ? formatTime(time) : null].filter(Boolean).join(' · ')
}

function getStatus(session: Session, today: string, now = Date.now()): EventStatus {
  const start = startMs(session)
  const currentWindowStart = start - (2 * 60 * 60 * 1000)
  const currentWindowEnd = start + (4 * 60 * 60 * 1000)

  if (now >= currentWindowStart && now <= currentWindowEnd) return 'current'
  if (session.date === today) return 'today'
  if (start > now) return 'upcoming'

  const fourteenDays = 14 * 24 * 60 * 60 * 1000
  return now - start <= fourteenDays ? 'recent' : 'past'
}

function statusLabel(status: EventStatus) {
  if (status === 'current') return 'Current'
  if (status === 'today') return 'Today'
  if (status === 'upcoming') return 'Upcoming'
  if (status === 'recent') return 'Recent'
  return 'Past'
}

function statusClasses(status: EventStatus) {
  if (status === 'current') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (status === 'today') return 'bg-blue-50 text-blue-700 border-blue-200'
  if (status === 'upcoming') return 'bg-gray-50 text-gray-700 border-gray-200'
  if (status === 'recent') return 'bg-amber-50 text-amber-700 border-amber-200'
  return 'bg-gray-50 text-gray-500 border-gray-200'
}

function relativeTiming(session: Session, today: string, now = Date.now()) {
  const start = startMs(session)
  const status = getStatus(session, today, now)
  const msPerDay = 24 * 60 * 60 * 1000
  const dayDiff = Math.round((new Date(`${session.date}T12:00:00`).getTime() - new Date(`${today}T12:00:00`).getTime()) / msPerDay)

  if (status === 'current') return 'In the active event window'
  const time = displayTimeValue(session)
  if (session.date === today && start > now) return time ? `Starts at ${formatTime(time)}` : 'Today'
  if (dayDiff === 1) return time ? `Tomorrow at ${formatTime(time)}` : 'Tomorrow'
  if (dayDiff > 1) return `${dayDiff} days out`
  if (dayDiff === -1) return 'Yesterday'
  if (dayDiff < -1) return `${Math.abs(dayDiff)} days ago`
  return time ? `Started at ${formatTime(time)}` : 'Today'
}

function uniqueSessions(sessions: Array<Session | null | undefined>) {
  const seen = new Set<string>()
  return sessions.filter((session): session is Session => {
    if (!session || seen.has(session.id)) return false
    seen.add(session.id)
    return true
  })
}

function groupItemIdsByEvent<Row extends { event_id: string | null; item_id?: number | string | null; id?: number | string }>(
  rows: Row[],
  useId = false,
) {
  const grouped: Record<string, Set<string>> = {}
  for (const row of rows) {
    if (!row.event_id) continue
    const rawId = useId ? row.id : row.item_id
    if (rawId == null) continue
    if (!grouped[row.event_id]) grouped[row.event_id] = new Set()
    grouped[row.event_id].add(String(rawId))
  }
  return grouped
}

function countMatching(completedIds: Set<string> | undefined, itemIds: Set<string>) {
  if (!completedIds) return 0
  let count = 0
  for (const id of completedIds) {
    if (itemIds.has(id)) count += 1
  }
  return count
}

function makeChecklistStats(done: number, total: number): ChecklistStats {
  return {
    done,
    total,
    pct: total > 0 ? Math.round((done / total) * 100) : 0,
  }
}

function getReadiness(
  session: Session,
  status: EventStatus,
  checklist: ChecklistStats | undefined,
  issues: IssueStats | undefined,
  evaluationCount: number | undefined,
  now: number,
): Readiness {
  if ((issues?.high ?? 0) > 0) {
    return { label: 'Needs attention', className: 'bg-red-50 text-red-700 border-red-200' }
  }

  const evalExpected = status === 'recent' || status === 'past' || (status === 'today' && startMs(session) < now)
  if (evalExpected && (evaluationCount ?? 0) === 0) {
    return { label: 'Needs eval', className: 'bg-amber-50 text-amber-700 border-amber-200' }
  }

  if (!checklist || checklist.total === 0) {
    return { label: 'No checklist', className: 'bg-gray-50 text-gray-500 border-gray-200' }
  }

  if (checklist.pct === 100) {
    return {
      label: status === 'recent' || status === 'past' ? 'Complete' : 'Ready',
      className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    }
  }

  if (checklist.done > 0) {
    return { label: 'In progress', className: 'bg-blue-50 text-blue-700 border-blue-200' }
  }

  return status === 'current' || status === 'today'
    ? { label: 'Not started', className: 'bg-amber-50 text-amber-700 border-amber-200' }
    : { label: 'Scheduled', className: 'bg-gray-50 text-gray-700 border-gray-200' }
}

function EventBadge({ session }: { session: Session }) {
  const isEventScoped = usesEventScopedChecklist(session)
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-semibold"
      style={{ backgroundColor: `${session.serviceTypeColor}18`, color: session.serviceTypeColor }}
    >
      {isEventScoped ? <CalendarDays className="w-3 h-3" /> : <Calendar className="w-3 h-3" />}
      {eventTypeLabel(session)}
    </span>
  )
}

function StatusPill({ status }: { status: EventStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-1 text-[11px] font-semibold ${statusClasses(status)}`}>
      {statusLabel(status)}
    </span>
  )
}

function ReadinessPill({ readiness }: { readiness: Readiness }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-1 text-[11px] font-semibold ${readiness.className}`}>
      {readiness.label}
    </span>
  )
}

function ChecklistProgress({ stats }: { stats?: ChecklistStats }) {
  if (!stats || stats.total === 0) {
    return (
      <div className="mt-3">
        <p className="text-xs font-medium text-gray-400">No checklist progress yet</p>
      </div>
    )
  }

  const barColor = stats.pct === 100 ? '#10b981' : stats.pct > 0 ? '#2563eb' : '#d1d5db'

  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-gray-700">{stats.pct}% checklist</span>
        <span className="text-xs font-medium text-gray-400">{stats.done}/{stats.total}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(stats.pct, 100)}%`, backgroundColor: barColor }}
        />
      </div>
    </div>
  )
}

function IssueSignal({
  stats,
  loaded,
  hasError,
}: {
  stats?: IssueStats
  loaded: boolean
  hasError: boolean
}) {
  if (hasError) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500">
        <AlertTriangle className="w-3.5 h-3.5" />
        Issue status unavailable
      </span>
    )
  }

  if (!loaded) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-400">
        <Clock3 className="w-3.5 h-3.5" />
        Checking issues
      </span>
    )
  }

  if (!stats || stats.active === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
        <CheckCircle2 className="w-3.5 h-3.5" />
        No active issues
      </span>
    )
  }

  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${stats.high > 0 ? 'text-red-700' : 'text-amber-700'}`}>
      <AlertTriangle className="w-3.5 h-3.5" />
      {stats.high > 0 ? `${stats.high} high-priority` : `${stats.active} active issue${stats.active === 1 ? '' : 's'}`}
    </span>
  )
}

function EvaluationSignal({
  status,
  count,
  now,
  session,
}: {
  status: EventStatus
  count?: number
  now: number
  session: Session
}) {
  const evalExpected = status === 'recent' || status === 'past' || (status === 'today' && startMs(session) < now)
  if ((count ?? 0) > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
        <Star className="w-3.5 h-3.5" />
        {count} eval{count === 1 ? '' : 's'}
      </span>
    )
  }

  if (evalExpected) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
        <Star className="w-3.5 h-3.5" />
        Needs eval
      </span>
    )
  }

  return null
}

function EventRow({
  session,
  status,
  selected,
  stats,
  checklistStats,
  evaluationCount,
  issueStatsLoaded,
  issueStatsError,
  today,
  now,
  onOpen,
}: {
  session: Session
  status: EventStatus
  selected: boolean
  stats?: IssueStats
  checklistStats?: ChecklistStats
  evaluationCount?: number
  issueStatsLoaded: boolean
  issueStatsError: boolean
  today: string
  now: number
  onOpen: (session: Session) => void
}) {
  const readiness = getReadiness(session, status, checklistStats, stats, evaluationCount, now)

  return (
    <button
      type="button"
      onClick={() => onOpen(session)}
      className={`w-full rounded-lg border bg-white p-4 text-left shadow-sm transition-all hover:border-blue-200 hover:bg-blue-50/40 active:scale-[0.99] ${
        selected ? 'border-blue-300 ring-2 ring-blue-100' : 'border-gray-200'
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className="mt-1 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${session.serviceTypeColor}16`, color: session.serviceTypeColor }}
        >
          {usesEventScopedChecklist(session) ? <CalendarDays className="w-5 h-5" /> : <Calendar className="w-5 h-5" />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="min-w-0 truncate text-sm font-bold text-gray-900">{eventTitle(session)}</h3>
            {selected && <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white">Selected</span>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
            <span className="inline-flex items-center gap-1">
              <Clock3 className="w-3.5 h-3.5" />
              {eventMeta(session)}
            </span>
            <span>{relativeTiming(session, today)}</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusPill status={status} />
            <ReadinessPill readiness={readiness} />
            <EventBadge session={session} />
            <IssueSignal stats={stats} loaded={issueStatsLoaded} hasError={issueStatsError} />
            <EvaluationSignal status={status} count={evaluationCount} now={now} session={session} />
          </div>
          <ChecklistProgress stats={checklistStats} />
        </div>

        <ChevronRight className="mt-3 h-4 w-4 flex-shrink-0 text-gray-300" />
      </div>
    </button>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <Card className="rounded-lg p-5 text-center">
      <p className="text-sm font-medium text-gray-500">{label}</p>
    </Card>
  )
}

function GlobalToolCard({
  title,
  description,
  icon: Icon,
  accent,
  meta,
  onClick,
  href,
  external = false,
}: {
  title: string
  description: string
  icon: LucideIcon
  accent: string
  meta?: string
  onClick?: () => void
  href?: string
  external?: boolean
}) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${accent}14`, color: accent }}
        >
          <Icon className="h-5 w-5" />
        </div>
        {external ? (
          <ExternalLink className="h-4 w-4 text-gray-300 transition-colors group-hover:text-gray-500" />
        ) : (
          <ChevronRight className="h-4 w-4 text-gray-300 transition-colors group-hover:text-gray-500" />
        )}
      </div>
      <div className="mt-4">
        {meta && <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-gray-400">{meta}</p>}
        <h3 className="text-sm font-bold text-gray-950">{title}</h3>
        <p className="mt-1 text-sm leading-5 text-gray-500">{description}</p>
      </div>
    </>
  )
  const className = 'group flex min-h-[158px] w-full flex-col justify-between rounded-lg border border-gray-200 bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md'

  if (href) {
    return (
      <a
        href={href}
        target={external ? '_blank' : undefined}
        rel={external ? 'noopener noreferrer' : undefined}
        className={className}
      >
        {content}
      </a>
    )
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  )
}

function ReleaseNoteCard({ note }: { note: ReleaseNote }) {
  return (
    <article className="flex h-full flex-col rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700">{note.label}</span>
        <span className="text-xs font-semibold text-gray-400">{note.date}</span>
      </div>
      <h3 className="mt-4 text-base font-bold text-gray-950">{note.title}</h3>
      <p className="mt-2 text-sm leading-6 text-gray-600">{note.summary}</p>
      <ul className="mt-4 space-y-2">
        {note.points.map(point => (
          <li key={point} className="flex gap-2 text-sm leading-5 text-gray-600">
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" />
            <span>{point}</span>
          </li>
        ))}
      </ul>
    </article>
  )
}

export function Home({ allSessions, onSessionsChange, setScreen }: HomeProps) {
  const {
    activeEventId, timezone, navigateToEvent,
  } = useSunday()
  const { isAdmin, sessionToken } = useAdmin()
  const [issueStats, setIssueStats] = useState<Record<string, IssueStats>>({})
  const [checklistStats, setChecklistStats] = useState<Record<string, ChecklistStats>>({})
  const [evaluationCounts, setEvaluationCounts] = useState<Record<string, number>>({})
  const [issueStatsLoaded, setIssueStatsLoaded] = useState(true)
  const [issueStatsError, setIssueStatsError] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [showQuickCreate, setShowQuickCreate] = useState(false)

  const today = getChurchDateString(new Date(), timezone)

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  const sortedSessions = useMemo(
    () => [...allSessions].sort((a, b) => startMs(a) - startMs(b)),
    [allSessions],
  )

  const currentEvents = sortedSessions.filter(session => getStatus(session, today, now) === 'current')
  const futureEvents = sortedSessions.filter(session => startMs(session) >= now)
  const recentEvents = [...sortedSessions.filter(session => startMs(session) < now)]
    .reverse()
    .filter(session => getStatus(session, today, now) !== 'past')

  const focusEvent = currentEvents[0] ?? futureEvents[0] ?? recentEvents[0] ?? sortedSessions[0] ?? null
  const upcomingEvents = sortedSessions
    .filter(session => session.id !== focusEvent?.id && (startMs(session) >= now || session.date === today))
    .slice(0, 10)
  const recentDisplayEvents = recentEvents
    .filter(session => session.id !== focusEvent?.id)
    .slice(0, 6)

  const visibleSessions = uniqueSessions([focusEvent, ...upcomingEvents, ...recentDisplayEvents])
  const visibleIds = visibleSessions.map(session => session.id).join('|')

  useEffect(() => {
    let cancelled = false
    const ids = visibleIds ? visibleIds.split('|') : []
    if (ids.length === 0) return

    supabase
      .from('issues')
      .select('event_id, severity, resolved_at')
      .in('event_id', ids)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.warn('Unable to load home issue signals:', error)
          setIssueStats({})
          setIssueStatsError(true)
          setIssueStatsLoaded(true)
          return
        }

        const nextStats: Record<string, IssueStats> = {}
        for (const row of data ?? []) {
          if (!row.event_id || row.resolved_at) continue
          const stats = nextStats[row.event_id] ?? { active: 0, high: 0 }
          stats.active += 1
          if (row.severity === 'High' || row.severity === 'Critical') stats.high += 1
          nextStats[row.event_id] = stats
        }
        setIssueStats(nextStats)
        setIssueStatsError(false)
        setIssueStatsLoaded(true)
      })

    return () => { cancelled = true }
  }, [visibleIds])

  useEffect(() => {
    let cancelled = false
    const ids = visibleIds ? visibleIds.split('|') : []
    if (ids.length === 0) return

    const sessions = ids
      .map(id => sortedSessions.find(session => session.id === id))
      .filter((session): session is Session => Boolean(session))
    const eventScopedChecklistIds = sessions.map(session => session.id)

    async function loadEventSignals() {
      try {
        await Promise.all(
          sessions
            .filter(session => session.serviceTypeSlug.startsWith('sunday'))
            .map(session => ensureEventChecklistSeeded(session.id, session.serviceTypeSlug)),
        )

        const [
          eventScopedItemRes,
          eventScopedCompletionRes,
          evaluationRes,
        ] = await Promise.all([
          eventScopedChecklistIds.length > 0
            ? supabase
              .from('event_checklist_items')
              .select('id, event_id')
              .in('event_id', eventScopedChecklistIds)
            : Promise.resolve({ data: [], error: null }),
          eventScopedChecklistIds.length > 0
            ? supabase
              .from('event_checklist_completions')
              .select('event_id, item_id')
              .in('event_id', eventScopedChecklistIds)
            : Promise.resolve({ data: [], error: null }),
          supabase
            .from('evaluations')
            .select('event_id')
            .in('event_id', ids),
        ])

        if (cancelled) return

        for (const result of [
          eventScopedItemRes,
          eventScopedCompletionRes,
          evaluationRes,
        ]) {
          if (result.error) throw result.error
        }

        const eventScopedItems = groupItemIdsByEvent(
          (eventScopedItemRes.data ?? []) as Array<{ event_id: string | null; id: string }>,
          true,
        )
        const eventScopedCompletions = groupItemIdsByEvent(
          (eventScopedCompletionRes.data ?? []) as Array<{ event_id: string | null; item_id: string | null }>,
        )

        const nextChecklistStats: Record<string, ChecklistStats> = {}
        for (const session of sessions) {
          const itemIds = eventScopedItems[session.id] ?? new Set<string>()
          nextChecklistStats[session.id] = makeChecklistStats(
            countMatching(eventScopedCompletions[session.id], itemIds),
            itemIds.size,
          )
        }

        const nextEvaluationCounts: Record<string, number> = {}
        for (const row of (evaluationRes.data ?? []) as Array<{ event_id: string | null }>) {
          if (!row.event_id) continue
          nextEvaluationCounts[row.event_id] = (nextEvaluationCounts[row.event_id] ?? 0) + 1
        }

        setChecklistStats(nextChecklistStats)
        setEvaluationCounts(nextEvaluationCounts)
      } catch (error) {
        if (cancelled) return
        console.warn('Unable to load home event signals:', error)
        setChecklistStats({})
        setEvaluationCounts({})
      }
    }

    void loadEventSignals()
    return () => { cancelled = true }
  }, [visibleIds, sortedSessions])

  function openEvent(session: Session, screen: Screen = 'dashboard') {
    navigateToEvent(session.id)
    setScreen(screen)
  }

  const totalUpcoming = sortedSessions.filter(session => startMs(session) >= now || session.date === today).length
  const currentCount = currentEvents.length
  const focusStatus = focusEvent ? getStatus(focusEvent, today, now) : null
  const focusChecklistStats = focusEvent ? checklistStats[focusEvent.id] : undefined
  const focusIssueStats = focusEvent ? issueStats[focusEvent.id] : undefined
  const focusEvaluationCount = focusEvent ? evaluationCounts[focusEvent.id] : undefined
  const focusReadiness = focusEvent && focusStatus
    ? getReadiness(focusEvent, focusStatus, focusChecklistStats, focusIssueStats, focusEvaluationCount, now)
    : null

  return (
    <div className="fade-in min-h-full bg-gray-50">
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-6 md:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold uppercase tracking-widest text-blue-700">
                <HomeIcon className="h-3.5 w-3.5" />
                Sunday Ops
              </div>
              <h1 className="mt-3 text-3xl font-bold tracking-normal text-gray-950">Home</h1>
            </div>

          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl space-y-8 p-4 md:p-6">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <SectionLabel>Global Tools</SectionLabel>
            <span className="text-xs font-medium text-gray-400">App-level navigation</span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            <GlobalToolCard
              title="Event Timeline"
              description="Current, upcoming, and recent services with readiness signals."
              icon={CalendarDays}
              accent="#2563eb"
              meta="Events"
              href="#events"
            />
            {isAdmin && (
              <GlobalToolCard
                title="Analytics"
                description="Trends, KPIs, and the data explorer for event-native records."
                icon={TrendingUp}
                accent="#7c3aed"
                meta="Admin"
                onClick={() => setScreen('analytics')}
              />
            )}
            <GlobalToolCard
              title="Production Support"
              description="Reference docs and production team support resources."
              icon={BookOpen}
              accent="#0f766e"
              meta="Support"
              href="https://bfcproduction.github.io/bfc-production-support/"
              external
            />
            <GlobalToolCard
              title="App Updates"
              description="Recent Sunday Ops changes in a public, release-note style feed."
              icon={Newspaper}
              accent="#ea580c"
              meta="What's new"
              href="#whats-new"
            />
            {isAdmin && (
              <GlobalToolCard
                title="Settings"
                description="Timezone, reporting, checklist templates, and People & Access."
                icon={SettingsIcon}
                accent="#4b5563"
                meta="Admin"
                onClick={() => setScreen('settings')}
              />
            )}
            {isAdmin && (
              <GlobalToolCard
                title="Create Event"
                description="Add a Sunday service, standalone event, or template-backed workflow."
                icon={Plus}
                accent="#16a34a"
                meta="Admin"
                onClick={() => setShowQuickCreate(true)}
              />
            )}
          </div>
        </section>

        <section>
          <div>
            <SectionLabel>{currentCount > 0 ? 'Focus Event' : 'Next Event'}</SectionLabel>
            {focusEvent ? (
              <Card className="overflow-hidden rounded-lg">
                <div className="border-b border-gray-100 bg-white p-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        {focusStatus && <StatusPill status={focusStatus} />}
                        {focusReadiness && <ReadinessPill readiness={focusReadiness} />}
                        <EventBadge session={focusEvent} />
                      </div>
                      <h2 className="truncate text-2xl font-bold text-gray-950">{eventTitle(focusEvent)}</h2>
                      <p className="mt-1 text-sm text-gray-500">{eventMeta(focusEvent)} · {relativeTiming(focusEvent, today, now)}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <IssueSignal stats={focusIssueStats} loaded={issueStatsLoaded} hasError={issueStatsError} />
                        {focusStatus && (
                          <EvaluationSignal
                            status={focusStatus}
                            count={focusEvaluationCount}
                            now={now}
                            session={focusEvent}
                          />
                        )}
                      </div>
                      <ChecklistProgress stats={focusChecklistStats} />
                    </div>

                    <button
                      type="button"
                      onClick={() => openEvent(focusEvent)}
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-800"
                    >
                      Open Event
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 border-t border-gray-100 md:grid-cols-5">
                  {[
                    { label: 'Docs',       icon: FolderOpen,     screen: 'docs'       as Screen },
                    { label: 'Checklist',  icon: ClipboardCheck, screen: 'checklist'  as Screen },
                    { label: 'Issues',     icon: AlertTriangle,  screen: 'issues'     as Screen },
                    { label: 'Data',       icon: BarChart2,      screen: 'data'       as Screen },
                    { label: 'Eval',       icon: Star,           screen: 'evaluation' as Screen },
                  ].map(action => {
                    const Icon = action.icon
                    return (
                      <button
                        key={action.label}
                        type="button"
                        onClick={() => openEvent(focusEvent, action.screen)}
                        className="flex items-center gap-2 border-r border-gray-100 px-4 py-3 text-left text-sm font-semibold text-gray-700 transition-colors last:border-r-0 hover:bg-blue-50 hover:text-blue-700"
                      >
                        <Icon className="h-4 w-4 flex-shrink-0" />
                        <span className="truncate">{action.label}</span>
                      </button>
                    )
                  })}
                </div>
              </Card>
            ) : (
              <EmptyState label="No events found yet." />
            )}
          </div>
        </section>

        <section id="events" className="scroll-mt-24">
          <div className="mb-2 flex items-center justify-between">
            <SectionLabel>Current / Upcoming</SectionLabel>
            <span className="text-xs font-medium text-gray-400">{totalUpcoming} event{totalUpcoming === 1 ? '' : 's'}</span>
          </div>
          {upcomingEvents.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {upcomingEvents.map(session => (
                <EventRow
                  key={session.id}
                  session={session}
                  status={getStatus(session, today, now)}
                  selected={session.id === activeEventId}
                  stats={issueStats[session.id]}
                  checklistStats={checklistStats[session.id]}
                  evaluationCount={evaluationCounts[session.id]}
                  issueStatsLoaded={issueStatsLoaded}
                  issueStatsError={issueStatsError}
                  today={today}
                  now={now}
                  onOpen={openEvent}
                />
              ))}
            </div>
          ) : (
            <EmptyState label="No upcoming events after the focus event." />
          )}
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <SectionLabel>Recent Events</SectionLabel>
            <span className="text-xs font-medium text-gray-400">Last 14 days</span>
          </div>
          {recentDisplayEvents.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {recentDisplayEvents.map(session => (
                <EventRow
                  key={session.id}
                  session={session}
                  status={getStatus(session, today, now)}
                  selected={session.id === activeEventId}
                  stats={issueStats[session.id]}
                  checklistStats={checklistStats[session.id]}
                  evaluationCount={evaluationCounts[session.id]}
                  issueStatsLoaded={issueStatsLoaded}
                  issueStatsError={issueStatsError}
                  today={today}
                  now={now}
                  onOpen={openEvent}
                />
              ))}
            </div>
          ) : (
            <EmptyState label="Recent events will appear here after they pass." />
          )}
        </section>

        <section id="whats-new" className="scroll-mt-24">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <SectionLabel>What&apos;s New</SectionLabel>
              <h2 className="mt-2 text-xl font-bold text-gray-950">Recent Sunday Ops updates</h2>
            </div>
            <a
              href={changelogUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:text-blue-800"
            >
              Full changelog
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {releaseNotes.map(note => (
              <ReleaseNoteCard key={`${note.date}-${note.title}`} note={note} />
            ))}
          </div>
        </section>
      </div>

      {showQuickCreate && (
        <QuickCreateModal
          sessionToken={sessionToken}
          onCreated={(newId, freshSessions) => {
            onSessionsChange(freshSessions)
            navigateToEvent(newId)
            setScreen('dashboard')
          }}
          onClose={() => setShowQuickCreate(false)}
        />
      )}
    </div>
  )
}
