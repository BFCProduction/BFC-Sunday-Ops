import { useState } from 'react'
import { Attendance } from './Attendance'
import { Runtimes } from './Runtimes'
import { Weather } from './Weather'
import { LoudnessLog } from './LoudnessLog'

interface ServiceDataProps { sundayId: string }

const TABS = [
  { id: 'attendance', label: 'Attendance' },
  { id: 'runtimes',   label: 'Runtimes'   },
  { id: 'weather',    label: 'Weather'    },
  { id: 'loudness',   label: 'Loudness'   },
] as const

type TabId = typeof TABS[number]['id']

export function ServiceData({ sundayId }: ServiceDataProps) {
  const [tab, setTab] = useState<TabId>('attendance')

  return (
    <div className="fade-in">
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 px-5 pt-4 pb-3">
        <h2 className="text-gray-900 font-bold text-lg mb-2.5">Service Data</h2>
        <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5 w-fit">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="p-5">
        {tab === 'attendance' && <Attendance sundayId={sundayId} />}
        {tab === 'runtimes'   && <Runtimes sundayId={sundayId} />}
        {tab === 'weather'    && <Weather sundayId={sundayId} />}
        {tab === 'loudness'   && <LoudnessLog sundayId={sundayId} />}
      </div>
    </div>
  )
}
