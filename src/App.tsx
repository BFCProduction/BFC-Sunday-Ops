import { useState, useEffect, useCallback } from 'react'
import { AdminProvider } from './context/AdminContext'
import { SundayContext } from './context/SundayContext'
import {
  getOrCreateSunday, getSundayByDate, getSpecialEventByDate,
  loadChurchTimezone, loadFlipConfig, loadAllSessions, supabase,
} from './lib/supabase'
import { getOperationalSundayDateString, CHURCH_TIME_ZONE } from './lib/churchTime'
import { SiteHeader } from './components/layout/SiteHeader'
import { Sidebar } from './components/layout/Sidebar'
import { MobileTabs } from './components/layout/MobileTabs'
import { Dashboard } from './screens/Dashboard'
import { Checklist } from './screens/Checklist'
import { EventChecklist } from './screens/EventChecklist'
import { IssueLog } from './screens/IssueLog'
import { ServiceData } from './screens/ServiceData'
import { Evaluation } from './screens/Evaluation'
import { Analytics } from './screens/Analytics'
import { Settings } from './screens/Settings'
import type { Session } from './types'

export type Screen = 'dashboard' | 'checklist' | 'issues' | 'data' | 'evaluation' | 'analytics' | 'settings'

export default function App() {
  const [screen, setScreen] = useState<Screen>('dashboard')

  // Timezone / flip config (loaded once)
  const [timezone, setTimezone] = useState(CHURCH_TIME_ZONE)

  // The "today" anchor — computed once at load, never changes during the session
  const [todaySundayDate, setTodaySundayDate] = useState('')
  const [todaySundayId,   setTodaySundayId]   = useState('')

  // The currently viewed session (Sunday or special event)
  const [session, setSession] = useState<Session | null>(null)

  // Flat list of all sessions for prev/next navigation
  const [allSessions, setAllSessions] = useState<Session[]>([])

  const [issueCount, setIssueCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const [tz, flip] = await Promise.all([loadChurchTimezone(), loadFlipConfig()])
      setTimezone(tz)

      const operationalDate = getOperationalSundayDateString(new Date(), tz, flip.flipDay, flip.flipHour)

      // Determine today's "anchor" Sunday (always a Sunday, never an event)
      const todaySunday = await getOrCreateSunday(tz, flip.flipDay, flip.flipHour)
      setTodaySundayId(todaySunday.id)
      setTodaySundayDate(todaySunday.date)

      // Check if there is a special event on or before the operational date
      // that should take focus over the Sunday
      const event = await getSpecialEventByDate(operationalDate)
      let focusSession: Session

      if (event) {
        focusSession = { type: 'event', id: event.id, date: event.event_date, name: event.name, eventTime: event.event_time }
      } else {
        // Check for upcoming events between today and the operational Sunday
        const today = new Date().toISOString().slice(0, 10)
        const { data: upcomingEvents } = await supabase
          .from('special_events')
          .select('*')
          .gte('event_date', today)
          .lte('event_date', operationalDate)
          .order('event_date', { ascending: true })
          .limit(1)

        if (upcomingEvents && upcomingEvents.length > 0) {
          const e = upcomingEvents[0]
          focusSession = { type: 'event', id: e.id, date: e.event_date, name: e.name, eventTime: e.event_time }
        } else {
          focusSession = { type: 'sunday', id: todaySunday.id, date: todaySunday.date }
        }
      }

      setSession(focusSession)

      // Load all sessions for navigation
      const sessions = await loadAllSessions()
      setAllSessions(sessions)

      // Issue count for the focused session
      await refreshIssueCount(focusSession)
    }

    init().catch(err => {
      setError(err.message)
      setLoading(false)
    }).then(() => setLoading(false))
  }, [])

  async function refreshIssueCount(s: Session) {
    if (s.type === 'sunday') {
      const { count } = await supabase
        .from('issues')
        .select('id', { count: 'exact' })
        .eq('sunday_id', s.id)
        .in('severity', ['High', 'Critical'])
        .is('resolved_at', null)
      setIssueCount(count || 0)
    } else {
      const { count } = await supabase
        .from('issues')
        .select('id', { count: 'exact' })
        .eq('event_id', s.id)
        .in('severity', ['High', 'Critical'])
        .is('resolved_at', null)
      setIssueCount(count || 0)
    }
  }

  // ── Navigation ────────────────────────────────────────────────────────────
  const navigateSunday = useCallback(async (date: string) => {
    // Check if there is a special event on this date first
    const event = await getSpecialEventByDate(date)
    if (event) {
      const s: Session = { type: 'event', id: event.id, date: event.event_date, name: event.name, eventTime: event.event_time }
      setSession(s)
      refreshIssueCount(s)
      // Ensure sessions list is up to date
      loadAllSessions().then(setAllSessions)
      return
    }

    // Otherwise treat it as a Sunday
    if (date === todaySundayDate) {
      const s: Session = { type: 'sunday', id: todaySundayId, date: todaySundayDate }
      setSession(s)
      refreshIssueCount(s)
      return
    }

    const row = await getSundayByDate(date)
    const s: Session = { type: 'sunday', id: row?.id ?? '', date }
    setSession(s)
    refreshIssueCount(s)
  }, [todaySundayId, todaySundayDate])

  // ── Derived context values ────────────────────────────────────────────────
  const sundayId   = session?.type === 'sunday' ? session.id   : ''
  const sundayDate = session?.type === 'sunday' ? session.date : ''
  const eventId    = session?.type === 'event'  ? session.id   : null
  const eventName  = session?.type === 'event'  ? session.name : null
  const sessionDate = session?.date ?? ''
  const sessionType = session?.type ?? 'sunday'

  // "today" anchor is always the operational Sunday; session may differ
  const todayAnchor = todaySundayDate
  const isViewingPast = !!session && session.date !== todayAnchor && session.date < todayAnchor

  if (loading) return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-gray-400 text-sm">Loading Sunday Ops...</p>
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
    <AdminProvider>
    <SundayContext.Provider value={{
      sundayId, sundayDate,
      eventId, eventName,
      sessionType, sessionDate,
      timezone, todaySundayDate, isViewingPast,
      navigateSunday,
    }}>
      <div className="h-screen flex flex-col overflow-hidden" style={{ background: '#111827' }}>
        <SiteHeader />
        <div className="flex flex-1 min-h-0">
          <Sidebar
            active={screen}
            setActive={setScreen}
            issueCount={issueCount}
            allSessions={allSessions}
          />
          <main className="flex-1 min-w-0 overflow-y-auto bg-white" style={{ paddingBottom: '72px' }}>
            {screen === 'dashboard'  && <Dashboard   sundayId={sundayId} setScreen={setScreen} />}
            {screen === 'checklist'  && sessionType === 'sunday' && <Checklist   sundayId={sundayId} />}
            {screen === 'checklist'  && sessionType === 'event'  && <EventChecklist eventId={eventId!} />}
            {screen === 'issues'     && <IssueLog    sundayId={sundayId} eventId={eventId} />}
            {screen === 'data'       && <ServiceData  sundayId={sundayId} eventId={eventId} />}
            {screen === 'evaluation' && <Evaluation  sundayId={sundayId} eventId={eventId} />}
            {screen === 'analytics'  && <Analytics />}
            {screen === 'settings'   && <Settings onSessionsChange={setAllSessions} />}
          </main>
        </div>
        <MobileTabs active={screen} setActive={setScreen} issueCount={issueCount} />
      </div>
    </SundayContext.Provider>
    </AdminProvider>
  )
}
