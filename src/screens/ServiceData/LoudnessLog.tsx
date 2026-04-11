import { useState, useEffect } from 'react'
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

// ── History row (flattened for display) ───────────────────────────────────────
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

// ── DB row shapes ─────────────────────────────────────────────────────────────
interface LoudnessDBRow {
  event_id:  string | null
  sunday_id: string | null
  service_1_max_db:   number | null
  service_1_laeq:     number | null
  service_1_max_db_c: number | null
  service_1_lceq:     number | null
  service_2_max_db:   number | null
  service_2_laeq:     number | null
  service_2_max_db_c: number | null
  service_2_lceq:     number | null
  sundays?: { date: string } | null
  events?:  { event_date: string; service_types: { slug: string; name: string; color: string } } | null
}

function flattenHistory(rows: LoudnessDBRow[]): HistoryRow[] {
  const result: HistoryRow[] = []
  for (const row of rows) {
    if (row.event_id && row.events) {
      // Event-native: one row per event, uses service_1_* columns
      const st = row.events.service_types
      const dateStr = new Date(row.events.event_date + 'T12:00:00').toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
      })
      result.push({
        date: dateStr, serviceSlug: st.slug, serviceLabel: st.name, serviceColor: st.color,
        goal: GOAL[st.slug] ?? defaultGoal,
        maxA: row.service_1_max_db,   maxC: row.service_1_max_db_c,
        laeq: row.service_1_laeq,     lceq: row.service_1_lceq,
      })
    } else if (row.sunday_id && row.sundays) {
      // Legacy Sunday: split into a 9am row and an 11am row
      const dateStr = new Date(row.sundays.date + 'T12:00:00').toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
      })
      if (row.service_1_max_db != null || row.service_1_laeq != null) {
        result.push({
          date: dateStr, serviceSlug: 'sunday-9am',
          serviceLabel: 'Sunday 9:00 AM', serviceColor: '#3b82f6', goal: GOAL['sunday-9am'],
          maxA: row.service_1_max_db,   maxC: row.service_1_max_db_c,
          laeq: row.service_1_laeq,     lceq: row.service_1_lceq,
        })
      }
      if (row.service_2_max_db != null || row.service_2_laeq != null) {
        result.push({
          date: dateStr, serviceSlug: 'sunday-11am',
          serviceLabel: 'Sunday 11:00 AM', serviceColor: '#8b5cf6', goal: GOAL['sunday-11am'],
          maxA: row.service_2_max_db,   maxC: row.service_2_max_db_c,
          laeq: row.service_2_laeq,     lceq: row.service_2_lceq,
        })
      }
    }
  }
  return result
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

// ── Sync to service_records ───────────────────────────────────────────────────
async function syncToServiceRecords(
  sundayId: string,
  sundayDate: string,
  serviceType: 'regular_9am' | 'regular_11am',
  fields: { max_db_a_slow: number | null; la_eq_15: number | null; max_db_c_slow: number | null; lc_eq_15: number | null },
) {
  const { data: existing } = await supabase
    .from('service_records')
    .select('id')
    .eq('service_date', sundayDate)
    .eq('service_type', serviceType)
    .maybeSingle()

  if (existing) {
    await supabase.from('service_records').update(fields).eq('id', existing.id)
  } else {
    await supabase.from('service_records').insert({
      service_date: sundayDate,
      service_type: serviceType,
      sunday_id: sundayId,
      ...fields,
    })
  }
}

// ── LoudnessLog ───────────────────────────────────────────────────────────────
export function LoudnessLog() {
  const {
    activeEventId, serviceTypeSlug, serviceTypeName, serviceTypeColor,
    sundayId, sundayDate,
  } = useSunday()

  const laeqGoal = GOAL[serviceTypeSlug] ?? defaultGoal

  const [maxA,  setMaxA]  = useState('')
  const [laeq,  setLaeq]  = useState('')
  const [maxC,  setMaxC]  = useState('')
  const [lceq,  setLceq]  = useState('')
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)
  const [exporting, setExporting] = useState(false)

  const [history, setHistory] = useState<HistoryRow[]>([])

  // ── Load current readings ─────────────────────────────────────────────────
  useEffect(() => {
    if (!activeEventId) return
    setMaxA(''); setLaeq(''); setMaxC(''); setLceq('')
    let cancelled = false

    async function loadCurrent() {
      // 1. Event-native
      const { data: eventRow } = await supabase
        .from('loudness')
        .select('service_1_max_db, service_1_laeq, service_1_max_db_c, service_1_lceq')
        .eq('event_id', activeEventId)
        .maybeSingle()

      if (cancelled) return
      if (eventRow) {
        setMaxA(eventRow.service_1_max_db?.toString()   ?? '')
        setLaeq(eventRow.service_1_laeq?.toString()     ?? '')
        setMaxC(eventRow.service_1_max_db_c?.toString() ?? '')
        setLceq(eventRow.service_1_lceq?.toString()     ?? '')
        return
      }

      // 2. Legacy Sunday fallback — pick columns based on service type
      if (sundayId) {
        const { data: sundayRow } = await supabase
          .from('loudness')
          .select('service_1_max_db, service_1_laeq, service_1_max_db_c, service_1_lceq, service_2_max_db, service_2_laeq, service_2_max_db_c, service_2_lceq')
          .eq('sunday_id', sundayId)
          .maybeSingle()

        if (!cancelled && sundayRow) {
          const is11am = serviceTypeSlug === 'sunday-11am'
          setMaxA((is11am ? sundayRow.service_2_max_db   : sundayRow.service_1_max_db)?.toString()   ?? '')
          setLaeq((is11am ? sundayRow.service_2_laeq     : sundayRow.service_1_laeq)?.toString()     ?? '')
          setMaxC((is11am ? sundayRow.service_2_max_db_c : sundayRow.service_1_max_db_c)?.toString() ?? '')
          setLceq((is11am ? sundayRow.service_2_lceq     : sundayRow.service_1_lceq)?.toString()     ?? '')
        }
      }
    }

    loadCurrent()
    return () => { cancelled = true }
  }, [activeEventId, sundayId, serviceTypeSlug])

  // ── Load history ──────────────────────────────────────────────────────────
  useEffect(() => {
    async function loadHistory() {
      const { data } = await supabase
        .from('loudness')
        .select(`
          event_id, sunday_id,
          service_1_max_db, service_1_laeq, service_1_max_db_c, service_1_lceq,
          service_2_max_db, service_2_laeq, service_2_max_db_c, service_2_lceq,
          sundays ( date ),
          events ( event_date, service_types ( slug, name, color ) )
        `)
        .order('logged_at', { ascending: false })
        .limit(20)

      if (data) setHistory(flattenHistory(data as unknown as LoudnessDBRow[]).slice(0, 16))
    }
    loadHistory()
  }, [])

  // ── Save ──────────────────────────────────────────────────────────────────
  const submit = async () => {
    setSaving(true)

    const { data: existing } = await supabase
      .from('loudness')
      .select('id')
      .eq('event_id', activeEventId)
      .maybeSingle()

    const payload = {
      event_id:           activeEventId,
      service_1_max_db:   maxA ? parseFloat(maxA) : null,
      service_1_laeq:     laeq ? parseFloat(laeq) : null,
      service_1_max_db_c: maxC ? parseFloat(maxC) : null,
      service_1_lceq:     lceq ? parseFloat(lceq) : null,
      logged_at:          new Date().toISOString(),
    }

    if (existing) {
      await supabase.from('loudness').update(payload).eq('id', existing.id)
    } else {
      await supabase.from('loudness').insert(payload)
    }

    // Sync to service_records for analytics (Sunday services only)
    const serviceRecordType =
      serviceTypeSlug === 'sunday-9am'  ? 'regular_9am'  :
      serviceTypeSlug === 'sunday-11am' ? 'regular_11am' : null

    if (serviceRecordType && sundayId && sundayDate) {
      await syncToServiceRecords(sundayId, sundayDate, serviceRecordType, {
        max_db_a_slow: maxA ? parseFloat(maxA) : null,
        la_eq_15:      laeq ? parseFloat(laeq) : null,
        max_db_c_slow: maxC ? parseFloat(maxC) : null,
        lc_eq_15:      lceq ? parseFloat(lceq) : null,
      })
    }

    // Refresh history
    const { data } = await supabase
      .from('loudness')
      .select(`
        event_id, sunday_id,
        service_1_max_db, service_1_laeq, service_1_max_db_c, service_1_lceq,
        service_2_max_db, service_2_laeq, service_2_max_db_c, service_2_lceq,
        sundays ( date ),
        events ( event_date, service_types ( slug, name, color ) )
      `)
      .order('logged_at', { ascending: false })
      .limit(20)
    if (data) setHistory(flattenHistory(data as unknown as LoudnessDBRow[]).slice(0, 16))

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  // ── PDF export ────────────────────────────────────────────────────────────
  const exportPdf = async () => {
    setExporting(true)
    try {
      const { data } = await supabase
        .from('loudness')
        .select('*, sundays(date)')
        .not('sunday_id', 'is', null)
        .order('sunday_id')
      const rows = (data ?? []).map((r: {
        sundays: { date: string }
        service_1_max_db: number | null; service_1_laeq: number | null
        service_2_max_db: number | null; service_2_laeq: number | null
      }) => ({
        date: r.sundays.date,
        service_1_max_db: r.service_1_max_db, service_1_laeq: r.service_1_laeq,
        service_2_max_db: r.service_2_max_db, service_2_laeq: r.service_2_laeq,
      }))
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
        </Card>

        {/* ── History table ─────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-gray-400 text-[11px] font-semibold uppercase tracking-widest">Recent Services</p>
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
                  {history.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-gray-400 text-xs">No history yet</td>
                    </tr>
                  )}
                  {history.map((row, i) => {
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
