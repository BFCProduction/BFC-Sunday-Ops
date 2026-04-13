import { LayoutDashboard, ClipboardCheck, AlertTriangle, BarChart2, Star } from 'lucide-react'

type Screen = 'dashboard' | 'checklist' | 'issues' | 'data' | 'evaluation' | 'analytics' | 'settings'

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
  { id: 'evaluation' as Screen, label: 'Eval',       icon: Star            },
]

export function MobileTabs({ active, setActive, issueCount }: MobileTabsProps) {
  return (
    <div
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white flex justify-center"
      style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
    >
      <nav
        className="flex items-center justify-around w-4/5 rounded-full px-3 py-2"
        style={{
          background: '#1c1c1e',
          boxShadow: '0 4px 24px rgba(0,0,0,0.18), 0 1.5px 6px rgba(0,0,0,0.12)',
        }}
      >
        {tabs.map(tab => {
          const Icon = tab.icon
          const isActive = active === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              className="flex flex-col items-center relative px-3 py-1"
            >
              <Icon
                className={`w-5 h-5 ${isActive ? 'text-white' : 'text-gray-500'}`}
                strokeWidth={isActive ? 2.2 : 1.8}
              />
              <span className={`text-[10px] font-medium mt-0.5 ${isActive ? 'text-white' : 'text-gray-500'}`}>
                {tab.label}
              </span>
              {isActive && (
                <span className="mt-0.5 w-1 h-1 rounded-full bg-blue-500" />
              )}
              {!isActive && <span className="mt-0.5 w-1 h-1" />}
              {tab.id === 'issues' && issueCount > 0 && (
                <span className="absolute top-0.5 right-1.5 bg-red-600 text-white text-[8px] font-bold rounded-full px-1 pulse">
                  {issueCount}
                </span>
              )}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
