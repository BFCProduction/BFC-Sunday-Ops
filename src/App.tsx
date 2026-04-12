import { useState, useEffect, useCallback } from 'react'
import { AuthProvider }   from './context/AuthContext'
import { useAuth }        from './context/authState'
import { triggerPcoSync } from './lib/adminApi'
import { SundayContext }  from './context/SundayContext'
import {
  loadChurchTimezone, loadFlipConfig, loadAllSessions,
  getOrCreateTodayEvents, getEventById, getFirstEventForDate, supabase,
} from './lib/supabase'
import { CHURCH_TIME_ZONE } from './lib/churchTime'
import { SiteHeader }     from './components/layout/SiteHeader'
import { Sidebar }        from './components/layout/Sidebar'
import { MobileTabs }     from './components/layout/MobileTabs'
import { LoginScreen }    from './components/auth/LoginScreen'
import { Dashboard }      from './screens/Dashboard'
import { Checklist }      from './screens/Checklist'
import { IssueLog }       from './screens/IssueLog'
import { ServiceData }    from './screens/ServiceData'
import { Evaluation }     from './screens/Evaluation'
import { Analytics }      from './screens/Analytics'
import { Settings }       from './screens/Settings'
import type { Session }   from './types'

export type Screen = 'dashboard' | 'checklist' | 'issues' | 'data' | 'evaluation' | 'analytics' | 'settings'

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

// ── Main app ──────────────────────────────────────────────────────────────────
function AppMain() {
  const { sessionToken } = useAuth()
  const [screen,      setScreen]      = useState<Screen>('dashboard')
  const [timezone,    setTimezone]    = useState(CHURCH_TIME_ZONE)

  // The operational Sunday date — anchor for "today" and isViewingPast
  const [todaySundayDate, setTodaySundayDate] = useState('')

  // The currently viewed session (from events table)
  const [session,     setSession]     = useState<Session | null>(null)
  const [allSessions, setAllSessions] = useState<Session[]>([])
  const [issueCount,  setIssueCount]  = useState(0)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')

  // ── Initial load ────────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const [tz, flip] = await Promise.all([loadChurchTimezone(), loadFlipConfig()])
      setTimezone(tz)

      // Create today's 9am + 11am events (and parent Sunday record) if needed.
      // Returns the 9am event as the default focus.
      const { defaultSession, sundayDate } = await getOrCreateTodayEvents(
        tz, flip.flipDay, flip.flipHour
      )
      setTodaySundayDate(sundayDate)

      // Check if there's an upcoming special event that should take focus
      // (same logic as before: first event between today and the Sunday date)
      const today = new Date().toISOString().slice(0, 10)
      // Use !inner so the eq filter on the joined table actually excludes rows
      // (without !inner, PostgREST nulls out the join result instead of filtering the row)
      const { data: upcomingSpecial } = await supabase
        .from('events')
        .select(`
          id, name, event_date, event_time, legacy_sunday_id, legacy_special_event_id,
          service_types!inner ( slug, name, color, sort_order )
        `)
        .eq('service_types.slug', 'special')
        .gte('event_date', today)
        .lte('event_date', sundayDate)
        .order('event_date', { ascending: true })
        .limit(1)
        .maybeSingle()

      const focusSession = upcomingSpecial
        ? {
            id:                   upcomingSpecial.id,
            type:                 'event' as const,
            serviceTypeSlug:      (upcomingSpecial.service_types as unknown as { slug: string; name: string; color: string; sort_order: number }).slug,
            serviceTypeName:      (upcomingSpecial.service_types as unknown as { slug: string; name: string; color: string; sort_order: number }).name,
            serviceTypeColor:     (upcomingSpecial.service_types as unknown as { slug: string; name: string; color: string; sort_order: number }).color,
            name:                 upcomingSpecial.name,
            date:                 upcomingSpecial.event_date,
            eventTime:            upcomingSpecial.event_time,
            legacySundayId:       upcomingSpecial.legacy_sunday_id,
            legacySpecialEventId: upcomingSpecial.legacy_special_event_id,
          }
        : defaultSession

      setSession(focusSession)

      const sessions = await loadAllSessions()
      setAllSessions(sessions)

      await refreshIssueCount(focusSession)

      // Background PCO sync — fire after sessions are loaded so the UI isn't
      // blocked, then reload sessions when done to surface newly synced events.
      if (sessionToken) {
        triggerPcoSync(sessionToken)
          .then(() => loadAllSessions())
          .then(fresh => setAllSessions(fresh))
          .catch(err => console.warn('PCO auto-sync failed (non-fatal):', err))
      }
    }

    init()
      .catch(err => { setError((err as Error).message); setLoading(false) })
      .then(() => setLoading(false))
  }, [])

  // ── Issue count ─────────────────────────────────────────────────────────────
  async function refreshIssueCount(s: Session) {
    const baseQuery = supabase
      .from('issues')
      .select('id', { count: 'exact' })
      .in('severity', ['High', 'Critical'])
      .is('resolved_at', null)

    const { count } = s.legacySundayId
      ? await baseQuery.eq('sunday_id', s.legacySundayId)
      : s.legacySpecialEventId
        ? await baseQuery.eq('event_id', s.legacySpecialEventId)
        : await baseQuery.eq('event_id', s.id)  // future: event-native

    setIssueCount(count ?? 0)
  }

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
  const sessionType      = session?.type ?? 'sunday'
  const sundayId         = session?.legacySundayId ?? ''
  const sundayDate       = session?.legacySundayId ? session.date : ''
  const eventId          = session?.legacySpecialEventId ?? null
  const eventName        = session?.type === 'event' ? session.name : null
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
      sundayId, sundayDate, eventId, eventName,
      sessionType, sessionDate,
      timezone, todaySundayDate, isViewingPast,
      navigateToEvent, navigateSunday,
    }}>
      <div className="h-screen flex flex-col overflow-hidden" style={{ background: '#111827' }}>
        <SiteHeader allSessions={allSessions} />
        <div className="flex flex-1 min-h-0">
          <Sidebar
            active={screen}
            setActive={setScreen}
            issueCount={issueCount}
            allSessions={allSessions}
            onSessionsChange={setAllSessions}
          />
          <main className="flex-1 min-w-0 overflow-y-auto bg-white" style={{ paddingBottom: '72px' }}>
            {screen === 'dashboard'  && <Dashboard   setScreen={setScreen} />}
            {screen === 'checklist'  && <Checklist />}
            {screen === 'issues'     && <IssueLog    sundayId={sundayId} eventId={eventId} />}
            {screen === 'data'       && <ServiceData />}
            {screen === 'evaluation' && <Evaluation />}
            {screen === 'analytics'  && <Analytics />}
            {screen === 'settings'   && <Settings onSessionsChange={setAllSessions} />}
          </main>
        </div>
        <MobileTabs active={screen} setActive={setScreen} issueCount={issueCount} />
      </div>
    </SundayContext.Provider>
  )
}
