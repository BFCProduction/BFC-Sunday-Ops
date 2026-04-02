import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useSunday } from '../../context/SundayContext'
import { Card } from '../../components/ui/Card'
import { generateLoudnessReportHtml } from '../../lib/generateLoudnessReportHtml'
import bfcLogo from '../../assets/BFC_Production_Logo_Hor reverse.png'

interface LoudnessProps { sundayId: string; eventId?: string | null }

const GOAL_9AM  = 88
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

// ── Sync loudness readings into service_records so the Data Explorer stays current ──

async function syncToServiceRecords(
  sundayId: string,
  sundayDate: string,
  serviceType: 'regular_9am' | 'regular_11am',
  fields: {
    max_db_a_slow: number | null
    la_eq_15: number | null
    max_db_c_slow: number | null
    lc_eq_15: number | null
  },
) {
  const { data: existing } = await supabase
    .from('service_records')
    .select('id')
    .eq('service_date', sundayDate)
    .eq('service_type', serviceType)
    .maybeSingle()

  if (existing) {
    await supabase
      .from('service_records')
      .update(fields)
      .eq('id', existing.id)
  } else {
    await supabase
      .from('service_records')
      .insert({ service_date: sundayDate, service_type: serviceType, sunday_id: sundayId, ...fields })
  }
}

export function LoudnessLog({ sundayId, eventId }: LoudnessProps) {
  const { sundayDate } = useSunday()

  // A-weighted
  const [s1Max,  setS1Max]  = useState('')
  const [s1LAeq, setS1LAeq] = useState('')
  const [s2Max,  setS2Max]  = useState('')
  const [s2LAeq, setS2LAeq] = useState('')

  // C-weighted
  const [s1MaxC,  setS1MaxC]  = useState('')
  const [s1LCeq,  setS1LCeq]  = useState('')
  const [s2MaxC,  setS2MaxC]  = useState('')
  const [s2LCeq,  setS2LCeq]  = useState('')

  const [history, setHistory] = useState<Array<{
    date: string
    s1Max: number; s1MaxC: number; s1LAeq: number; s1LCeq: number
    s2Max: number; s2MaxC: number; s2LAeq: number; s2LCeq: number
  }>>([])

  const [s1Saving, setS1Saving] = useState(false)
  const [s1Saved,  setS1Saved]  = useState(false)
  const [s2Saving, setS2Saving] = useState(false)
  const [s2Saved,  setS2Saved]  = useState(false)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    const q = supabase.from('loudness').select('*')
    const filtered = eventId ? q.eq('event_id', eventId) : q.eq('sunday_id', sundayId)
    filtered.maybeSingle().then(({ data }) => {
        if (data) {
          setS1Max(data.service_1_max_db?.toString() || '')
          setS1LAeq(data.service_1_laeq?.toString() || '')
          setS2Max(data.service_2_max_db?.toString() || '')
          setS2LAeq(data.service_2_laeq?.toString() || '')
          setS1MaxC(data.service_1_max_db_c?.toString() || '')
          setS1LCeq(data.service_1_lceq?.toString() || '')
          setS2MaxC(data.service_2_max_db_c?.toString() || '')
          setS2LCeq(data.service_2_lceq?.toString() || '')
        }
      })
    supabase.from('loudness').select('*, sundays(date)')
      .order('logged_at', { ascending: false }).limit(8)
      .then(({ data }) => {
        if (data) {
          setHistory(data.map((r: {
            sundays: { date: string }
            service_1_max_db: number; service_1_max_db_c: number; service_1_laeq: number; service_1_lceq: number
            service_2_max_db: number; service_2_max_db_c: number; service_2_laeq: number; service_2_lceq: number
          }) => ({
            date: new Date(r.sundays.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
            s1Max: r.service_1_max_db, s1MaxC: r.service_1_max_db_c, s1LAeq: r.service_1_laeq, s1LCeq: r.service_1_lceq,
            s2Max: r.service_2_max_db, s2MaxC: r.service_2_max_db_c, s2LAeq: r.service_2_laeq, s2LCeq: r.service_2_lceq,
          })))
        }
      })
  }, [sundayId, eventId])

  async function loudnessUpsert(fields: Record<string, unknown>) {
    if (eventId) {
      const { data: existing } = await supabase.from('loudness').select('id').eq('event_id', eventId).maybeSingle()
      const payload = { event_id: eventId, ...fields, logged_at: new Date().toISOString() }
      if (existing) {
        await supabase.from('loudness').update(payload).eq('id', existing.id)
      } else {
        await supabase.from('loudness').insert(payload)
      }
    } else {
      await supabase.from('loudness').upsert({ sunday_id: sundayId, ...fields, logged_at: new Date().toISOString() }, { onConflict: 'sunday_id' })
    }
  }

  const submitS1 = async () => {
    setS1Saving(true)
    await loudnessUpsert({
      service_1_max_db:   s1Max   ? parseFloat(s1Max)   : null,
      service_1_laeq:     s1LAeq  ? parseFloat(s1LAeq)  : null,
      service_1_max_db_c: s1MaxC  ? parseFloat(s1MaxC)  : null,
      service_1_lceq:     s1LCeq  ? parseFloat(s1LCeq)  : null,
    })
    await syncToServiceRecords(sundayId, sundayDate, 'regular_9am', {
      max_db_a_slow: s1Max   ? parseFloat(s1Max)   : null,
      la_eq_15:      s1LAeq  ? parseFloat(s1LAeq)  : null,
      max_db_c_slow: s1MaxC  ? parseFloat(s1MaxC)  : null,
      lc_eq_15:      s1LCeq  ? parseFloat(s1LCeq)  : null,
    })
    setS1Saving(false)
    setS1Saved(true)
    setTimeout(() => setS1Saved(false), 2500)
  }

  const submitS2 = async () => {
    setS2Saving(true)
    await loudnessUpsert({
      service_2_max_db:   s2Max   ? parseFloat(s2Max)   : null,
      service_2_laeq:     s2LAeq  ? parseFloat(s2LAeq)  : null,
      service_2_max_db_c: s2MaxC  ? parseFloat(s2MaxC)  : null,
      service_2_lceq:     s2LCeq  ? parseFloat(s2LCeq)  : null,
    })
    await syncToServiceRecords(sundayId, sundayDate, 'regular_11am', {
      max_db_a_slow: s2Max   ? parseFloat(s2Max)   : null,
      la_eq_15:      s2LAeq  ? parseFloat(s2LAeq)  : null,
      max_db_c_slow: s2MaxC  ? parseFloat(s2MaxC)  : null,
      lc_eq_15:      s2LCeq  ? parseFloat(s2LCeq)  : null,
    })
    setS2Saving(false)
    setS2Saved(true)
    setTimeout(() => setS2Saved(false), 2500)
  }

  const exportPdf = async () => {
    setExporting(true)
    try {
      const { data } = await supabase
        .from('loudness')
        .select('*, sundays(date)')
        .order('sunday_id')
      const rows = (data ?? []).map((r: {
        sundays: { date: string }
        service_1_max_db: number | null
        service_1_laeq:   number | null
        service_2_max_db: number | null
        service_2_laeq:   number | null
      }) => ({
        date: r.sundays.date,
        service_1_max_db: r.service_1_max_db,
        service_1_laeq:   r.service_1_laeq,
        service_2_max_db: r.service_2_max_db,
        service_2_laeq:   r.service_2_laeq,
      }))
      const logoBase64 = await new Promise<string>((resolve) => {
        fetch(bfcLogo).then(r => r.blob()).then(blob => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = () => resolve('')
          reader.readAsDataURL(blob)
        }).catch(() => resolve(''))
      })
      const html = generateLoudnessReportHtml(rows, logoBase64)
      const win = window.open('', '_blank')
      if (!win) { alert('Pop-up was blocked. Please allow pop-ups for this site and try again.'); return }
      win.document.write(html)
      win.document.close()
      win.focus()
      setTimeout(() => win.print(), 600)
    } finally {
      setExporting(false)
    }
  }

  const s1Over = parseFloat(s1LAeq) > GOAL_9AM
  const s2Over = parseFloat(s2LAeq) > GOAL_11AM

  const avg = (vals: number[]) => vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : '—'
  const avg9LAeq  = avg(history.filter(r => r.s1LAeq).map(r => r.s1LAeq))
  const avg11LAeq = avg(history.filter(r => r.s2LAeq).map(r => r.s2LAeq))
  const avg9LCeq  = avg(history.filter(r => r.s1LCeq).map(r => r.s1LCeq))
  const avg11LCeq = avg(history.filter(r => r.s2LCeq).map(r => r.s2LCeq))

  return (
    <div className="space-y-5 fade-in">
      {/* Running averages */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {[
          { label: '9am Avg Max dB A',  value: avg(history.map(r => r.s1Max)),  color: '#06b6d4' },
          { label: '9am Avg LAeq 15',   value: avg9LAeq,  color: '#ec4899', goal: GOAL_9AM,  over: parseFloat(avg9LAeq)  > GOAL_9AM  },
          { label: '9am Avg LCeq 15',   value: avg9LCeq,  color: '#8b5cf6' },
          { label: '11am Avg Max dB A', value: avg(history.map(r => r.s2Max)), color: '#f97316' },
          { label: '11am Avg LAeq 15',  value: avg11LAeq, color: '#a855f7', goal: GOAL_11AM, over: parseFloat(avg11LAeq) > GOAL_11AM },
          { label: '11am Avg LCeq 15',  value: avg11LCeq, color: '#d97706' },
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

      <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-5 items-start">
        {/* Entry forms */}
        <div className="space-y-4">
          {/* 9am Service */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center gap-2 pb-1 border-b border-gray-100">
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
              <span className="text-cyan-600 text-xs font-semibold">9:00 AM Service</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <NumField label="Max dB A Slow" value={s1Max}   onChange={setS1Max}   accent="#06b6d4" />
              <NumField label="LAeq 15"        value={s1LAeq}  onChange={setS1LAeq}  goal={GOAL_9AM} accent="#ec4899" />
              <NumField label="Max dB C Slow"  value={s1MaxC}  onChange={setS1MaxC}  accent="#8b5cf6" />
              <NumField label="LCeq 15"        value={s1LCeq}  onChange={setS1LCeq}  accent="#8b5cf6" />
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
              <NumField label="Max dB A Slow" value={s2Max}   onChange={setS2Max}   accent="#f97316" />
              <NumField label="LAeq 15"        value={s2LAeq}  onChange={setS2LAeq}  goal={GOAL_11AM} accent="#a855f7" />
              <NumField label="Max dB C Slow"  value={s2MaxC}  onChange={setS2MaxC}  accent="#d97706" />
              <NumField label="LCeq 15"        value={s2LCeq}  onChange={setS2LCeq}  accent="#d97706" />
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
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-gray-400 text-[11px] font-semibold uppercase tracking-widest">Recent Sundays</p>
            <button onClick={exportPdf} disabled={exporting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 active:scale-95 transition-all disabled:opacity-50">
              {exporting ? 'Generating…' : '↓ Full History PDF'}
            </button>
          </div>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full" style={{ minWidth: 720 }}>
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-4 py-2 text-gray-400 text-[10px] font-semibold text-left whitespace-nowrap">Date</th>
                    <th className="px-3 py-2 text-cyan-600  text-[10px] font-semibold text-right whitespace-nowrap">9am Max A</th>
                    <th className="px-3 py-2 text-violet-400 text-[10px] font-semibold text-right whitespace-nowrap">9am Max C</th>
                    <th className="px-3 py-2 text-pink-600  text-[10px] font-semibold text-right whitespace-nowrap">9am LAeq</th>
                    <th className="px-3 py-2 text-violet-500 text-[10px] font-semibold text-right whitespace-nowrap">9am LCeq</th>
                    <th className="px-3 py-2 text-orange-600 text-[10px] font-semibold text-right whitespace-nowrap">11am Max A</th>
                    <th className="px-3 py-2 text-amber-500 text-[10px] font-semibold text-right whitespace-nowrap">11am Max C</th>
                    <th className="px-3 py-2 text-purple-600 text-[10px] font-semibold text-right whitespace-nowrap">11am LAeq</th>
                    <th className="px-3 py-2 text-amber-600  text-[10px] font-semibold text-right whitespace-nowrap">11am LCeq</th>
                  </tr>
                </thead>
                <tbody>
                  {history.length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-6 text-center text-gray-400 text-xs">No history yet</td></tr>
                  )}
                  {history.map((row, i) => {
                    const r9  = row.s1LAeq > GOAL_9AM
                    const r11 = row.s2LAeq > GOAL_11AM
                    return (
                      <tr key={i} className={`border-b border-gray-50 ${r9 || r11 ? 'bg-red-50' : ''}`}>
                        <td className="px-4 py-2.5 text-gray-600 text-xs whitespace-nowrap">{row.date}</td>
                        <td className="px-3 py-2.5 text-cyan-600    text-xs font-mono text-right">{row.s1Max   || '—'}</td>
                        <td className="px-3 py-2.5 text-violet-400  text-xs font-mono text-right">{row.s1MaxC  || '—'}</td>
                        <td className={`px-3 py-2.5 text-xs font-mono font-semibold text-right ${r9  ? 'text-red-600' : 'text-pink-600'}`}>{row.s1LAeq  || '—'}{r9  && ' !'}</td>
                        <td className="px-3 py-2.5 text-violet-500  text-xs font-mono text-right">{row.s1LCeq  || '—'}</td>
                        <td className="px-3 py-2.5 text-orange-600  text-xs font-mono text-right">{row.s2Max   || '—'}</td>
                        <td className="px-3 py-2.5 text-amber-500   text-xs font-mono text-right">{row.s2MaxC  || '—'}</td>
                        <td className={`px-3 py-2.5 text-xs font-mono font-semibold text-right ${r11 ? 'text-red-600' : 'text-purple-600'}`}>{row.s2LAeq  || '—'}{r11 && ' !'}</td>
                        <td className="px-3 py-2.5 text-amber-600   text-xs font-mono text-right">{row.s2LCeq  || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-100 bg-gray-50">
                    <td className="px-4 py-2 text-gray-500 text-[10px] font-bold">Goal</td>
                    <td className="px-3 py-2 text-gray-300 text-[10px] text-right">—</td>
                    <td className="px-3 py-2 text-gray-300 text-[10px] text-right">—</td>
                    <td className="px-3 py-2 text-gray-500 text-[10px] font-bold text-right">≤{GOAL_9AM}</td>
                    <td className="px-3 py-2 text-gray-300 text-[10px] text-right">—</td>
                    <td className="px-3 py-2 text-gray-300 text-[10px] text-right">—</td>
                    <td className="px-3 py-2 text-gray-300 text-[10px] text-right">—</td>
                    <td className="px-3 py-2 text-gray-500 text-[10px] font-bold text-right">≤{GOAL_11AM}</td>
                    <td className="px-3 py-2 text-gray-300 text-[10px] text-right">—</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
