import { Calendar, Radio } from 'lucide-react'

export function SiteHeader() {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <header className="site-header hidden md:flex items-center justify-between px-6 h-14 flex-shrink-0"
      style={{ background: '#1a1a1a' }}>
      <div className="flex items-center gap-3">
        <div className="w-7 h-7 bg-white/10 border border-white/20 rounded flex items-center justify-center">
          <span className="text-white font-black text-[10px] leading-none">BFC</span>
        </div>
        <span className="text-white font-bold text-sm tracking-tight">BFC Production</span>
        <span className="text-gray-600 mx-1 text-sm">·</span>
        <span className="text-gray-400 text-sm">Sunday Ops Hub</span>
      </div>
      <div className="flex items-center gap-5">
        <div className="flex items-center gap-1.5">
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
