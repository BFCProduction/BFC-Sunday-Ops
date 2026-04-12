import { useEffect, useState } from 'react'
import { LogOut, Radio, ShieldCheck, ChevronLeft, ChevronRight, Calendar, CalendarDays } from 'lucide-react'
import bfcLogo from '../../assets/BFC_Production_Logo_Hor reverse.png'
import { getServicePhase, type ServicePhase } from '../../lib/serviceStatus'
import { useSunday } from '../../context/SundayContext'
import { useAuth }   from '../../context/authState'
import { SessionPicker } from './SessionPicker'
import type { Session } from '../../types'

interface SiteHeaderProps {
  allSessions: Session[]
}

export function SiteHeader({ allSessions }: SiteHeaderProps) {
  const {
    timezone, activeEventId, sessionDate,
    serviceTypeSlug, serviceTypeColor, eventName,
    navigateToEvent,
  } = useSunday()
  const { user, isAdmin, logout } = useAuth()

  const [phase, setPhase] = useState<ServicePhase | null>(() => getServicePhase(new Date(), timezone))
  const [showPicker, setShowPicker] = useState(false)

  useEffect(() => {
    setPhase(getServicePhase(new Date(), timezone))
    const id = setInterval(() => setPhase(getServicePhase(new Date(), timezone)), 60_000)
    return () => clearInterval(id)
  }, [timezone])

  // ── Mobile session navigation ──────────────────────────────────────────────
  const currentIdx = allSessions.findIndex(s => s.id === activeEventId)
  const prevSession = currentIdx > 0 ? allSessions[currentIdx - 1] : null
  const nextSession = currentIdx >= 0 && currentIdx < allSessions.length - 1
    ? allSessions[currentIdx + 1]
    : null

  const isSpecial = serviceTypeSlug === 'special'
  const dateFormatted = sessionDate
    ? new Date(sessionDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—'
  const serviceTime = serviceTypeSlug === 'sunday-9am' ? '9am' : serviceTypeSlug === 'sunday-11am' ? '11am' : null
  const displayLabel = isSpecial && eventName
    ? eventName
    : serviceTime ? `${dateFormatted} · ${serviceTime}` : dateFormatted

  return (
    <header
      className="site-header flex-shrink-0"
      style={{ background: '#1a1a1a' }}
    >
      {/* Main header row */}
      <div className="flex items-center justify-between px-4 md:px-6 h-14">
        {/* Left: logo + app name */}
        <div className="flex items-center gap-3">
          <img src={bfcLogo} alt="BFC Production" className="h-6 md:h-7 w-auto object-contain" />
          <span className="hidden md:inline text-gray-600 mx-1 text-sm">·</span>
          <span className="hidden md:inline text-gray-400 text-sm">Sunday Ops</span>
        </div>

        {/* Right: service phase + user identity */}
        <div className="flex items-center gap-3 md:gap-5">
          {phase && (
            <div className="flex items-center gap-1.5">
              {phase.pulse && <Radio className={`w-3.5 h-3.5 ${phase.text} pulse`} />}
              <span className={`${phase.text} text-xs font-medium`}>{phase.label}</span>
            </div>
          )}

          {user && (
            <div className="flex items-center gap-2.5">
              {/* Avatar or initials */}
              {user.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.name}
                  className="w-7 h-7 rounded-full object-cover ring-1 ring-white/10"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-xs font-bold leading-none">
                    {user.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                  </span>
                </div>
              )}

              {/* Name (hidden on small screens) */}
              <div className="hidden md:flex items-center gap-1.5">
                <span className="text-gray-300 text-xs">{user.name}</span>
                {isAdmin && (
                  <ShieldCheck className="w-3.5 h-3.5 text-blue-400" aria-label="Admin" />
                )}
              </div>

              {/* Sign out */}
              <button
                onClick={logout}
                title="Sign out"
                className="text-gray-500 hover:text-gray-300 transition-colors p-1 rounded"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile session nav strip */}
      <div className="md:hidden flex items-center gap-1 px-2 pb-2 border-t border-white/[0.05]">
        <button
          onClick={() => prevSession && navigateToEvent(prevSession.id)}
          disabled={!prevSession}
          className="p-1.5 rounded text-gray-600 hover:text-gray-300 hover:bg-white/[0.06] transition-colors flex-shrink-0 disabled:opacity-20 disabled:cursor-not-allowed"
          title={prevSession ? 'Previous session' : 'No earlier session'}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <button
          onClick={() => setShowPicker(true)}
          className="flex-1 flex items-center justify-center gap-1.5 py-1 rounded hover:bg-white/[0.06] transition-colors min-w-0"
          title="Browse all sessions"
        >
          {isSpecial
            ? <CalendarDays className="w-3.5 h-3.5 flex-shrink-0" style={{ color: serviceTypeColor }} />
            : <Calendar className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
          }
          <span className="text-white text-sm font-semibold truncate">{displayLabel}</span>
        </button>

        <button
          onClick={() => nextSession && navigateToEvent(nextSession.id)}
          disabled={!nextSession}
          className="p-1.5 rounded text-gray-600 hover:text-gray-300 hover:bg-white/[0.06] transition-colors flex-shrink-0 disabled:opacity-20 disabled:cursor-not-allowed"
          title={nextSession ? 'Next session' : 'No later session'}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {showPicker && (
        <SessionPicker
          allSessions={allSessions}
          activeEventId={activeEventId}
          onSelect={navigateToEvent}
          onClose={() => setShowPicker(false)}
        />
      )}
    </header>
  )
}
