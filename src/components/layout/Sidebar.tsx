import { useEffect, useState } from 'react'
import {
  Home, LayoutDashboard, ClipboardCheck, AlertTriangle,
  BarChart2, Star, Calendar, Radio, BookOpen, ExternalLink,
  Settings, ChevronLeft, ChevronRight, RotateCcw, TrendingUp,
  CalendarDays, ChevronDown, Plus, FolderOpen, List,
} from 'lucide-react'
import { SessionPicker } from './SessionPicker'
import { QuickCreateModal } from './QuickCreateModal'
import { useAdmin } from '../../context/adminState'
import { useAuth } from '../../context/authState'
import { deleteEventAsAdmin } from '../../lib/adminApi'
import { getServicePhase, type ServicePhase } from '../../lib/serviceStatus'
import { loadAllSessions } from '../../lib/supabase'
import { useSunday } from '../../context/SundayContext'
import type { Session } from '../../types'

type Screen = 'home' | 'dashboard' | 'checklist' | 'issues' | 'data' | 'evaluation' | 'analytics' | 'settings' | 'docs'

interface SidebarProps {
  active: Screen
  setActive: (s: Screen) => void
  issueCount: number
  allSessions: Session[]
  onSessionsChange: (sessions: Session[]) => void
}

const eventNavItems = [
  { id: 'dashboard'   as Screen, label: 'Event Overview', icon: LayoutDashboard },
  { id: 'docs'        as Screen, label: 'Production Docs', icon: FolderOpen      },
  { id: 'checklist'   as Screen, label: 'Checklist',       icon: ClipboardCheck  },
  { id: 'issues'      as Screen, label: 'Issue Log',       icon: AlertTriangle   },
  { id: 'data'        as Screen, label: 'Event Data',      icon: BarChart2       },
  { id: 'evaluation'  as Screen, label: 'Evaluation',      icon: Star            },
]

function eventNavTitle(session: Session) {
  return session.name || session.date
}

export function Sidebar({ active, setActive, issueCount, allSessions, onSessionsChange }: SidebarProps) {
  const { isAdmin } = useAdmin()
  const { sessionToken } = useAuth()
  const {
    activeEventId, serviceTypeSlug, serviceTypeColor, eventName,
    sessionDate, todaySundayDate, timezone, isViewingPast,
    navigateToEvent, navigateSunday,
  } = useSunday()
  const [phase, setPhase] = useState<ServicePhase | null>(() => getServicePhase(new Date(), timezone))
  const [showPicker,      setShowPicker]      = useState(false)
  const [showQuickCreate, setShowQuickCreate] = useState(false)
  const isHome = active === 'home'

  useEffect(() => {
    const id = setInterval(() => setPhase(getServicePhase(new Date(), timezone)), 60_000)
    return () => clearInterval(id)
  }, [timezone])

  // ── Session label ──────────────────────────────────────────────────────────
  const dateFormatted = sessionDate
    ? new Date(sessionDate + 'T12:00:00').toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
      })
    : '—'

  const isNamedEvent = Boolean(eventName)
  const serviceTime = serviceTypeSlug === 'sunday-9am' ? '9am' : serviceTypeSlug === 'sunday-11am' ? '11am' : null
  const displayLabel = isNamedEvent && eventName
    ? eventName
    : serviceTime ? `${dateFormatted} · ${serviceTime}` : dateFormatted

  // ── Prev / next navigation (by events.id) ─────────────────────────────────
  const currentIdx = allSessions.findIndex(s => s.id === activeEventId)
  const prevSession = currentIdx > 0 ? allSessions[currentIdx - 1] : null
  const nextSession = currentIdx >= 0 && currentIdx < allSessions.length - 1
    ? allSessions[currentIdx + 1]
    : null

  return (
    <aside className="hidden md:flex flex-col flex-shrink-0 border-r border-white/[0.06] overflow-y-auto"
      style={{ width: 260, background: '#0d0d0d', position: 'sticky', top: 56, height: 'calc(100vh - 56px)' }}>

      <div className="px-3 py-3 border-b border-white/[0.05]">
        <button
          onClick={() => setActive('home')}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left ${
            active === 'home' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.04]'
          }`}
        >
          <Home className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={active === 'home' ? 2.2 : 1.8} />
          <span className="flex-1 leading-tight">Home</span>
        </button>
      </div>

      {!isHome && (
      <div className="px-4 pt-4 pb-4 border-b border-white/[0.05]">
        <div className="flex items-center gap-2 mb-2">
          {isNamedEvent
            ? <CalendarDays className="w-3.5 h-3.5" style={{ color: serviceTypeColor }} />
            : <Calendar className="w-3.5 h-3.5 text-gray-600" />
          }
          <p className="text-gray-600 text-[10px] font-semibold uppercase tracking-widest">
            {isViewingPast ? 'Past Event' : 'Selected Event'}
          </p>
        </div>

        {/* Date / name navigator */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => prevSession && navigateToEvent(prevSession.id)}
            disabled={!prevSession}
            className="p-1 rounded text-gray-600 hover:text-gray-300 hover:bg-white/[0.06] transition-colors flex-shrink-0 disabled:opacity-20 disabled:cursor-not-allowed"
            title={prevSession ? `Go to ${eventNavTitle(prevSession)}` : 'No earlier event'}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Clicking the date/name opens the event picker */}
          <button
            onClick={() => setShowPicker(true)}
            className="flex-1 text-center group py-0.5 rounded hover:bg-white/[0.06] transition-colors"
            title="Browse all events"
          >
            <p className="text-white text-sm font-semibold leading-tight group-hover:text-blue-300 transition-colors">
              {displayLabel}
            </p>
            {isNamedEvent && (
              <p className="text-gray-500 text-[10px] mt-0.5">{dateFormatted}</p>
            )}
            <ChevronDown className="w-3 h-3 text-gray-600 group-hover:text-blue-400 mx-auto mt-0.5 transition-colors" />
          </button>

          <button
            onClick={() => nextSession && navigateToEvent(nextSession.id)}
            disabled={!nextSession}
            className="p-1 rounded text-gray-600 hover:text-gray-300 hover:bg-white/[0.06] transition-colors flex-shrink-0 disabled:opacity-20 disabled:cursor-not-allowed"
            title={nextSession ? `Go to ${eventNavTitle(nextSession)}` : 'No later event'}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>


        {/* Phase / event badge */}
        <div className="flex gap-2 mt-2 flex-wrap">
          {isNamedEvent ? (
            <span
              className="text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1"
              style={{ backgroundColor: `${serviceTypeColor}25`, color: serviceTypeColor }}
            >
              <CalendarDays className="w-2.5 h-2.5" />
              Event
            </span>
          ) : isViewingPast ? (
            <span className="bg-amber-900/40 text-amber-400 text-[10px] font-medium px-2 py-0.5 rounded-full">
              Historical View
            </span>
          ) : phase ? (
            <span className={`flex items-center gap-1.5 ${phase.bg} ${phase.text} text-[10px] font-medium px-2 py-0.5 rounded-full`}>
              {phase.pulse && <Radio className="w-2.5 h-2.5" />}
              {phase.label}
            </span>
          ) : (
            <span className="bg-gray-800 text-gray-500 text-[10px] font-medium px-2 py-0.5 rounded-full">
              9:00 · 11:00
            </span>
          )}
        </div>

        {/* Back to today */}
        {isViewingPast && (
          <button
            onClick={() => navigateSunday(todaySundayDate)}
            className="mt-2.5 flex items-center gap-1.5 text-[10px] font-semibold text-blue-400 hover:text-blue-300 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            Back to Today
          </button>
        )}

        <div className="flex items-center justify-between mt-2">
          <p className="text-gray-700 text-[10px]">
            {allSessions.length} event{allSessions.length !== 1 ? 's' : ''}
            {' · '}
            <button onClick={() => setShowPicker(true)} className="text-gray-500 hover:text-blue-400 underline transition-colors">
              quick switch
            </button>
          </p>
          {isAdmin && (
            <button
              onClick={() => setShowQuickCreate(true)}
              className="flex items-center gap-1 text-[10px] font-semibold text-gray-500 hover:text-white hover:bg-white/[0.08] px-2 py-0.5 rounded transition-all"
              title="Create new event"
            >
              <Plus className="w-3 h-3" />
              New Event
            </button>
          )}
        </div>
      </div>
      )}

      <nav className="flex-1 px-3 py-3 space-y-0.5 flex flex-col">
        {!isHome && (
          <>
            <p className="px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-widest text-gray-700">
              Event Workspace
            </p>
            {eventNavItems.map(item => {
              const Icon = item.icon
              const isActive = active === item.id
              return (
                <button key={item.id} onClick={() => setActive(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left ${
                    isActive ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.04]'
                  }`}>
                  <Icon className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={isActive ? 2.2 : 1.8} />
                  <span className="flex-1 leading-tight">{item.label}</span>
                  {item.id === 'issues' && issueCount > 0 && (
                    <span className="bg-red-600 text-white text-[9px] font-bold rounded-full px-1.5 py-0.5 pulse">
                      {issueCount}
                    </span>
                  )}
                </button>
              )
            })}
          </>
        )}

        <div className={`${isHome ? 'pt-1' : 'mt-auto pt-4 border-t border-white/[0.05]'} space-y-0.5`}>
          <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-widest text-gray-700">
            {isHome ? 'Global Tools' : 'Global'}
          </p>
          {isHome && isAdmin && (
            <button onClick={() => setShowPicker(true)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left text-gray-500 hover:text-gray-300 hover:bg-white/[0.04]">
              <List className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={1.8} />
              <span className="flex-1 leading-tight">Manage Events</span>
            </button>
          )}
          {isAdmin && (
            <button onClick={() => setActive('analytics')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left ${
                active === 'analytics' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.04]'
              }`}>
              <TrendingUp className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={active === 'analytics' ? 2.2 : 1.8} />
              <span className="flex-1 leading-tight">Analytics</span>
            </button>
          )}
          {isAdmin && (
            <button onClick={() => setActive('settings')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left ${
                active === 'settings' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.04]'
              }`}>
              <Settings className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={active === 'settings' ? 2.2 : 1.8} />
              <span className="flex-1 leading-tight">Settings</span>
            </button>
          )}

          <a
            href="https://bfcproduction.github.io/bfc-production-support/"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-300 hover:bg-white/[0.04] transition-all"
          >
            <BookOpen className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={1.8} />
            <span className="flex-1 leading-tight">Production Support</span>
            <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-50" />
          </a>

        </div>
      </nav>

      {/* Session picker modal */}
      {showPicker && (
        <SessionPicker
          allSessions={allSessions}
          activeEventId={activeEventId}
          onSelect={navigateToEvent}
          onClose={() => setShowPicker(false)}
          isAdmin={isAdmin}
          onDelete={sessionToken ? async (id) => {
            const idx = allSessions.findIndex(s => s.id === id)
            await deleteEventAsAdmin(sessionToken, id)
            const fresh = await loadAllSessions()
            onSessionsChange(fresh)
            const fallback = fresh[Math.max(0, Math.min(idx, fresh.length - 1))] ?? fresh[0]
            if (fallback) navigateToEvent(fallback.id)
          } : undefined}
        />
      )}

      {/* Quick-create event modal */}
      {showQuickCreate && (
        <QuickCreateModal
          sessionToken={sessionToken}
          onCreated={(newId, freshSessions) => {
            onSessionsChange(freshSessions)
            navigateToEvent(newId)
          }}
          onClose={() => setShowQuickCreate(false)}
        />
      )}
    </aside>
  )
}
