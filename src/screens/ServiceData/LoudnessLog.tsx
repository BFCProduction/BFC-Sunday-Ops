import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useSunday } from '../../context/SundayContext'
import { Card } from '../../components/ui/Card'
import { generateLoudnessReportHtml } from '../../lib/generateLoudnessReportHtml'
import bfcLogo from '../../assets/BFC_Production_Logo_Hor reverse.png'

// ── Loudness goals by service type ────────────────────────────────────────────
const GOAL: Record<string, number> = {
  'sunday-9am':  88,
  'sunday-11am': 94,
}
const defaultGoal = 88

const SERVICE_DISPLAY: Record<string, { label: string; color: string }> = {
  'sunday-9am':  { label: 'Sunday 9:00 AM',  color: '#3b82f6' },
  'sunday-11am': { label: 'Sunday 11:00 AM', color: '#8b5cf6' },
}

function toServiceType(slug: string): string {
  if (slug === 'sunday-9am')  return 'regular_9am'
  if (slug === 'sunday-11am') return 'regular_11am'
  return 'special'
}

// ── History row ───────────────────────────────────────────────────────────────
interface HistoryRow {
  date:         string
  serviceSlug:  string
  serviceLabel: string
  serviceColor: string
  goal:         number
  maxA:  number | null
  maxC:  number | null
  laeq:  number | null
  lceq:  number | null
}

interface AnalyticsRow {
  service_date: string
  service_type: string
  max_db_a_slow: number | null
  la_eq_15:      number | null
  max_db_c_slow: number | null
  lc_eq_15:      number | null
}

function mapHistoryRow(r: AnalyticsRow): HistoryRow | null {
  const meta = SERVICE_DISPLAY[r.service_type]
  if (!meta) return null
  return {
    date: new Date(r.service_date + 'T12:00:00').toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    }),
    serviceSlug:  r.service_type,
    serviceLabel: meta.label,
    serviceColor: meta.color,
    goal: GOAL[r.service_type] ?? defaultGoal,
    maxA: r.max_db_a_slow,
    maxC: r.max_db_c_slow,
    laeq: r.la_eq_15,
    lceq: r.lc_eq_15,
  }
}


// ── NumField ──────────────────────────────────────────────────────────────────
interface NumFieldProps {
  label: string
  value: string
  onChange: (v: string) => void
  goal?: number
  accent: string
}

function NumField({ label, value, onChange, goal, accent }: NumFieldProps) {
  const over = goal != null && value !== '' && parseFloat(value) > goal
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-gray-500 text-xs font-medium">{label}</label>
        {goal != null && <span className="text-[10px] text-gray-400">goal ≤ {goal}</span>}
      </div>
      <input
        type="number" step="0.1" placeholder="e.g. 85.8" value={value}
        onChange={e => onChange(e.target.value)}
        className={`w-full rounded-lg px-3 py-2.5 text-sm font-mono border focus:outline-none transition-colors ${
          over
            ? 'bg-red-50 border-red-300 text-red-700 focus:border-red-400'
            : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-blue-500'
        }`}
        style={value && !over ? { borderColor: accent + '60' } : {}}
      />
      {over && <p className="text-red-500 text-[10px] mt-1 font-medium">Exceeds {goal} goal</p>}
    </div>
  )
}


// ── LoudnessLog ───────────────────────────────────────────────────────────────
export function LoudnessLog() {
  const {
    activeEventId, serviceTypeSlug, serviceTypeName, serviceTypeColor,
    sessionDate, eventName,
  } = useSunday()

  const laeqGoal = GOAL[serviceTypeSlug] ?? defaultGoal

  const [maxA,  setMaxA]  = useState('')
  const [laeq,  setLaeq]  = useState('')
  const [maxC,  setMaxC]  = useState('')
  const [lceq,  setLceq]  = useState('')
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)
  const [exporting, setExporting] = useState(false)
  const [notice, setNotice] = useState('')

  const [history, setHistory] = useState<HistoryRow[]>([])

  const loadHistory = useCallback(async () => {
    const { data } = await supabase
      .from('analytics_records')
      .select('service_date, service_type, max_db_a_slow, la_eq_15, max_db_c_slow, lc_eq_15')
      .or('max_db_a_slow.not.is.null,la_eq_15.not.is.null')
      .in('service_type', ['sunday-9am', 'sunday-11am'])
      .order('service_date', { ascending: false })
      .limit(40)

    if (data) {
      setHistory(
        (data as AnalyticsRow[])
          .map(mapHistoryRow)
          .filter((r): r is HistoryRow => r !== null)
      )
    }
  }, [])

  // ── Load current readings ─────────────────────────────────────────────────
  useEffect(() => {
    if (!activeEventId) return
    setMaxA(''); setLaeq(''); setMaxC(''); setLceq('')
    let cancelled = false

    async function loadCurrent() {
      const { data } = await supabase
        .from('service_records')
        .select('max_db_a_slow, la_eq_15, max_db_c_slow, lc_eq_15')
        .eq('event_id', activeEventId)
        .maybeSingle()

      if (!cancelled) {
        setMaxA(data?.max_db_a_slow?.toString() ?? '')
        setLaeq(data?.la_eq_15?.toString()      ?? '')
        setMaxC(data?.max_db_c_slow?.toString() ?? '')
        setLceq(data?.lc_eq_15?.toString()      ?? '')
      }
    }

    loadCurrent()
    return () => { cancelled = true }
  }, [activeEventId])

  // ── Load history ──────────────────────────────────────────────────────────
  useEffect(() => { void loadHistory() }, [loadHistory])

  // ── Save ──────────────────────────────────────────────────────────────────
  const submit = async () => {
    setSaving(true)
    setNotice('')

    try {
      if (!activeEventId) throw new Error('No active event is selected.')

      const loudnessPayload = {
        max_db_a_slow: maxA ? parseFloat(maxA) : null,
        la_eq_15:      laeq ? parseFloat(laeq) : null,
        max_db_c_slow: maxC ? parseFloat(maxC) : null,
        lc_eq_15:      lceq ? parseFloat(lceq) : null,
      }

      const { data: existing, error: existingError } = await supabase
        .from('service_records')
        .select('id')
        .eq('event_id', activeEventId)
        .maybeSingle()
      if (existingError) throw existingError

      if (existing) {
        const { error } = await supabase
          .from('service_records')
          .update(loudnessPayload)
          .eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('service_records').insert({
          event_id:     activeEventId,
          service_date: sessionDate,
          service_type: toServiceType(serviceTypeSlug),
          service_label: serviceTypeSlug === 'special' ? (eventName ?? null) : null,
          ...loudnessPayload,
        })
        if (error) throw error
      }

      await loadHistory()
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Loudness readings could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  // ── PDF export ────────────────────────────────────────────────────────────
  const exportPdf = async () => {
    setExporting(true)
    try {
      const { data } = await supabase
        .from('service_records')
        .select('service_date, service_type, max_db_a_slow, la_eq_15')
        .or('max_db_a_slow.not.is.null,la_eq_15.not.is.null')
        .in('service_type', ['regular_9am', 'regular_11am'])
        .order('service_date', { ascending: true })

      type PdfRecord = { service_date: string; service_type: string; max_db_a_slow: number | null; la_eq_15: number | null }
      const byDate: Record<string, { date: string; service_1_max_db: number | null; service_1_laeq: number | null; service_2_max_db: number | null; service_2_laeq: number | null }> = {}
      for (const r of (data ?? []) as PdfRecord[]) {
        const d = r.service_date
        if (!byDate[d]) byDate[d] = { date: d, service_1_max_db: null, service_1_laeq: null, service_2_max_db: null, service_2_laeq: null }
        if (r.service_type === 'regular_9am') {
          byDate[d].service_1_max_db = r.max_db_a_slow
          byDate[d].service_1_laeq   = r.la_eq_15
        } else {
          byDate[d].service_2_max_db = r.max_db_a_slow
          byDate[d].service_2_laeq   = r.la_eq_15
        }
      }
      const rows = Object.values(byDate)
      const logoBase64 = await new Promise<string>((resolve) => {
        fetch(bfcLogo).then(r => r.blob()).then(blob => {
          const reader = new FileReader()
          reader.onload  = () => resolve(reader.result as string)
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

  // ── Running averages (from flattened history) ─────────────────────────────
  const avg = (vals: (number | null)[]) => {
    const clean = vals.filter((v): v is number => v != null)
    return clean.length ? (clean.reduce((a, b) => a + b, 0) / clean.length).toFixed(1) : '—'
  }
  const rows9am  = history.filter(r => r.serviceSlug === 'sunday-9am')
  const rows11am = history.filter(r => r.serviceSlug === 'sunday-11am')
  const visibleHistory = history.filter(r => r.serviceSlug === serviceTypeSlug).slice(0, 10)

  const laeqOver = laeq !== '' && parseFloat(laeq) > laeqGoal

  return (
    <div className="space-y-5 fade-in">

      {/* Running averages */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {[
          { label: '9am Avg Max dB A',  value: avg(rows9am.map(r => r.maxA)),  color: '#06b6d4' },
          { label: '9am Avg LAeq 15',   value: avg(rows9am.map(r => r.laeq)),  color: '#ec4899', goal: GOAL['sunday-9am'],  over: parseFloat(avg(rows9am.map(r => r.laeq)))  > GOAL['sunday-9am']  },
          { label: '9am Avg LCeq 15',   value: avg(rows9am.map(r => r.lceq)),  color: '#8b5cf6' },
          { label: '11am Avg Max dB A', value: avg(rows11am.map(r => r.maxA)), color: '#f97316' },
          { label: '11am Avg LAeq 15',  value: avg(rows11am.map(r => r.laeq)), color: '#a855f7', goal: GOAL['sunday-11am'], over: parseFloat(avg(rows11am.map(r => r.laeq))) > GOAL['sunday-11am'] },
          { label: '11am Avg LCeq 15',  value: avg(rows11am.map(r => r.lceq)), color: '#d97706' },
        ].map(s => (
          <Card key={s.label} className={`p-4 ${s.over ? 'border-red-200 bg-red-50' : ''}`}>
            <p className="text-gray-400 text-[10px] font-medium mb-1">{s.label}</p>
            <p className="text-2xl font-bold" style={{ color: s.over ? '#dc2626' : s.color }}>
              {s.value}<span className="text-sm font-normal text-gray-400 ml-1">dB</span>
            </p>
            {s.goal != null && <p className="text-[10px] mt-1" style={{ color: s.over ? '#dc2626' : '#9ca3af' }}>goal ≤ {s.goal}</p>}
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-5 items-start">

        {/* ── Entry form (current service) ─────────────────────────────────── */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2 pb-1 border-b border-gray-100">
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: serviceTypeColor }} />
            <span className="text-xs font-semibold" style={{ color: serviceTypeColor }}>{serviceTypeName}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <NumField label="Max dB A Slow" value={maxA} onChange={setMaxA} accent={serviceTypeColor} />
            <NumField label="LAeq 15"        value={laeq} onChange={setLaeq} goal={laeqGoal} accent={serviceTypeColor} />
            <NumField label="Max dB C Slow"  value={maxC} onChange={setMaxC} accent={serviceTypeColor} />
            <NumField label="LCeq 15"        value={lceq} onChange={setLceq} accent={serviceTypeColor} />
          </div>

          {laeqOver && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700 leading-relaxed">
              LAeq 15 exceeds the {laeqGoal} dB goal for this service. This will be flagged in the weekly average report.
            </div>
          )}

          <button
            onClick={submit}
            disabled={saving}
            className={`w-full py-2.5 rounded-lg font-semibold text-sm transition-all ${
              saved
                ? 'bg-emerald-600 text-white'
                : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95 disabled:opacity-60'
            }`}
          >
            {saving ? 'Saving...' : saved ? 'Saved ✓' : `Log ${serviceTypeName} Readings`}
          </button>
          {notice && <p className="text-red-600 text-xs font-medium">{notice}</p>}
        </Card>

        {/* ── History table ─────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-gray-400 text-[11px] font-semibold uppercase tracking-widest">Past 10 Sundays</p>
            <button
              onClick={exportPdf}
              disabled={exporting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 active:scale-95 transition-all disabled:opacity-50"
            >
              {exporting ? 'Generating…' : '↓ Full History PDF'}
            </button>
          </div>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full" style={{ minWidth: 560 }}>
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-4 py-2 text-gray-400 text-[10px] font-semibold text-left whitespace-nowrap">Date</th>
                    <th className="px-3 py-2 text-gray-400 text-[10px] font-semibold text-left whitespace-nowrap">Service</th>
                    <th className="px-3 py-2 text-cyan-600   text-[10px] font-semibold text-right whitespace-nowrap">Max dB A</th>
                    <th className="px-3 py-2 text-violet-400 text-[10px] font-semibold text-right whitespace-nowrap">Max dB C</th>
                    <th className="px-3 py-2 text-pink-600   text-[10px] font-semibold text-right whitespace-nowrap">LAeq 15</th>
                    <th className="px-3 py-2 text-violet-500 text-[10px] font-semibold text-right whitespace-nowrap">LCeq 15</th>
                    <th className="px-3 py-2 text-gray-400   text-[10px] font-semibold text-right whitespace-nowrap">Goal</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleHistory.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-gray-400 text-xs">No history yet</td>
                    </tr>
                  )}
                  {visibleHistory.map((row, i) => {
                    const over = row.laeq != null && row.laeq > row.goal
                    return (
                      <tr key={i} className={`border-b border-gray-50 ${over ? 'bg-red-50' : ''}`}>
                        <td className="px-4 py-2.5 text-gray-600 text-xs whitespace-nowrap">{row.date}</td>
                        <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                          <span className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: row.serviceColor }} />
                            <span className="text-gray-600">{row.serviceLabel.replace('Sunday ', '')}</span>
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-cyan-600   text-xs font-mono text-right">{row.maxA  ?? '—'}</td>
                        <td className="px-3 py-2.5 text-violet-400 text-xs font-mono text-right">{row.maxC  ?? '—'}</td>
                        <td className={`px-3 py-2.5 text-xs font-mono font-semibold text-right ${over ? 'text-red-600' : 'text-pink-600'}`}>
                          {row.laeq ?? '—'}{over && ' !'}
                        </td>
                        <td className="px-3 py-2.5 text-violet-500 text-xs font-mono text-right">{row.lceq ?? '—'}</td>
                        <td className="px-3 py-2.5 text-gray-400   text-xs text-right">≤{row.goal}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

      </div>
    </div>
  )
}
