import { LayoutDashboard, ClipboardCheck, AlertTriangle, BarChart2, Star } from 'lucide-react'

type Screen = 'dashboard' | 'checklist' | 'issues' | 'data' | 'evaluation'

interface MobileTabsProps {
  active: Screen
  setActive: (s: Screen) => void
  issueCount: number
}

const tabs = [
  { id: 'dashboard'  as Screen, label: 'Dashboard',  icon: LayoutDashboard },
  { id: 'checklist'  as Screen, label: 'Checklist',  icon: ClipboardCheck  },
  { id: 'issues'     as Screen, label: 'Issues',     icon: AlertTriangle   },
  { id: 'data'       as Screen, label: 'Service',    icon: BarChart2       },
  { id: 'evaluation' as Screen, label: 'Evaluation', icon: Star            },
]

export function MobileTabs({ active, setActive, issueCount }: MobileTabsProps) {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white flex justify-around"
      style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}>
      {tabs.map(tab => {
        const Icon = tab.icon
        const isActive = active === tab.id
        return (
          <button key={tab.id} onClick={() => setActive(tab.id)}
            className="flex flex-col items-center gap-0.5 px-2 pt-2 pb-1 relative min-w-0">
            <Icon className={`w-5 h-5 ${isActive ? 'text-blue-600' : 'text-gray-400'}`}
              strokeWidth={isActive ? 2.3 : 1.8} />
            <span className={`text-[10px] font-medium ${isActive ? 'text-blue-600' : 'text-gray-400'}`}>
              {tab.label}
            </span>
            {tab.id === 'issues' && issueCount > 0 && (
              <span className="absolute top-1 right-0.5 bg-red-600 text-white text-[8px] font-bold rounded-full px-1 pulse">
                {issueCount}
              </span>
            )}
          </button>
        )
      })}
    </nav>
  )
}
