import { useState, useEffect, createContext, useContext } from 'react'
import { AdminProvider } from './context/AdminContext'
import { getOrCreateSunday } from './lib/supabase'
import { SiteHeader } from './components/layout/SiteHeader'
import { Sidebar } from './components/layout/Sidebar'
import { MobileTabs } from './components/layout/MobileTabs'
import { Dashboard } from './screens/Dashboard'
import { Checklist } from './screens/Checklist'
import { IssueLog } from './screens/IssueLog'
import { ServiceData } from './screens/ServiceData'
import { Evaluation } from './screens/Evaluation'
import { supabase } from './lib/supabase'

type Screen = 'dashboard' | 'checklist' | 'issues' | 'data' | 'evaluation'

interface SundayContextType {
  sundayId: string
  sundayDate: string
}

export const SundayContext = createContext<SundayContextType>({ sundayId: '', sundayDate: '' })
export const useSunday = () => useContext(SundayContext)

export default function App() {
  const [screen, setScreen] = useState<Screen>('dashboard')
  const [sundayId, setSundayId] = useState('')
  const [sundayDate, setSundayDate] = useState('')
  const [issueCount, setIssueCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    getOrCreateSunday()
      .then(sunday => {
        setSundayId(sunday.id)
        setSundayDate(sunday.date)
        // Fetch high-priority issue count for badge
        supabase.from('issues').select('id', { count: 'exact' })
          .eq('sunday_id', sunday.id)
          .in('severity', ['High', 'Critical'])
          .then(({ count }) => setIssueCount(count || 0))
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

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
    <SundayContext.Provider value={{ sundayId, sundayDate }}>
      <div className="min-h-screen flex flex-col" style={{ background: '#111827' }}>
        <SiteHeader />
        <div className="flex flex-1 min-h-0">
          <Sidebar active={screen} setActive={setScreen} issueCount={issueCount} sundayDate={sundayDate} />
          <main className="flex-1 min-w-0 overflow-y-auto bg-white" style={{ paddingBottom: '72px' }}>
            {screen === 'dashboard'  && <Dashboard   sundayId={sundayId} setScreen={setScreen} />}
            {screen === 'checklist'  && <Checklist   sundayId={sundayId} />}
            {screen === 'issues'     && <IssueLog    sundayId={sundayId} />}
            {screen === 'data'       && <ServiceData  sundayId={sundayId} />}
            {screen === 'evaluation' && <Evaluation  sundayId={sundayId} />}
          </main>
        </div>
        <MobileTabs active={screen} setActive={setScreen} issueCount={issueCount} />
      </div>
    </SundayContext.Provider>
    </AdminProvider>
  )
}
