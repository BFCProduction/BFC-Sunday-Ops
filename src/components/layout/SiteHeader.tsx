import { Calendar, Radio } from 'lucide-react'
import bfcLogo from '../../assets/BFC_Production_Logo_Hor reverse.png'

export function SiteHeader() {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <header className="site-header flex items-center justify-between px-4 md:px-6 h-14 flex-shrink-0"
      style={{ background: '#1a1a1a' }}>
      <div className="flex items-center gap-3">
        <img src={bfcLogo} alt="BFC Production" className="h-6 md:h-7 w-auto object-contain" />
        <span className="hidden md:inline text-gray-600 mx-1 text-sm">·</span>
        <span className="hidden md:inline text-gray-400 text-sm">Sunday Ops Hub</span>
      </div>
      <div className="flex items-center gap-3 md:gap-5">
        <div className="hidden md:flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-gray-500" />
          <span className="text-gray-500 text-xs">{today}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Radio className="w-3.5 h-3.5 text-emerald-400 pulse" />
          <span className="text-emerald-400 text-xs font-medium">Pre-Service</span>
        </div>
      </div>
    </header>
  )
}
