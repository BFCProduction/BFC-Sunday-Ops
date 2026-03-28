import { useState } from 'react'
import { BarChart2, LayoutDashboard, MessageSquare } from 'lucide-react'
import { Explorer } from './Explorer'

type AnalyticsTab = 'explorer' | 'dashboard' | 'ai'

const TABS: { id: AnalyticsTab; label: string; icon: React.ElementType }[] = [
  { id: 'explorer',   label: 'Data Explorer', icon: BarChart2      },
  { id: 'dashboard',  label: 'Dashboard',     icon: LayoutDashboard },
  { id: 'ai',         label: 'Ask a Question', icon: MessageSquare  },
]

export function Analytics() {
  const [tab, setTab] = useState<AnalyticsTab>('explorer')

  return (
    <div className="fade-in">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 px-5 pt-4 pb-3">
        <h2 className="text-gray-900 font-bold text-lg mb-2.5">Analytics</h2>
        <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5 w-fit">
          {TABS.map(t => {
            const Icon = t.icon
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${
                  tab === t.id
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Content */}
      <div className="p-5">
        {tab === 'explorer' && <Explorer />}
        {tab === 'dashboard' && <DashboardPlaceholder />}
        {tab === 'ai'        && <AIPlaceholder />}
      </div>
    </div>
  )
}

function DashboardPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center mb-4">
        <LayoutDashboard className="w-6 h-6 text-blue-500" />
      </div>
      <p className="text-gray-900 font-semibold mb-1">Dashboard Coming Soon</p>
      <p className="text-gray-400 text-sm max-w-xs">
        KPI cards, trend charts, year-over-year comparisons, and your district report — all in one view.
      </p>
    </div>
  )
}

function AIPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center mb-4">
        <MessageSquare className="w-6 h-6 text-purple-500" />
      </div>
      <p className="text-gray-900 font-semibold mb-1">AI Insights Coming Soon</p>
      <p className="text-gray-400 text-sm max-w-xs">
        Ask questions like "average attendance when temp &lt; 32°F" or "Sundays after a loudness exceedance" in plain English.
      </p>
    </div>
  )
}
