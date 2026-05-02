import { useState, useEffect, useCallback } from 'react'
import { AuthProvider }   from './context/AuthContext'
import { useAuth }        from './context/authState'
import { triggerPcoSync } from './lib/adminApi'
import { SundayContext }  from './context/SundayContext'
import {
  loadChurchTimezone, loadAllSessions,
  getOrCreateTodayEvents, getEventById, getFirstEventForDate, supabase,
} from './lib/supabase'
import { CHURCH_TIME_ZONE } from './lib/churchTime'
import { SiteHeader }     from './components/layout/SiteHeader'
import { Sidebar }        from './components/layout/Sidebar'
import { MobileTabs }     from './components/layout/MobileTabs'
import { LoginScreen }    from './components/auth/LoginScreen'
import { Home }           from './screens/Home'
import { Dashboard }      from './screens/Dashboard'
import { Checklist }      from './screens/Checklist'
import { IssueLog }       from './screens/IssueLog'
import { ServiceData }    from './screens/ServiceData'
import { Evaluation }     from './screens/Evaluation'
import { Analytics }      from './screens/Analytics'
import { Settings }       from './screens/Settings'
import { ProductionDocs } from './screens/ProductionDocs'
import type { Session }   from './types'

export type Screen = 'home' | 'dashboard' | 'checklist' | 'issues' | 'data' | 'evaluation' | 'analytics' | 'settings' | 'docs'

// ── Root: provides auth context ───────────────────────────────────────────────
export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}

// ── Auth gate ─────────────────────────────────────────────────────────────────
function AppShell() {
  const { user, isLoading: authLoading, login } = useAuth()

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#111827' }}>
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-3" />
          <p className="text-white/40 text-sm">Loading…</p>
        </div>
      </div>
    )
  }

  if (!user) return <LoginScreen onLogin={login} />
  return <AppMain />
}

// ── Focus selection: midpoint between the last event's end and next event's start ──
// "Last event ended" is approximated as 6 PM on the event date.
// "Next event starts" uses stored event_time, Sunday service defaults, then
// end-of-day for unscheduled standalone events.
function getActiveFocusSession(sessions: Session[], now = new Date()): Session | null {
  if (sessions.length === 0) return null

  const startMs = (s: Session) => {
    const time = s.eventTime?.slice(0, 5)
      ?? (s.serviceTypeSlug === 'sunday-9am' ? '09:00' : null)
      ?? (s.serviceTypeSlug === 'sunday-11am' ? '11:00' : null)
      ?? '23:59'
    return new Date(`${s.date}T${time}:00`).getTime()
  }
  const endMs = (s: Session) => new Date(`${s.date}T18:00:00`).getTime()

  const nowMs  = now.getTime()
  const sorted = [...sessions].sort((a, b) => startMs(a) - startMs(b))
  const past   = sorted.filter(s => startMs(s) <= nowMs)
  const future = sorted.filter(s => startMs(s) >  nowMs)
  const last   = past[past.length - 1] ?? null
  const next   = future[0] ?? null

  if (!last) return next
  if (!next) return last

  return nowMs >= (endMs(last) + startMs(next)) / 2 ? next : last
}

// ── Main app ──────────────────────────────────────────────────────────────────
function AppMain() {
  const { sessionToken } = useAuth()
  const [screen,      setScreen]      = useState<Screen>('home')
  const [timezone,    setTimezone]    = useState(CHURCH_TIME_ZONE)

  // The operational Sunday date — anchor for "today" and isViewingPast
  const [todaySundayDate, setTodaySundayDate] = useState('')

  // The currently viewed session (from events table)
  const [session,     setSession]     = useState<Session | null>(null)
  const [allSessions, setAllSessions] = useState<Session[]>([])
  const [issueCount,  setIssueCount]  = useState(0)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')

  // ── Issue count ─────────────────────────────────────────────────────────────
  async function refreshIssueCount(s: Session | null) {
    if (!s) {
      setIssueCount(0)
      return
    }

    const { count } = await supabase
      .from('issues')
      .select('id', { count: 'exact', head: true })
      .in('severity', ['High', 'Critical'])
      .is('resolved_at', null)
      .eq('event_id', s.id)

    setIssueCount(count ?? 0)
  }

  // ── Initial load ────────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const tz = await loadChurchTimezone()
      setTimezone(tz)

      // Ensure this Sunday's 9am/11am events (and parent Sunday record) exist.
      await getOrCreateTodayEvents(tz)

      // Load all sessions, then pick focus via midpoint logic.
      const sessions = await loadAllSessions()
      setAllSessions(sessions)

      const focusSession = getActiveFocusSession(sessions) ?? sessions[0] ?? null
      setSession(focusSession)
      setTodaySundayDate(focusSession?.date ?? '')

      await refreshIssueCount(focusSession)

      // Background PCO sync — fire after sessions are loaded so the UI isn't
      // blocked. PCO sync only updates names/pco_plan_id on existing events;
      // it never creates or deletes rows. We do not reload sessions afterward
      // because a stale loadAllSessions() racing with an in-progress deletion
      // would overwrite state and make the deleted event reappear.
      if (sessionToken) {
        triggerPcoSync(sessionToken)
          .catch(err => console.warn('PCO auto-sync failed (non-fatal):', err))
      }
    }

    init()
      .catch(err => { setError((err as Error).message); setLoading(false) })
      .then(() => setLoading(false))
  }, [])

  // ── Navigation ──────────────────────────────────────────────────────────────
  const navigateToEvent = useCallback(async (eventId: string) => {
    const found = allSessions.find(s => s.id === eventId)
      ?? await getEventById(eventId)
    if (!found) return
    setSession(found)
    void refreshIssueCount(found)
  }, [allSessions])

  const navigateSunday = useCallback(async (date: string) => {
    const found = await getFirstEventForDate(date)
    if (found) {
      setSession(found)
      void refreshIssueCount(found)
    }
  }, [])

  // ── Derived context values ──────────────────────────────────────────────────
  const activeEventId    = session?.id ?? ''
  const serviceTypeSlug  = session?.serviceTypeSlug  ?? 'sunday-9am'
  const serviceTypeName  = session?.serviceTypeName  ?? 'Sunday 9:00 AM'
  const serviceTypeColor = session?.serviceTypeColor ?? '#3b82f6'
  const sessionDate      = session?.date ?? ''
  const sundayId         = session?.legacySundayId ?? ''
  const sundayDate       = session?.legacySundayId ? session.date : ''
  const eventName        = session && !session.serviceTypeSlug.startsWith('sunday') ? session.name : null
  const isViewingPast    = !!session && session.date < todaySundayDate

  if (loading) return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-gray-400 text-sm">Loading Sunday Ops…</p>
      </div>
    </div>
  )

  if (error) return (
    <div className="min-h-screen bg-white flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <p className="text-gray-900 font-semibold mb-2">Unable to connect</p>
        <p className="text-gray-400 text-sm">{error}</p>
      </div>
    </div>
  )

  return (
    <SundayContext.Provider value={{
      activeEventId, serviceTypeSlug, serviceTypeName, serviceTypeColor,
      sundayId, sundayDate, eventName,
      sessionDate,
      timezone, todaySundayDate, isViewingPast,
      navigateToEvent, navigateSunday,
    }}>
      <div className="h-screen flex flex-col overflow-hidden" style={{ background: '#111827' }}>
        <SiteHeader allSessions={allSessions} onGoToDashboard={() => setScreen('home')} onSessionsChange={setAllSessions} />
        <div className="flex flex-1 min-h-0">
          <Sidebar
            active={screen}
            setActive={setScreen}
            issueCount={issueCount}
            allSessions={allSessions}
            onSessionsChange={setAllSessions}
          />
          <main className="flex-1 min-w-0 overflow-y-auto bg-white" style={{ paddingBottom: '80px' }}>
            {screen === 'home'       && <Home allSessions={allSessions} onSessionsChange={setAllSessions} setScreen={setScreen} />}
            {screen === 'dashboard'  && <Dashboard   setScreen={setScreen} />}
            {screen === 'checklist'  && <Checklist />}
            {screen === 'issues'     && <IssueLog    sundayId={sundayId} eventId={activeEventId} />}
            {screen === 'data'       && <ServiceData />}
            {screen === 'evaluation' && <Evaluation />}
            {screen === 'analytics'  && <Analytics />}
            {screen === 'settings'   && <Settings />}
            {screen === 'docs'       && <ProductionDocs />}
          </main>
        </div>
        <MobileTabs active={screen} setActive={setScreen} issueCount={issueCount} />
      </div>
    </SundayContext.Provider>
  )
}
