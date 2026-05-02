import { useEffect, useState } from 'react'
import { AlertTriangle, ChevronRight, ClipboardCheck, BarChart2, Star, Music, Type, Film, Layers } from 'lucide-react'
import { ensureEventChecklistSeeded, supabase } from '../lib/supabase'
import { CHECKLIST_ROLE_OPTIONS, ROLE_COLORS } from '../data/checklist'
import { useSunday } from '../context/SundayContext'
import { useAuth } from '../context/authState'
import { ApiError, fetchPcoPlanTimes, fetchPcoPlanItems, type PcoPlanTimeResult, type PcoPlanItemResult } from '../lib/adminApi'
import { initiatePCOLogin } from '../lib/pcoAuth'
import { getChurchDateString } from '../lib/churchTime'
import { Card } from '../components/ui/Card'
import { SectionLabel } from '../components/ui/SectionLabel'
import type { EventChecklistItem, Issue } from '../types'

type Screen = 'dashboard' | 'checklist' | 'issues' | 'data' | 'evaluation'

interface DashboardProps {
  setScreen: (s: Screen) => void
}

interface ScheduleItem {
  id: string
  time: string
  label: string
  minuteOfDay: number | null
}

const FALLBACK_SCHEDULE: ScheduleItem[] = [
  { id: 'meeting',    time: '7:00 AM',  label: 'Production Meeting', minuteOfDay: 7 * 60 },
  { id: 'rehearsal1', time: '7:45 AM',  label: 'Rehearsal Begins',   minuteOfDay: 7 * 60 + 45 },
  { id: 'proj',       time: '8:15 AM',  label: 'Projectors On',      minuteOfDay: 8 * 60 + 15 },
  { id: 'encoders1',  time: '8:40 AM',  label: 'Encoders Start',     minuteOfDay: 8 * 60 + 40 },
  { id: 'service1',   time: '9:00 AM',  label: '1st Service',        minuteOfDay: 9 * 60 },
  { id: 'flip',       time: '10:00 AM', label: 'Flip Stage',         minuteOfDay: 10 * 60 },
  { id: 'rehearsal2', time: '10:20 AM', label: 'Rehearsal Begins',   minuteOfDay: 10 * 60 + 20 },
  { id: 'encoders2',  time: '10:40 AM', label: 'Encoders Start',     minuteOfDay: 10 * 60 + 40 },
  { id: 'service2',   time: '11:00 AM', label: '2nd Service',        minuteOfDay: 11 * 60 },
  { id: 'release',    time: '12:00 PM', label: 'Release',            minuteOfDay: 12 * 60 },
]

function getMinuteOfDay(date: Date, timezone: string): number | null {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour:     '2-digit',
    minute:   '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)

  const hour = Number(parts.find(part => part.type === 'hour')?.value)
  const min  = Number(parts.find(part => part.type === 'minute')?.value)
  if (Number.isNaN(hour) || Number.isNaN(min)) return null
  return hour * 60 + min
}

function formatScheduleTime(iso: string, timezone: string) {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour:     'numeric',
    minute:   '2-digit',
    timeZone: timezone,
  })
}

function formatScheduleLabel(planTime: PcoPlanTimeResult) {
  const name = planTime.name?.trim()
  if (name) return name
  if (!planTime.time_type) return 'Schedule Item'
  return planTime.time_type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
}

function planTimeToScheduleItem(planTime: PcoPlanTimeResult, timezone: string): ScheduleItem {
  const startsAt = new Date(planTime.starts_at)
  return {
    id:          `pco-${planTime.id}`,
    time:        formatScheduleTime(planTime.starts_at, timezone),
    label:       formatScheduleLabel(planTime),
    minuteOfDay: getMinuteOfDay(startsAt, timezone),
  }
}

function getScheduleStatus(
  minuteOfDay: number | null,
  eventDate: string,
  timezone: string,
): 'done' | 'active' | 'upcoming' {
  if (minuteOfDay == null) return 'upcoming'

  if (eventDate) {
    const today = getChurchDateString(new Date(), timezone)
    if (eventDate < today) return 'done'
    if (eventDate > today) return 'upcoming'
  }

  const totalMin = getMinuteOfDay(new Date(), timezone)
  if (totalMin == null) return 'upcoming'
  if (totalMin > minuteOfDay + 30) return 'done'
  if (totalMin >= minuteOfDay - 5) return 'active'
  return 'upcoming'
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${m}m`
}

function RosItemIcon({ type }: { type: string }) {
  if (type === 'song')   return <Music   className="w-3 h-3 flex-shrink-0 text-purple-400" />
  if (type === 'media')  return <Film    className="w-3 h-3 flex-shrink-0 text-blue-400" />
  if (type === 'header') return <Type    className="w-3 h-3 flex-shrink-0 text-gray-300" />
  return                        <Layers  className="w-3 h-3 flex-shrink-0 text-gray-400" />
}

function RunOfShow({ items, totalLabel, timezone }: { items: PcoPlanItemResult[]; totalLabel: string | null; timezone: string }) {
  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', timeZone: timezone,
    })
  }

  // Determine if any item has a computed time so we know whether to reserve the time column
  const hasTimes = items.some(i => i.computed_starts_at)

  return (
    <Card className="overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-shrink-0">
        <p className="text-gray-900 text-sm font-semibold">Run of Show</p>
        <div className="flex items-center gap-2">
          {totalLabel && <span className="text-[9px] text-gray-400 font-medium">{totalLabel}</span>}
          <span className="text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-1.5 py-0.5 rounded-full font-bold">PCO</span>
        </div>
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: 480 }}>
        {items.map((item, i) => {
          const isHeader = item.item_type === 'header'
          if (isHeader) {
            return (
              <div key={item.id} className={`px-4 py-1.5 bg-gray-50 ${i > 0 ? 'border-t border-gray-100' : ''}`}>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{item.title}</span>
              </div>
            )
          }
          return (
            <div key={item.id} className={`flex items-start gap-2.5 px-4 py-2 ${i < items.length - 1 ? 'border-b border-gray-50' : ''}`}>
              {/* Time */}
              {hasTimes && (
                <span className="text-[10px] text-gray-400 font-mono w-14 flex-shrink-0 pt-0.5">
                  {item.computed_starts_at ? formatTime(item.computed_starts_at) : ''}
                </span>
              )}
              {/* Icon */}
              <div className="pt-0.5 flex-shrink-0">
                <RosItemIcon type={item.item_type} />
              </div>
              {/* Title + description */}
              <div className="flex-1 min-w-0">
                <span className="text-xs text-gray-700 font-medium leading-snug">{item.title}</span>
                {item.description && (
                  <p className="text-[10px] text-gray-400 leading-snug mt-0.5 truncate">{item.description}</p>
                )}
              </div>
              {/* Key badge */}
              {item.key_name && (
                <span className="text-[9px] bg-purple-50 text-purple-500 border border-purple-100 px-1 py-0.5 rounded font-bold flex-shrink-0 mt-0.5">{item.key_name}</span>
              )}
              {/* Duration */}
              {item.length != null && item.length > 0 && (
                <span className="text-[10px] text-gray-300 font-mono flex-shrink-0 mt-0.5">{formatDuration(item.length)}</span>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

export function Dashboard({ setScreen }: DashboardProps) {
  const {
    activeEventId, serviceTypeSlug, serviceTypeName,
    eventName, sessionDate, timezone,
  } = useSunday()
  const { sessionToken } = useAuth()

  const [items, setItems] = useState<EventChecklistItem[]>([])
  const [completedIds, setCompletedIds] = useState<string[]>([])
  const [issues, setIssues] = useState<Issue[]>([])
  const [pcoSchedule, setPcoSchedule] = useState<ScheduleItem[]>([])
  const [rosItems, setRosItems] = useState<PcoPlanItemResult[]>([])
  const [pcoAuthError, setPcoAuthError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    async function load() {
      try {
        if (!activeEventId) {
          setItems([])
          setCompletedIds([])
          setIssues([])
          return
        }

        const issuePromise = activeEventId
          ? supabase
            .from('issues')
            .select('*')
            .eq('event_id', activeEventId)
            .order('created_at', { ascending: false })
            .then(result => {
              if (result.error) throw result.error
              return result.data || []
            })
          : Promise.resolve([])

        if (activeEventId && serviceTypeSlug.startsWith('sunday')) {
          await ensureEventChecklistSeeded(activeEventId, serviceTypeSlug)
        }

        const [itemRes, completionRes, issueRows] = await Promise.all([
          supabase
            .from('event_checklist_items')
            .select('*')
            .eq('event_id', activeEventId)
            .order('sort_order', { ascending: true }),
          supabase
            .from('event_checklist_completions')
            .select('item_id')
            .eq('event_id', activeEventId),
          issuePromise,
        ])

        if (cancelled) return

        if (itemRes.error) throw itemRes.error
        if (completionRes.error) throw completionRes.error

        setItems((itemRes.data ?? []) as EventChecklistItem[])
        setCompletedIds([...new Set((completionRes.data ?? []).map((r: { item_id: string }) => r.item_id))])
        setIssues(issueRows as Issue[])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [activeEventId, serviceTypeSlug])

  useEffect(() => {
    let cancelled = false
    setPcoSchedule([])
    setRosItems([])
    setPcoAuthError(null)

    if (!sessionToken || !activeEventId) return
    const token = sessionToken
    const eventId = activeEventId

    async function loadPcoData() {
      const [planTimesResult, planItemsResult] = await Promise.allSettled([
        fetchPcoPlanTimes(token, eventId),
        fetchPcoPlanItems(token, eventId),
      ])

      if (cancelled) return

      const reauthError = [planTimesResult, planItemsResult].find(result =>
        result.status === 'rejected' &&
        result.reason instanceof ApiError &&
        result.reason.code === 'reauth_required'
      )

      if (reauthError?.status === 'rejected') {
        setPcoAuthError(reauthError.reason instanceof Error
          ? reauthError.reason.message
          : 'Planning Center authorization expired. Sign in again with Planning Center.')
        return
      }

      if (planTimesResult.status === 'fulfilled') {
        setPcoSchedule(planTimesResult.value.map(pt => planTimeToScheduleItem(pt, timezone)))
      } else {
        console.warn('PCO schedule fetch failed (using fallback schedule):', planTimesResult.reason)
      }

      if (planItemsResult.status === 'fulfilled') {
        setRosItems(planItemsResult.value)
      } else {
        console.warn('PCO run of show fetch failed:', planItemsResult.reason)
      }
    }

    void loadPcoData()
    return () => { cancelled = true }
  }, [activeEventId, sessionToken, timezone])

  const total = items.length
  const done = completedIds.length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const circ = 2 * Math.PI * 32
  const ringColor = pct === 100 ? '#10b981' : pct > 60 ? '#3b82f6' : '#f59e0b'

  const roleStats = CHECKLIST_ROLE_OPTIONS.map(r => {
    const roleItems = items.filter(i => i.role === r)
    const roleDone = roleItems.filter(i => completedIds.includes(i.id)).length
    return {
      r,
      done: roleDone,
      total: roleItems.length,
      pct: roleItems.length > 0 ? Math.round((roleDone / roleItems.length) * 100) : 0,
    }
  })

  const highIssues = issues.filter(i => !i.resolved_at && (i.severity === 'High' || i.severity === 'Critical'))
  const scheduleItems = pcoAuthError ? [] : pcoSchedule.length > 0 ? pcoSchedule : FALLBACK_SCHEDULE
  const isPcoSchedule = pcoSchedule.length > 0
  const dashboardSubtitle = eventName ?? serviceTypeName

  const totalRosSeconds = rosItems.reduce((sum, item) => sum + (item.length ?? 0), 0)
  const rosTotalLabel = totalRosSeconds > 0
    ? `${Math.floor(totalRosSeconds / 60)}m total`
    : null

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="fade-in">
      <div className="px-6 pt-5 pb-5 border-b border-gray-100">
        <h1 className="text-gray-900 text-xl font-bold">Event Overview</h1>
        <p className="text-gray-500 text-sm mt-0.5">{dashboardSubtitle}</p>
      </div>

      <div className="p-5 space-y-5">
        {/* Overall Progress — compact horizontal strip */}
        <Card className="px-5 py-3 overflow-hidden">
          <div className="flex items-center gap-4 min-w-0">
            {/* Dial */}
            <div className="relative w-12 h-12 flex-shrink-0">
              <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
                <circle cx="40" cy="40" r="32" fill="none" stroke="#f3f4f6" strokeWidth="10" />
                <circle cx="40" cy="40" r="32" fill="none" stroke={ringColor} strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={circ}
                  strokeDashoffset={circ * (1 - Math.min(pct, 100) / 100)}
                  style={{ transition: 'stroke-dashoffset .5s ease' }} />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-gray-900 text-[10px] font-bold leading-none">{pct}%</span>
              </div>
            </div>

            {/* Overall bar */}
            <div className="w-48 flex-shrink-0">
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-gray-900 text-sm font-semibold">Overall</span>
                <span className="text-gray-400 text-xs">{done} of {total}</span>
              </div>
              <div className="bg-gray-100 rounded-full h-2">
                <div className="h-2 rounded-full progress-fill" style={{ width: `${Math.min(pct, 100)}%`, background: ringColor }} />
              </div>
            </div>

            {/* Divider */}
            <div className="hidden md:block w-px h-8 bg-gray-100 flex-shrink-0" />

            {/* Role bars — fill remaining space evenly */}
            <div className="hidden md:grid grid-cols-6 gap-x-4 gap-y-0 flex-1 min-w-0">
              {roleStats.map(({ r, done, total, pct: rPct }) => (
                <div key={r} className="min-w-0">
                  <div className="flex justify-between items-baseline mb-1">
                    <span className="text-[10px] text-gray-500 font-medium">{r}</span>
                    <span className="text-[10px] text-gray-400">{done}/{total}</span>
                  </div>
                  <div className="bg-gray-100 rounded-full h-2">
                    <div className="h-2 rounded-full" style={{ width: `${Math.min(rPct, 100)}%`, background: ROLE_COLORS[r] }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Schedule (25%) + Run of Show (75%) — stacks on mobile */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className={`overflow-hidden ${rosItems.length > 0 ? 'md:col-span-1' : 'md:col-span-4'}`}>
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
              <p className="text-gray-900 text-sm font-semibold">Event Schedule</p>
              {isPcoSchedule && (
                <span className="text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-1.5 py-0.5 rounded-full font-bold">PCO</span>
              )}
            </div>
            {pcoAuthError ? (
              <div className="px-4 py-5">
                <p className="text-sm font-semibold text-gray-800">Planning Center unavailable</p>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">{pcoAuthError}</p>
                <button
                  type="button"
                  onClick={initiatePCOLogin}
                  className="mt-3 px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
                >
                  Sign in again with Planning Center
                </button>
              </div>
            ) : scheduleItems.map((item, i) => {
              const st = getScheduleStatus(item.minuteOfDay, sessionDate, timezone)
              return (
                <div key={item.id} className={`flex items-center gap-3 px-4 py-2 ${i < scheduleItems.length - 1 ? 'border-b border-gray-50' : ''}`}>
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${st === 'done' ? 'bg-emerald-400' : st === 'active' ? 'bg-blue-500 pulse' : 'bg-gray-200'}`} />
                  <span className={`text-xs w-[60px] flex-shrink-0 font-mono ${st === 'done' ? 'text-gray-300' : st === 'active' ? 'text-blue-600' : 'text-gray-400'}`}>{item.time}</span>
                  <span className={`text-xs flex-1 font-medium ${st === 'done' ? 'line-through text-gray-300' : st === 'active' ? 'text-blue-600' : 'text-gray-600'}`}>{item.label}</span>
                  {st === 'active' && <span className="text-[9px] bg-blue-100 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded-full font-bold">NOW</span>}
                </div>
              )
            })}
          </Card>

          {rosItems.length > 0 && (
            <div className="md:col-span-3">
              <RunOfShow items={rosItems} totalLabel={rosTotalLabel} timezone={timezone} />
            </div>
          )}
        </div>

        {/* High priority alert */}
        {highIssues.length > 0 && (
          <button onClick={() => setScreen('issues')}
            className="w-full bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-4 hover:bg-red-100 transition-colors">
            <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-red-700 font-semibold text-sm">{highIssues.length} High-Priority Issue{highIssues.length > 1 ? 's' : ''} Active</p>
              <p className="text-red-400 text-xs mt-0.5">Tap to review and flag for follow-up</p>
            </div>
            <ChevronRight className="w-4 h-4 text-red-400" />
          </button>
        )}

        {/* Quick Actions */}
        <div>
          <SectionLabel>Quick Actions</SectionLabel>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Event Checklist',   sub: 'Check off items', icon: ClipboardCheck, screen: 'checklist' as Screen },
              { label: 'Log Issue',          sub: 'Capture a problem', icon: AlertTriangle,  screen: 'issues'    as Screen },
              { label: 'Event Data',         sub: 'Attendance & runtimes', icon: BarChart2,  screen: 'data'      as Screen },
              { label: 'Evaluation',         sub: 'Capture follow-up', icon: Star,       screen: 'evaluation' as Screen },
            ].map(a => {
              const Icon = a.icon
              return (
                <button key={a.label} onClick={() => setScreen(a.screen)}
                  className="bg-white border border-gray-200 rounded-xl p-4 text-left hover:border-blue-200 hover:bg-blue-50 active:scale-95 transition-all group shadow-sm">
                  <Icon className="w-5 h-5 text-gray-400 group-hover:text-blue-600 mb-2 transition-colors" strokeWidth={1.8} />
                  <p className="text-gray-900 text-sm font-semibold group-hover:text-blue-700 transition-colors">{a.label}</p>
                  <p className="text-gray-400 text-[11px] mt-0.5">{a.sub}</p>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
