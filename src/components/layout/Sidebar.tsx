import { useState } from 'react'
import {
  LayoutDashboard, ClipboardCheck, AlertTriangle,
  BarChart2, Star, Calendar, Radio, BookOpen, ExternalLink,
  Lock, LockOpen,
} from 'lucide-react'
import { useAdmin } from '../../context/adminState'
import { AdminPasswordModal } from '../admin/AdminPasswordModal'

type Screen = 'dashboard' | 'checklist' | 'issues' | 'data' | 'evaluation'

interface SidebarProps {
  active: Screen
  setActive: (s: Screen) => void
  issueCount: number
  sundayDate: string
}

const navItems = [
  { id: 'dashboard'   as Screen, label: 'Dashboard',               icon: LayoutDashboard },
  { id: 'checklist'   as Screen, label: 'Gameday Checklist',        icon: ClipboardCheck  },
  { id: 'issues'      as Screen, label: 'Issue Log',                icon: AlertTriangle   },
  { id: 'data'        as Screen, label: 'Service Data',             icon: BarChart2       },
  { id: 'evaluation'  as Screen, label: 'Post-Service Evaluation',  icon: Star            },
]

export function Sidebar({ active, setActive, issueCount, sundayDate }: SidebarProps) {
  const { isAdmin, logout } = useAdmin()
  const [showAdminModal, setShowAdminModal] = useState(false)
  const dateFormatted = new Date(sundayDate + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })

  return (
    <aside className="hidden md:flex flex-col flex-shrink-0 border-r border-white/[0.06] overflow-y-auto"
      style={{ width: 260, background: '#0d0d0d', position: 'sticky', top: 56, height: 'calc(100vh - 56px)' }}>

      <div className="px-4 pt-5 pb-4 border-b border-white/[0.05]">
        <div className="flex items-center gap-2 mb-1">
          <Calendar className="w-3.5 h-3.5 text-gray-600" />
          <p className="text-gray-600 text-[10px] font-semibold uppercase tracking-widest">Today</p>
        </div>
        <p className="text-white text-sm font-semibold">{dateFormatted}</p>
        <div className="flex gap-2 mt-2 flex-wrap">
          <span className="flex items-center gap-1.5 bg-emerald-500/15 text-emerald-400 text-[10px] font-medium px-2 py-0.5 rounded-full">
            <Radio className="w-2.5 h-2.5" />Pre-Service
          </span>
          <span className="bg-blue-500/15 text-blue-400 text-[10px] font-medium px-2 py-0.5 rounded-full">
            9:00 · 11:00
          </span>
        </div>
        <p className="text-gray-700 text-[10px] mt-2">Resets each Sunday at midnight</p>
      </div>

      <nav className="flex-1 px-3 py-3 space-y-0.5 flex flex-col">
        {navItems.map(item => {
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

        <div className="mt-auto pt-4 border-t border-white/[0.05] space-y-0.5">
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

          {isAdmin ? (
            <button onClick={logout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-amber-500 hover:text-amber-400 hover:bg-white/[0.04] transition-all">
              <LockOpen className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={1.8} />
              <span className="flex-1 leading-tight">Exit Admin</span>
            </button>
          ) : (
            <button onClick={() => setShowAdminModal(true)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-400 hover:bg-white/[0.04] transition-all">
              <Lock className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={1.8} />
              <span className="flex-1 leading-tight">Admin</span>
            </button>
          )}
        </div>

        {showAdminModal && <AdminPasswordModal onClose={() => setShowAdminModal(false)} />}
      </nav>
    </aside>
  )
}
