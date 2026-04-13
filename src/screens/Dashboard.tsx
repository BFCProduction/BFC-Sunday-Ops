import { useEffect, useState } from 'react'
import { AlertTriangle, ChevronRight, ClipboardCheck, BarChart2, Star, Music, Type, Film, Layers } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { ROLE_COLORS } from '../data/checklist'
import { loadOrSeedChecklistItems } from '../lib/checklist'
import { useSunday } from '../context/SundayContext'
import { useAuth } from '../context/authState'
import { fetchPcoPlanTimes, fetchPcoPlanItems, type PcoPlanTimeResult, type PcoPlanItemResult } from '../lib/adminApi'
import { getChurchDateString } from '../lib/churchTime'
import { Card } from '../components/ui/Card'
import { SectionLabel } from '../components/ui/SectionLabel'
import type { Issue } from '../types'
import type { ChecklistItemRecord } from '../lib/checklist'

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

function RunOfShow({ items, totalLabel }: { items: PcoPlanItemResult[]; totalLabel: string | null }) {
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
            <div key={item.id} className={`flex items-center gap-2.5 px-4 py-2 ${i < items.length - 1 ? 'border-b border-gray-50' : ''}`}>
              <RosItemIcon type={item.item_type} />
              <span className="text-xs text-gray-700 font-medium flex-1 leading-snug">{item.title}</span>
              {item.key_name && (
                <span className="text-[9px] bg-purple-50 text-purple-500 border border-purple-100 px-1 py-0.5 rounded font-bold flex-shrink-0">{item.key_name}</span>
              )}
              {item.length != null && item.length > 0 && (
                <span className="text-[10px] text-gray-300 font-mono flex-shrink-0">{formatDuration(item.length)}</span>
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
    activeEventId, sundayId, serviceTypeSlug, serviceTypeName,
    eventName, sessionDate, timezone,
  } = useSunday()
  const { sessionToken } = useAuth()

  const [items, setItems] = useState<ChecklistItemRecord[]>([])
  const [completedIds, setCompletedIds] = useState<number[]>([])
  const [issues, setIssues] = useState<Issue[]>([])
  const [pcoSchedule, setPcoSchedule] = useState<ScheduleItem[]>([])
  const [rosItems, setRosItems] = useState<PcoPlanItemResult[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    async function load() {
      try {
        // Run all three queries in parallel
        const [itemData, eventCompletionsRes, legacyCompletionsRes, issueRes] = await Promise.all([
          loadOrSeedChecklistItems(serviceTypeSlug),
          supabase.from('checklist_completions').select('item_id').eq('event_id', activeEventId),
          sundayId
            ? supabase.from('checklist_completions').select('item_id').eq('sunday_id', sundayId)
            : Promise.resolve({ data: [] }),
          sundayId
            ? supabase.from('issues').select('*').eq('sunday_id', sundayId).order('created_at', { ascending: false })
            : Promise.resolve({ data: [] }),
        ])

        if (cancelled) return

        // Prefer event-native completions; fall back to legacy
        const completionData =
          (eventCompletionsRes.data && eventCompletionsRes.data.length > 0)
            ? eventCompletionsRes.data
            : (legacyCompletionsRes.data ?? [])

        setItems(itemData)
        setCompletedIds(completionData.map((r: { item_id: number }) => r.item_id))
        setIssues((issueRes.data || []) as Issue[])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [activeEventId, sundayId, serviceTypeSlug])

  useEffect(() => {
    let cancelled = false
    setPcoSchedule([])
    setRosItems([])

    if (!sessionToken || !activeEventId) return
    const token = sessionToken
    const eventId = activeEventId

    async function loadPcoData() {
      const [planTimesResult, planItemsResult] = await Promise.allSettled([
        fetchPcoPlanTimes(token, eventId),
        fetchPcoPlanItems(token, eventId),
      ])

      if (cancelled) return

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

  const roleStats = ['A1', 'Video', 'Graphics', 'Lighting', 'Stage'].map(r => {
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
  const scheduleItems = pcoSchedule.length > 0 ? pcoSchedule : FALLBACK_SCHEDULE
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
        <h1 className="text-gray-900 text-xl font-bold">Gameday Overview</h1>
        <p className="text-gray-500 text-sm mt-0.5">{dashboardSubtitle}</p>
      </div>

      <div className="p-5 space-y-5">
        {/* Overall Progress — full width */}
        <Card className="p-5">
          <div className="flex items-center gap-5">
            <div className="relative w-[88px] h-[88px] flex-shrink-0">
              <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
                <circle cx="40" cy="40" r="32" fill="none" stroke="#f3f4f6" strokeWidth="9" />
                <circle cx="40" cy="40" r="32" fill="none" stroke={ringColor} strokeWidth="9"
                  strokeLinecap="round"
                  strokeDasharray={circ}
                  strokeDashoffset={circ * (1 - pct / 100)}
                  style={{ transition: 'stroke-dashoffset .5s ease' }} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-gray-900 text-xl font-bold leading-none">{pct}%</span>
                <span className="text-gray-400 text-[9px] font-semibold mt-0.5">DONE</span>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-gray-900 font-semibold">Overall Progress</p>
              <p className="text-gray-500 text-sm mt-0.5">{done} of {total} items checked</p>
              <div className="mt-3 bg-gray-100 rounded-full h-1.5">
                <div className="h-1.5 rounded-full progress-fill" style={{ width: `${pct}%`, background: ringColor }} />
              </div>
              <div className="grid grid-cols-5 gap-1 mt-3">
                {roleStats.map(({ r, done, total }) => (
                  <div key={r} className="text-center">
                    <div className="h-1 rounded-full mb-1 bg-gray-100">
                      <div className="h-1 rounded-full" style={{ width: `${total > 0 ? Math.round(done / total * 100) : 0}%`, background: ROLE_COLORS[r] }} />
                    </div>
                    <span className="text-[9px] text-gray-400 font-medium">{r}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* Schedule (25%) + Run of Show (75%) — stacks on mobile */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className={`overflow-hidden ${rosItems.length > 0 ? 'md:col-span-1' : 'md:col-span-4'}`}>
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
              <p className="text-gray-900 text-sm font-semibold">Today's Schedule</p>
              {isPcoSchedule && (
                <span className="text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-1.5 py-0.5 rounded-full font-bold">PCO</span>
              )}
            </div>
            {scheduleItems.map((item, i) => {
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
              <RunOfShow items={rosItems} totalLabel={rosTotalLabel} />
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

        {/* Role Progress */}
        <div>
          <SectionLabel>Role Progress</SectionLabel>
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            {roleStats.map(({ r, done, total, pct }) => (
              <Card key={r} className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: ROLE_COLORS[r] }} />
                  <span className="text-gray-900 text-sm font-medium">{r}</span>
                  <span className="ml-auto text-gray-400 text-xs">{done}/{total}</span>
                </div>
                <div className="bg-gray-100 rounded-full h-1.5">
                  <div className="h-1.5 rounded-full progress-fill" style={{ width: `${pct}%`, background: ROLE_COLORS[r] }} />
                </div>
                <p className="text-gray-400 text-[10px] mt-1.5">{pct}% complete</p>
              </Card>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div>
          <SectionLabel>Quick Actions</SectionLabel>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Gameday Checklist', sub: 'Check off items', icon: ClipboardCheck, screen: 'checklist' as Screen },
              { label: 'Log Issue',          sub: 'Capture a problem', icon: AlertTriangle,  screen: 'issues'    as Screen },
              { label: 'Service Data',       sub: 'Attendance & runtimes', icon: BarChart2,  screen: 'data'      as Screen },
              { label: 'Evaluation',         sub: 'Rate today\'s service', icon: Star,       screen: 'evaluation' as Screen },
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
