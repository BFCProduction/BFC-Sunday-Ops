import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Card } from '../../components/ui/Card'

interface LoudnessProps { sundayId: string }

const GOAL_9AM = 88
const GOAL_11AM = 94

interface NumFieldProps {
  label: string
  value: string
  onChange: (v: string) => void
  goal?: number
  accent: string
}

function NumField({ label, value, onChange, goal, accent }: NumFieldProps) {
  const over = goal && parseFloat(value) > goal

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-gray-500 text-xs font-medium">{label}</label>
        {goal && <span className="text-[10px] text-gray-400">goal ≤ {goal}</span>}
      </div>
      <input type="number" step="0.1" placeholder="e.g. 85.8" value={value} onChange={e => onChange(e.target.value)}
        className={`w-full rounded-lg px-3 py-2.5 text-sm font-mono border focus:outline-none transition-colors ${
          over ? 'bg-red-50 border-red-300 text-red-700 focus:border-red-400' :
          value ? 'bg-gray-50 border-gray-200 text-gray-900 focus:border-blue-500' :
          'bg-gray-50 border-gray-200 text-gray-900 focus:border-blue-500'
        }`}
        style={value && !over ? { borderColor: accent + '60' } : {}}
      />
      {over && <p className="text-red-500 text-[10px] mt-1 font-medium">Exceeds {goal} goal</p>}
    </div>
  )
}

export function LoudnessLog({ sundayId }: LoudnessProps) {
  const [s1Max, setS1Max] = useState('')
  const [s1LAeq, setS1LAeq] = useState('')
  const [s2Max, setS2Max] = useState('')
  const [s2LAeq, setS2LAeq] = useState('')
  const [history, setHistory] = useState<Array<{ date: string; s1Max: number; s1LAeq: number; s2Max: number; s2LAeq: number }>>([])

  const [s1Saving, setS1Saving] = useState(false)
  const [s1Saved, setS1Saved] = useState(false)
  const [s2Saving, setS2Saving] = useState(false)
  const [s2Saved, setS2Saved] = useState(false)

  useEffect(() => {
    supabase.from('loudness').select('*').eq('sunday_id', sundayId).single()
      .then(({ data }) => {
        if (data) {
          setS1Max(data.service_1_max_db?.toString() || '')
          setS1LAeq(data.service_1_laeq?.toString() || '')
          setS2Max(data.service_2_max_db?.toString() || '')
          setS2LAeq(data.service_2_laeq?.toString() || '')
        }
      })
    supabase.from('loudness').select('*, sundays(date)')
      .order('logged_at', { ascending: false }).limit(8)
      .then(({ data }) => {
        if (data) {
          setHistory(data.map((r: { sundays: { date: string }; service_1_max_db: number; service_1_laeq: number; service_2_max_db: number; service_2_laeq: number }) => ({
            date: new Date(r.sundays.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
            s1Max: r.service_1_max_db, s1LAeq: r.service_1_laeq,
            s2Max: r.service_2_max_db, s2LAeq: r.service_2_laeq,
          })))
        }
      })
  }, [sundayId])

  const submitS1 = async () => {
    setS1Saving(true)
    await supabase.from('loudness').upsert({
      sunday_id: sundayId,
      service_1_max_db: s1Max ? parseFloat(s1Max) : null,
      service_1_laeq: s1LAeq ? parseFloat(s1LAeq) : null,
      logged_at: new Date().toISOString(),
    }, { onConflict: 'sunday_id' })
    setS1Saving(false)
    setS1Saved(true)
    setTimeout(() => setS1Saved(false), 2500)
  }

  const submitS2 = async () => {
    setS2Saving(true)
    await supabase.from('loudness').upsert({
      sunday_id: sundayId,
      service_2_max_db: s2Max ? parseFloat(s2Max) : null,
      service_2_laeq: s2LAeq ? parseFloat(s2LAeq) : null,
      logged_at: new Date().toISOString(),
    }, { onConflict: 'sunday_id' })
    setS2Saving(false)
    setS2Saved(true)
    setTimeout(() => setS2Saved(false), 2500)
  }

  const s1Over = parseFloat(s1LAeq) > GOAL_9AM
  const s2Over = parseFloat(s2LAeq) > GOAL_11AM

  const avg = (vals: number[]) => vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : '—'
  const avg9LAeq = avg(history.filter(r => r.s1LAeq).map(r => r.s1LAeq))
  const avg11LAeq = avg(history.filter(r => r.s2LAeq).map(r => r.s2LAeq))

  return (
    <div className="space-y-5 fade-in">
      {/* Running averages */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: '9am Avg Max dB A',  value: avg(history.map(r => r.s1Max)),  color: '#06b6d4' },
          { label: '9am Avg LAeq 15',   value: avg9LAeq, color: '#ec4899', goal: GOAL_9AM,  over: parseFloat(avg9LAeq) > GOAL_9AM },
          { label: '11am Avg Max dB A', value: avg(history.map(r => r.s2Max)), color: '#f97316' },
          { label: '11am Avg LAeq 15',  value: avg11LAeq,color: '#a855f7', goal: GOAL_11AM, over: parseFloat(avg11LAeq) > GOAL_11AM },
        ].map(s => (
          <Card key={s.label} className={`p-4 ${s.over ? 'border-red-200 bg-red-50' : ''}`}>
            <p className="text-gray-400 text-[10px] font-medium mb-1">{s.label}</p>
            <p className="text-2xl font-bold" style={{ color: s.over ? '#dc2626' : s.color }}>
              {s.value}<span className="text-sm font-normal text-gray-400 ml-1">dB</span>
            </p>
            {s.goal && <p className="text-[10px] mt-1" style={{ color: s.over ? '#dc2626' : '#9ca3af' }}>goal ≤ {s.goal}</p>}
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[400px_1fr] gap-5 items-start">
        {/* Entry forms */}
        <div className="space-y-4">
          {/* 9am Service */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center gap-2 pb-1 border-b border-gray-100">
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
              <span className="text-cyan-600 text-xs font-semibold">9:00 AM Service</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <NumField label="Max dB A Slow" value={s1Max} onChange={setS1Max} accent="#06b6d4" />
              <NumField label="LAeq 15" value={s1LAeq} onChange={setS1LAeq} goal={GOAL_9AM} accent="#ec4899" />
            </div>
            {s1Over && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700 leading-relaxed">
                9am LAeq 15 exceeds goal. This will be flagged in the weekly average report.
              </div>
            )}
            <button onClick={submitS1} disabled={s1Saving}
              className={`w-full py-2.5 rounded-lg font-semibold text-sm transition-all ${s1Saved ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95 disabled:opacity-60'}`}>
              {s1Saving ? 'Saving...' : s1Saved ? 'Saved ✓' : 'Log 9am Readings'}
            </button>
          </Card>

          {/* 11am Service */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center gap-2 pb-1 border-b border-gray-100">
              <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />
              <span className="text-orange-600 text-xs font-semibold">11:00 AM Service</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <NumField label="Max dB A Slow" value={s2Max} onChange={setS2Max} accent="#f97316" />
              <NumField label="LAeq 15" value={s2LAeq} onChange={setS2LAeq} goal={GOAL_11AM} accent="#a855f7" />
            </div>
            {s2Over && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700 leading-relaxed">
                11am LAeq 15 exceeds goal. This will be flagged in the weekly average report.
              </div>
            )}
            <button onClick={submitS2} disabled={s2Saving}
              className={`w-full py-2.5 rounded-lg font-semibold text-sm transition-all ${s2Saved ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95 disabled:opacity-60'}`}>
              {s2Saving ? 'Saving...' : s2Saved ? 'Saved ✓' : 'Log 11am Readings'}
            </button>
          </Card>
        </div>

        {/* History table */}
        <div>
          <p className="text-gray-400 text-[11px] font-semibold uppercase tracking-widest mb-2.5">Recent Sundays</p>
          <Card className="overflow-hidden">
            <div className="grid grid-cols-5 px-4 py-2 border-b border-gray-100 bg-gray-50">
              <span className="text-gray-400 text-[10px] font-semibold">Date</span>
              <span className="text-cyan-600 text-[10px] font-semibold text-right">9am Max</span>
              <span className="text-pink-600 text-[10px] font-semibold text-right">9am LAeq</span>
              <span className="text-orange-600 text-[10px] font-semibold text-right">11am Max</span>
              <span className="text-purple-600 text-[10px] font-semibold text-right">11am LAeq</span>
            </div>
            {history.length === 0 && (
              <div className="px-4 py-6 text-center text-gray-400 text-xs">No history yet</div>
            )}
            {history.map((row, i) => {
              const r9 = row.s1LAeq > GOAL_9AM
              const r11 = row.s2LAeq > GOAL_11AM
              return (
                <div key={i} className={`grid grid-cols-5 px-4 py-2.5 ${i < history.length - 1 ? 'border-b border-gray-50' : ''} ${r9 || r11 ? 'bg-red-50' : ''}`}>
                  <span className="text-gray-600 text-xs">{row.date}</span>
                  <span className="text-cyan-600 text-xs font-mono text-right">{row.s1Max || '—'}</span>
                  <span className={`text-xs font-mono font-semibold text-right ${r9 ? 'text-red-600' : 'text-pink-600'}`}>{row.s1LAeq || '—'}{r9 && ' !'}</span>
                  <span className="text-orange-600 text-xs font-mono text-right">{row.s2Max || '—'}</span>
                  <span className={`text-xs font-mono font-semibold text-right ${r11 ? 'text-red-600' : 'text-purple-600'}`}>{row.s2LAeq || '—'}{r11 && ' !'}</span>
                </div>
              )
            })}
            <div className="grid grid-cols-5 px-4 py-2 bg-gray-50 border-t border-gray-100">
              <span className="text-gray-500 text-[10px] font-bold">Goal</span>
              <span className="text-gray-300 text-[10px] text-right">—</span>
              <span className="text-gray-500 text-[10px] font-bold text-right">≤{GOAL_9AM}</span>
              <span className="text-gray-300 text-[10px] text-right">—</span>
              <span className="text-gray-500 text-[10px] font-bold text-right">≤{GOAL_11AM}</span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
