import { useEffect, useState } from 'react'
import { Calendar, Radio } from 'lucide-react'
import bfcLogo from '../../assets/BFC_Production_Logo_Hor reverse.png'
import { getServicePhase, type ServicePhase } from '../../lib/serviceStatus'
import { useSunday } from '../../context/SundayContext'

export function SiteHeader() {
  const { timezone } = useSunday()
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  const [phase, setPhase] = useState<ServicePhase | null>(() => getServicePhase(new Date(), timezone))

  useEffect(() => {
    setPhase(getServicePhase(new Date(), timezone))
    const id = setInterval(() => setPhase(getServicePhase(new Date(), timezone)), 60_000)
    return () => clearInterval(id)
  }, [timezone])

  return (
    <header className="site-header flex items-center justify-between px-4 md:px-6 h-14 flex-shrink-0"
      style={{ background: '#1a1a1a' }}>
      <div className="flex items-center gap-3">
        <img src={bfcLogo} alt="BFC Production" className="h-6 md:h-7 w-auto object-contain" />
        <span className="hidden md:inline text-gray-600 mx-1 text-sm">·</span>
        <span className="hidden md:inline text-gray-400 text-sm">Sunday Ops</span>
      </div>
      <div className="flex items-center gap-3 md:gap-5">
        <div className="hidden md:flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-gray-500" />
          <span className="text-gray-500 text-xs">{today}</span>
        </div>
        {phase && (
          <div className="flex items-center gap-1.5">
            {phase.pulse && <Radio className={`w-3.5 h-3.5 ${phase.text} pulse`} />}
            <span className={`${phase.text} text-xs font-medium`}>{phase.label}</span>
          </div>
        )}
      </div>
    </header>
  )
}
