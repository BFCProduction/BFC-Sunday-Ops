import { useState, useEffect, useCallback } from 'react'
import { AdminProvider } from './context/AdminContext'
import { SundayContext } from './context/SundayContext'
import { getOrCreateSunday, getSundayByDate, loadChurchTimezone, loadFlipConfig } from './lib/supabase'
import { CHURCH_TIME_ZONE } from './lib/churchTime'
import { SiteHeader } from './components/layout/SiteHeader'
import { Sidebar } from './components/layout/Sidebar'
import { MobileTabs } from './components/layout/MobileTabs'
import { Dashboard } from './screens/Dashboard'
import { Checklist } from './screens/Checklist'
import { IssueLog } from './screens/IssueLog'
import { ServiceData } from './screens/ServiceData'
import { Evaluation } from './screens/Evaluation'
import { Analytics } from './screens/Analytics'
import { Settings } from './screens/Settings'
import { supabase } from './lib/supabase'

export type Screen = 'dashboard' | 'checklist' | 'issues' | 'data' | 'evaluation' | 'analytics' | 'settings'

export default function App() {
  const [screen, setScreen] = useState<Screen>('dashboard')

  // The real current Sunday — never changes after load
  const [todaySundayId, setTodaySundayId]     = useState('')
  const [todaySundayDate, setTodaySundayDate] = useState('')
  const [timezone, setTimezone]               = useState(CHURCH_TIME_ZONE)

  // The Sunday currently being viewed — may differ from today
  const [sundayId, setSundayId]     = useState('')
  const [sundayDate, setSundayDate] = useState('')

  const [issueCount, setIssueCount] = useState(0)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')

  useEffect(() => {
    Promise.all([loadChurchTimezone(), loadFlipConfig()])
      .then(([tz, { flipDay, flipHour }]) => {
        setTimezone(tz)
        return getOrCreateSunday(tz, flipDay, flipHour)
      })
      .then(sunday => {
        setTodaySundayId(sunday.id)
        setTodaySundayDate(sunday.date)
        setSundayId(sunday.id)
        setSundayDate(sunday.date)
        supabase.from('issues').select('id', { count: 'exact' })
          .eq('sunday_id', sunday.id)
          .in('severity', ['High', 'Critical'])
          .is('resolved_at', null)
          .then(({ count }) => setIssueCount(count || 0))
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  const navigateSunday = useCallback(async (date: string) => {
    if (date === todaySundayDate) {
      setSundayId(todaySundayId)
      setSundayDate(todaySundayDate)
      return
    }
    const row = await getSundayByDate(date)
    setSundayId(row?.id ?? '')
    setSundayDate(date)
  }, [todaySundayId, todaySundayDate])

  const isViewingPast = sundayDate !== '' && sundayDate !== todaySundayDate

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
    <SundayContext.Provider value={{ sundayId, sundayDate, timezone, todaySundayDate, isViewingPast, navigateSunday }}>
      <div className="h-screen flex flex-col overflow-hidden" style={{ background: '#111827' }}>
        <SiteHeader />
        <div className="flex flex-1 min-h-0">
          <Sidebar active={screen} setActive={setScreen} issueCount={issueCount} />
          <main className="flex-1 min-w-0 overflow-y-auto bg-white" style={{ paddingBottom: '72px' }}>
            {screen === 'dashboard'  && <Dashboard   sundayId={sundayId} setScreen={setScreen} />}
            {screen === 'checklist'  && <Checklist   sundayId={sundayId} />}
            {screen === 'issues'     && <IssueLog    sundayId={sundayId} />}
            {screen === 'data'       && <ServiceData  sundayId={sundayId} />}
            {screen === 'evaluation' && <Evaluation  sundayId={sundayId} />}
            {screen === 'analytics'  && <Analytics />}
            {screen === 'settings'   && <Settings />}
          </main>
        </div>
        <MobileTabs active={screen} setActive={setScreen} issueCount={issueCount} />
      </div>
    </SundayContext.Provider>
    </AdminProvider>
  )
}
