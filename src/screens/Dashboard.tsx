import { useEffect, useState } from 'react'
import { AlertTriangle, ChevronRight, ClipboardCheck, BarChart2, Star } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { ROLE_COLORS } from '../data/checklist'
import { loadOrSeedChecklistItems } from '../lib/checklist'
import { Card } from '../components/ui/Card'
import { SectionLabel } from '../components/ui/SectionLabel'
import type { Issue } from '../types'
import type { ChecklistItemRecord } from '../lib/checklist'

type Screen = 'dashboard' | 'checklist' | 'issues' | 'data' | 'evaluation'

interface DashboardProps {
  sundayId: string
  setScreen: (s: Screen) => void
}

const SCHEDULE = [
  { time: '7:30 AM',  label: 'Crew Arrival',       key: 'crew'       },
  { time: '8:00 AM',  label: 'Checklist Opens',     key: 'checklist'  },
  { time: '8:15 AM',  label: 'Projectors On',       key: 'proj'       },
  { time: '8:45 AM',  label: 'Rehearsal Begins',    key: 'rehearsal'  },
  { time: '9:00 AM',  label: '1st Service',         key: 'service1'   },
  { time: '10:30 AM', label: 'Flip Time',            key: 'flip'       },
  { time: '11:00 AM', label: '2nd Service',         key: 'service2'   },
  { time: '12:30 PM', label: 'Post-Evaluation Due', key: 'eval'       },
]

function getScheduleStatus(key: string): 'done' | 'active' | 'upcoming' {
  const now = new Date()
  const hour = now.getHours()
  const min = now.getMinutes()
  const totalMin = hour * 60 + min
  const times: Record<string, number> = {
    crew: 7*60+30, checklist: 8*60, proj: 8*60+15, rehearsal: 8*60+45,
    service1: 9*60, flip: 10*60+30, service2: 11*60, eval: 12*60+30,
  }
  const t = times[key]
  if (totalMin > t + 30) return 'done'
  if (totalMin >= t - 5) return 'active'
  return 'upcoming'
}

export function Dashboard({ sundayId, setScreen }: DashboardProps) {
  const [items, setItems] = useState<ChecklistItemRecord[]>([])
  const [completedIds, setCompletedIds] = useState<number[]>([])
  const [issues, setIssues] = useState<Issue[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [itemData, completions, issueData] = await Promise.all([
        loadOrSeedChecklistItems(),
        supabase.from('checklist_completions').select('item_id').eq('sunday_id', sundayId),
        supabase.from('issues').select('*').eq('sunday_id', sundayId).order('created_at', { ascending: false }),
      ])
      setItems(itemData)
      setCompletedIds((completions.data || []).map((r: { item_id: number }) => r.item_id))
      setIssues((issueData.data || []) as Issue[])
      setLoading(false)
    }
    load()
  }, [sundayId])

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

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="fade-in">
      <div className="px-6 pt-5 pb-5 border-b border-gray-100">
        <h1 className="text-gray-900 text-xl font-bold">Gameday Overview</h1>
        <p className="text-gray-500 text-sm mt-0.5">Two services today</p>
      </div>

      <div className="p-5 space-y-5">
        {/* Progress + Schedule */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
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

          <Card className="overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-gray-900 text-sm font-semibold">Today's Schedule</p>
            </div>
            {SCHEDULE.map((item, i) => {
              const st = getScheduleStatus(item.key)
              return (
                <div key={i} className={`flex items-center gap-3 px-4 py-2 ${i < SCHEDULE.length - 1 ? 'border-b border-gray-50' : ''}`}>
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${st === 'done' ? 'bg-emerald-400' : st === 'active' ? 'bg-blue-500 pulse' : 'bg-gray-200'}`} />
                  <span className={`text-xs w-[60px] flex-shrink-0 font-mono ${st === 'done' ? 'text-gray-300' : st === 'active' ? 'text-blue-600' : 'text-gray-400'}`}>{item.time}</span>
                  <span className={`text-xs flex-1 font-medium ${st === 'done' ? 'line-through text-gray-300' : st === 'active' ? 'text-blue-600' : 'text-gray-600'}`}>{item.label}</span>
                  {st === 'active' && <span className="text-[9px] bg-blue-100 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded-full font-bold">NOW</span>}
                </div>
              )
            })}
          </Card>
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
