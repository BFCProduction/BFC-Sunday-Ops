import { useState, useEffect, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import { supabase } from '../../lib/supabase'

// ── Constants ─────────────────────────────────────────────────────────────────

const GOAL_LAeq: Record<string, number> = { regular_9am: 88, regular_11am: 94 }
const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: CURRENT_YEAR - 2019 }, (_, i) => CURRENT_YEAR - i)

// ── Types ─────────────────────────────────────────────────────────────────────

type YearFilter = number | 'all'
type ServiceFilter = 'both' | '9am' | '11am'

interface Rec {
  service_date: string
  service_type: 'regular_9am' | 'regular_11am' | 'special'
  in_person_attendance: number | null
  church_online_views: number | null
  church_online_unique_viewers: number | null
  church_online_avg_watch_time_secs: number | null
  youtube_unique_viewers: number | null
  service_run_time_secs: number | null
  la_eq_15: number | null
}

interface EvalRow {
  service_feel: 'excellent' | 'solid' | 'rough_spots' | 'significant_issues' | null
  broken_moment: boolean | null
  date: string
}

interface KPIs {
  sundayCount: number
  avgTotal: number | null
  avgInPerson: number | null
  avgInPerson9am: number | null
  avgInPerson11am: number | null
  avgCo: number | null        // church online unique — denominational
  avgCo9am: number | null
  avgCo11am: number | null
  avgCoViews: number | null
  avgYt: number | null
  avgWatchTime9am: number | null
  avgWatchTime11am: number | null
  avgRuntime: number | null
  avgRuntime9am: number | null
  avgRuntime11am: number | null
  loudnessCompliance: number | null
  loudnessExceedances: number
  loudnessChecked: number
  highestSunday: { date: string; total: number } | null
  inPersonPct: number | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function avg(nums: number[]): number | null {
  const valid = nums.filter(n => isFinite(n))
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null
}

function fmt(n: number | null, decimals = 0): string {
  if (n == null) return '—'
  return n.toLocaleString('en-US', { maximumFractionDigits: decimals })
}

function fmtSecs(secs: number | null): string {
  if (secs == null) return '—'
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

function fmtDate(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function fmtShortDate(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  })
}

function delta(cur: number | null, prev: number | null): { pct: number; dir: 'up' | 'down' | 'flat' } | null {
  if (cur == null || prev == null || prev === 0) return null
  const pct = ((cur - prev) / prev) * 100
  return { pct: Math.abs(pct), dir: Math.abs(pct) < 0.5 ? 'flat' : pct > 0 ? 'up' : 'down' }
}

function yearOf(date: string) {
  return parseInt(date.slice(0, 4), 10)
}

// ── Data filtering ────────────────────────────────────────────────────────────

function filterRecords(
  records: Rec[],
  year: YearFilter,
  service: ServiceFilter,
  exclSpecial: boolean,
): Rec[] {
  return records.filter(r => {
    if (exclSpecial && r.service_type === 'special') return false
    if (year !== 'all' && yearOf(r.service_date) !== year) return false
    if (service === '9am'  && r.service_type !== 'regular_9am') return false
    if (service === '11am' && r.service_type !== 'regular_11am') return false
    return true
  })
}

// ── KPI computation ───────────────────────────────────────────────────────────

function computeKPIs(records: Rec[]): KPIs {
  // Group by date to get per-Sunday values
  const byDate = new Map<string, Rec[]>()
  for (const r of records) {
    if (!byDate.has(r.service_date)) byDate.set(r.service_date, [])
    byDate.get(r.service_date)!.push(r)
  }

  const sundayCount = byDate.size
  if (sundayCount === 0) {
    return {
      sundayCount: 0, avgTotal: null, avgInPerson: null, avgInPerson9am: null,
      avgInPerson11am: null, avgCo: null, avgCo9am: null, avgCo11am: null,
      avgCoViews: null, avgYt: null, avgWatchTime9am: null, avgWatchTime11am: null,
      avgRuntime: null, avgRuntime9am: null, avgRuntime11am: null,
      loudnessCompliance: null, loudnessExceedances: 0, loudnessChecked: 0,
      highestSunday: null, inPersonPct: null,
    }
  }

  // Per-Sunday totals
  const perSunday = Array.from(byDate.values()).map(rows => {
    const ip = rows.reduce((s, r) => s + (r.in_person_attendance ?? 0), 0)
    const co = rows.reduce((s, r) => s + (r.church_online_unique_viewers ?? 0), 0)
    const yt = rows.reduce((s, r) => s + (r.youtube_unique_viewers ?? 0), 0)
    const coViews = rows.reduce((s, r) => s + (r.church_online_views ?? 0), 0)
    const total = ip + co + yt
    const hasAtt = rows.some(r => r.in_person_attendance != null || r.church_online_unique_viewers != null)
    return { total, ip, co, yt, coViews, hasAtt, date: rows[0].service_date, rows }
  }).filter(s => s.hasAtt)

  const totalArr   = perSunday.map(s => s.total)
  const ipArr      = perSunday.map(s => s.ip)
  const coArr      = perSunday.map(s => s.co)
  const coViewsArr = perSunday.map(s => s.coViews)
  const ytArr      = perSunday.map(s => s.yt)

  // Per-service averages
  const all9am  = records.filter(r => r.service_type === 'regular_9am')
  const all11am = records.filter(r => r.service_type === 'regular_11am')

  // Loudness compliance: per Sunday, all services within goal
  let exceedances = 0
  let checked = 0
  let compliantSundays = 0
  let totalLoudnessSundays = 0

  for (const rows of byDate.values()) {
    const loudRows = rows.filter(r => r.la_eq_15 != null)
    if (loudRows.length === 0) continue
    totalLoudnessSundays++
    const overRows = loudRows.filter(r => {
      const goal = GOAL_LAeq[r.service_type]
      return goal != null && r.la_eq_15! > goal
    })
    checked += loudRows.length
    exceedances += overRows.length
    if (overRows.length === 0) compliantSundays++
  }

  const loudnessCompliance = totalLoudnessSundays > 0
    ? Math.round((compliantSundays / totalLoudnessSundays) * 100)
    : null

  // Highest Sunday
  const sorted = [...perSunday].sort((a, b) => b.total - a.total)
  const highestSunday = sorted.length ? { date: sorted[0].date, total: sorted[0].total } : null

  // Runtime averages
  const runtimeAll = records.filter(r => r.service_run_time_secs != null).map(r => r.service_run_time_secs!)
  const runtime9am = all9am.filter(r => r.service_run_time_secs != null).map(r => r.service_run_time_secs!)
  const runtime11am = all11am.filter(r => r.service_run_time_secs != null).map(r => r.service_run_time_secs!)

  // Watch time
  const wt9am = all9am.filter(r => r.church_online_avg_watch_time_secs != null).map(r => r.church_online_avg_watch_time_secs!)
  const wt11am = all11am.filter(r => r.church_online_avg_watch_time_secs != null).map(r => r.church_online_avg_watch_time_secs!)

  const avgTotal = avg(totalArr)
  const avgIp    = avg(ipArr)
  const avgCo    = avg(coArr)

  return {
    sundayCount,
    avgTotal,
    avgInPerson: avgIp,
    avgInPerson9am:  avg(all9am.filter(r => r.in_person_attendance != null).map(r => r.in_person_attendance!)),
    avgInPerson11am: avg(all11am.filter(r => r.in_person_attendance != null).map(r => r.in_person_attendance!)),
    avgCo,
    avgCo9am:  avg(all9am.filter(r => r.church_online_unique_viewers != null).map(r => r.church_online_unique_viewers!)),
    avgCo11am: avg(all11am.filter(r => r.church_online_unique_viewers != null).map(r => r.church_online_unique_viewers!)),
    avgCoViews: avg(coViewsArr),
    avgYt: avg(ytArr),
    avgWatchTime9am: avg(wt9am),
    avgWatchTime11am: avg(wt11am),
    avgRuntime:    avg(runtimeAll),
    avgRuntime9am:  avg(runtime9am),
    avgRuntime11am: avg(runtime11am),
    loudnessCompliance,
    loudnessExceedances: exceedances,
    loudnessChecked: checked,
    highestSunday,
    inPersonPct: avgTotal && avgIp ? Math.round((avgIp / avgTotal) * 100) : null,
  }
}

// ── Trend data ────────────────────────────────────────────────────────────────

function computeTrend(records: Rec[]) {
  const byDate = new Map<string, Rec[]>()
  for (const r of records) {
    if (!byDate.has(r.service_date)) byDate.set(r.service_date, [])
    byDate.get(r.service_date)!.push(r)
  }
  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, rows]) => {
      const ip = rows.reduce((s, r) => s + (r.in_person_attendance ?? 0), 0)
      const co = rows.reduce((s, r) => s + (r.church_online_unique_viewers ?? 0), 0)
      const yt = rows.reduce((s, r) => s + (r.youtube_unique_viewers ?? 0), 0)
      return {
        date,
        label: fmtShortDate(date),
        total: ip + co + yt,
        inPerson: ip,
        online: co + yt,
      }
    })
    .filter(d => d.total > 0)
}

// ── YoY data ──────────────────────────────────────────────────────────────────

function computeYoY(records: Rec[]) {
  // Group by year → per-Sunday totals → annual average
  const byYearDate = new Map<number, Map<string, Rec[]>>()
  for (const r of records) {
    if (r.service_type === 'special') continue
    const y = yearOf(r.service_date)
    if (!byYearDate.has(y)) byYearDate.set(y, new Map())
    const m = byYearDate.get(y)!
    if (!m.has(r.service_date)) m.set(r.service_date, [])
    m.get(r.service_date)!.push(r)
  }
  return Array.from(byYearDate.entries())
    .sort(([a], [b]) => b - a)
    .map(([year, dateMap]) => {
      const totals = Array.from(dateMap.values()).map(rows =>
        rows.reduce((s, r) => s + (r.in_person_attendance ?? 0) + (r.church_online_unique_viewers ?? 0) + (r.youtube_unique_viewers ?? 0), 0)
      ).filter(t => t > 0)
      return { year, avg: avg(totals) ?? 0, count: totals.length }
    })
}

// ── Delta badge ───────────────────────────────────────────────────────────────

function DeltaBadge({ cur, prev, suffix = '' }: { cur: number | null; prev: number | null; suffix?: string }) {
  const d = delta(cur, prev)
  if (!d) return null
  const cls = d.dir === 'up' ? 'text-emerald-600' : d.dir === 'down' ? 'text-red-500' : 'text-gray-400'
  const arrow = d.dir === 'up' ? '▲' : d.dir === 'down' ? '▼' : '→'
  return (
    <span className={`text-xs font-semibold ${cls}`}>
      {arrow} {d.dir === 'flat' ? 'flat' : `${d.pct.toFixed(1)}%${suffix}`}
    </span>
  )
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  sub2,
  highlight = false,
  curValue,
  prevValue,
}: {
  label: string
  value: string
  sub?: string
  sub2?: string
  highlight?: boolean
  curValue?: number | null
  prevValue?: number | null
}) {
  return (
    <div className={`rounded-xl border p-4 ${highlight ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-white'}`}>
      <p className={`text-[11px] font-semibold mb-1 ${highlight ? 'text-blue-700' : 'text-gray-400'}`}>{label}</p>
      <p className={`text-3xl font-bold tracking-tight mb-1 ${highlight ? 'text-blue-700' : 'text-gray-900'}`}>
        {value}
      </p>
      {curValue !== undefined && prevValue !== undefined && (
        <div className="flex items-center gap-1.5 mb-1">
          <DeltaBadge cur={curValue ?? null} prev={prevValue ?? null} />
          <span className="text-[10px] text-gray-400">vs prev year</span>
        </div>
      )}
      {sub  && <p className="text-[11px] text-gray-400 leading-snug">{sub}</p>}
      {sub2 && <p className={`text-[11px] font-semibold leading-snug mt-0.5 ${highlight ? 'text-blue-600' : 'text-gray-600'}`}>{sub2}</p>}
    </div>
  )
}

// ── Stat Row ─────────────────────────────────────────────────────────────────

function StatRow({ dot, label, value, valueClass = '' }: {
  dot: string
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
      <span className="flex items-center gap-2 text-xs text-gray-600">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dot }} />
        {label}
      </span>
      <span className={`text-xs font-semibold font-mono ${valueClass || 'text-gray-700'}`}>{value}</span>
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export function Dashboard() {
  const [year, setYear]               = useState<YearFilter>(CURRENT_YEAR)
  const [serviceFilter, setServiceFilter] = useState<ServiceFilter>('both')
  const [exclSpecial, setExclSpecial] = useState(true)
  const [allRecords, setAllRecords]   = useState<Rec[]>([])
  const [evals, setEvals]             = useState<EvalRow[]>([])
  const [loading, setLoading]         = useState(true)

  // Fetch all records once — filter in memory for instant UI response
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [recResult, evalResult] = await Promise.all([
        supabase
          .from('service_records')
          .select('service_date,service_type,in_person_attendance,church_online_views,church_online_unique_viewers,church_online_avg_watch_time_secs,youtube_unique_viewers,service_run_time_secs,la_eq_15')
          .order('service_date'),
        supabase
          .from('evaluations')
          .select('service_feel,broken_moment,sundays(date)')
          .not('service_feel', 'is', null),
      ])
      setAllRecords(recResult.data ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setEvals((evalResult.data ?? []).map((e: any) => ({
        service_feel: e.service_feel as EvalRow['service_feel'],
        broken_moment: e.broken_moment as boolean | null,
        date: (Array.isArray(e.sundays) ? e.sundays[0]?.date : e.sundays?.date) ?? '',
      })))
      setLoading(false)
    }
    load()
  }, [])

  // Filtered records for selected year/service
  const filtered = useMemo(
    () => filterRecords(allRecords, year, serviceFilter, exclSpecial),
    [allRecords, year, serviceFilter, exclSpecial]
  )

  // Previous year records (for delta)
  const prevFiltered = useMemo(
    () => year === 'all' ? [] : filterRecords(allRecords, (year as number) - 1, serviceFilter, exclSpecial),
    [allRecords, year, serviceFilter, exclSpecial]
  )

  const kpis     = useMemo(() => computeKPIs(filtered),     [filtered])
  const prevKpis = useMemo(() => computeKPIs(prevFiltered), [prevFiltered])
  const trend    = useMemo(() => computeTrend(filtered),    [filtered])
  const yoy      = useMemo(() => computeYoY(allRecords),    [allRecords])

  // Evaluations for selected year
  const filteredEvals = useMemo(() => {
    if (year === 'all') return evals
    return evals.filter(e => e.date && yearOf(e.date) === (year as number))
  }, [evals, year])

  const evalCounts = useMemo(() => {
    const counts = { excellent: 0, solid: 0, rough_spots: 0, significant_issues: 0, total: 0, broken: 0 }
    for (const e of filteredEvals) {
      if (e.service_feel) {
        counts[e.service_feel]++
        counts.total++
      }
      if (e.broken_moment) counts.broken++
    }
    return counts
  }, [filteredEvals])

  const yoyMax = useMemo(() => Math.max(...yoy.map(y => y.avg), 1), [yoy])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const yearLabel = year === 'all' ? 'All Time' : String(year)
  const isCurYear = year !== 'all' && year === CURRENT_YEAR

  return (
    <div className="space-y-5">

      {/* ── Filter row ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Year chips */}
        <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
          {YEARS.map(y => (
            <button key={y} onClick={() => setYear(y)}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${year === y ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {y}
            </button>
          ))}
          <button onClick={() => setYear('all')}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${year === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            All Time
          </button>
        </div>

        <div className="w-px h-5 bg-gray-200" />

        {/* Service filter */}
        <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
          {(['both', '9am', '11am'] as ServiceFilter[]).map(s => (
            <button key={s} onClick={() => setServiceFilter(s)}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${serviceFilter === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {s === 'both' ? 'Both Services' : s}
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-gray-200" />

        {/* Excl specials */}
        <button onClick={() => setExclSpecial(e => !e)}
          className={`px-3 py-1 rounded-md text-xs font-semibold transition-all border ${exclSpecial ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}>
          {exclSpecial ? '✓ ' : ''}Excl. Special Sundays
        </button>
      </div>

      {/* ── KPI band ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard
          label="Avg Total Attendance"
          value={fmt(kpis.avgTotal)}
          sub={`${kpis.sundayCount} Sundays${isCurYear ? ' (YTD)' : ''}`}
          curValue={kpis.avgTotal}
          prevValue={prevKpis.avgTotal}
        />
        <KpiCard
          label="Avg In-Person"
          value={fmt(kpis.avgInPerson)}
          sub={kpis.inPersonPct != null ? `${kpis.inPersonPct}% of total` : undefined}
          sub2={kpis.avgInPerson9am != null || kpis.avgInPerson11am != null
            ? `9am ${fmt(kpis.avgInPerson9am)} · 11am ${fmt(kpis.avgInPerson11am)}`
            : undefined}
          curValue={kpis.avgInPerson}
          prevValue={prevKpis.avgInPerson}
        />
        <KpiCard
          highlight
          label="Concurrent Viewers ★"
          value={fmt(kpis.avgCo)}
          sub="Church Online unique — denominational"
          sub2={kpis.avgCo9am != null || kpis.avgCo11am != null
            ? `9am ${fmt(kpis.avgCo9am)} · 11am ${fmt(kpis.avgCo11am)}`
            : undefined}
          curValue={kpis.avgCo}
          prevValue={prevKpis.avgCo}
        />
        <KpiCard
          label="Loudness Compliance"
          value={kpis.loudnessCompliance != null ? `${kpis.loudnessCompliance}%` : '—'}
          sub={kpis.loudnessExceedances > 0
            ? `${kpis.loudnessExceedances} exceedance${kpis.loudnessExceedances !== 1 ? 's' : ''} in ${yearLabel}`
            : kpis.loudnessChecked > 0 ? `No exceedances in ${yearLabel}` : 'No loudness data'}
          curValue={kpis.loudnessCompliance}
          prevValue={prevKpis.loudnessCompliance}
        />
        <KpiCard
          label="Avg Service Runtime"
          value={fmtSecs(kpis.avgRuntime)}
          sub2={kpis.avgRuntime9am != null || kpis.avgRuntime11am != null
            ? `9am ${fmtSecs(kpis.avgRuntime9am)} · 11am ${fmtSecs(kpis.avgRuntime11am)}`
            : undefined}
          curValue={kpis.avgRuntime}
          prevValue={prevKpis.avgRuntime}
        />
      </div>

      {/* ── Trend chart + YoY ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
        {/* Trend line chart */}
        <div className="border border-gray-200 rounded-xl p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">
                Attendance Trend{year !== 'all' ? ` — ${year}` : ''}
              </p>
              <p className="text-xs text-gray-400">Weekly totals · {serviceFilter === 'both' ? 'both services' : serviceFilter}</p>
            </div>
          </div>
          {trend.length === 0 ? (
            <div className="h-[180px] flex items-center justify-center text-gray-400 text-xs">No data for this period</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={trend} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 9, fill: '#9ca3af' }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 9, fill: '#9ca3af' }}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                />
                <Tooltip
                  contentStyle={{ fontSize: 11, border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 10px' }}
                  labelStyle={{ color: '#374151', fontWeight: 600, marginBottom: 2 }}
                />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke="#93c5fd"
                  strokeWidth={2}
                  dot={false}
                  name="Total"
                />
                <Line
                  type="monotone"
                  dataKey="inPerson"
                  stroke="#3b82f6"
                  strokeWidth={2.5}
                  dot={false}
                  name="In-Person"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
          <div className="flex items-center gap-4 mt-2">
            <span className="flex items-center gap-1.5 text-[10px] text-gray-500">
              <span className="w-4 h-0.5 bg-blue-300 inline-block" />Total
            </span>
            <span className="flex items-center gap-1.5 text-[10px] text-gray-500">
              <span className="w-4 h-0.5 bg-blue-500 inline-block" />In-Person
            </span>
          </div>
        </div>

        {/* Year over Year */}
        <div className="border border-gray-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-gray-900 mb-0.5">Year over Year</p>
          <p className="text-xs text-gray-400 mb-4">Avg weekly attendance · regular Sundays</p>
          <div className="space-y-3">
            {yoy.slice(0, 7).map(({ year: y, avg: a, count }, i) => (
              <div key={y}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className={`font-semibold ${i === 0 ? 'text-blue-600' : 'text-gray-500'}`}>{y}</span>
                  <span className={`font-mono font-semibold ${i === 0 ? 'text-blue-600' : 'text-gray-500'}`}>
                    {fmt(a)}
                    {count < 20 && <span className="text-gray-400 font-normal text-[10px] ml-1">({count})</span>}
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${(a / yoyMax) * 100}%`,
                      background: i === 0 ? '#3b82f6' : '#93c5fd',
                      opacity: 1 - i * 0.12,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── District Report banner ───────────────────────────────────────── */}
      <div className="rounded-xl overflow-hidden" style={{ background: '#1e3a5f' }}>
        <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
          <p className="text-white text-sm font-semibold">
            📋 District Report Numbers — {yearLabel}
            {isCurYear ? ' YTD' : ''}
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-white/10">
          {[
            {
              label: 'Avg Weekly Attendance',
              value: fmt(kpis.avgTotal),
              note: 'In-person + concurrent online',
              star: false,
            },
            {
              label: 'Concurrent Online Viewers ★',
              value: fmt(kpis.avgCo),
              note: 'Unique viewers, not peak views',
              star: true,
            },
            {
              label: 'Highest Sunday',
              value: kpis.highestSunday ? fmt(kpis.highestSunday.total) : '—',
              note: kpis.highestSunday ? fmtDate(kpis.highestSunday.date) : '',
              star: false,
            },
            {
              label: 'Sundays Reported',
              value: String(kpis.sundayCount),
              note: yearLabel,
              star: false,
            },
          ].map(({ label, value, note, star }) => (
            <div key={label} className="px-5 py-4 bg-white/[0.03]">
              <p className={`text-[11px] font-semibold mb-1 ${star ? 'text-blue-300' : 'text-blue-200/70'}`}>{label}</p>
              <p className={`text-2xl font-bold mb-0.5 ${star ? 'text-blue-300' : 'text-white'}`}>{value}</p>
              <p className="text-[11px] text-blue-200/50">{note}</p>
            </div>
          ))}
        </div>
        {/* Per-service online breakdown */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-white/10">
          {[
            { label: '9am Concurrent Viewers',  value: fmt(kpis.avgCo9am),  note: 'Church Online unique' },
            { label: '11am Concurrent Viewers', value: fmt(kpis.avgCo11am), note: 'Church Online unique' },
            { label: 'Avg CO Views (9am)',       value: fmt(kpis.avgCoViews), note: 'Total views incl. replays' },
            { label: 'Avg Watch Time',           value: `${fmtSecs(kpis.avgWatchTime9am)} / ${fmtSecs(kpis.avgWatchTime11am)}`, note: '9am / 11am' },
          ].map(({ label, value, note }) => (
            <div key={label} className="px-5 py-3 bg-white/[0.02]">
              <p className="text-[10px] text-blue-200/50 mb-0.5">{label}</p>
              <p className="text-lg font-bold text-white/80">{value}</p>
              <p className="text-[10px] text-blue-200/40">{note}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Bottom cards ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Loudness */}
        <div className="border border-gray-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-gray-900 mb-0.5">Loudness</p>
          <p className="text-xs text-gray-400 mb-3">LAeq 15 compliance · {yearLabel}</p>
          <StatRow dot="#16a34a" label="9am Avg LAeq 15"
            value={(() => {
              const rows = filtered.filter(r => r.service_type === 'regular_9am' && r.la_eq_15 != null)
              const a = avg(rows.map(r => r.la_eq_15!))
              return a != null ? `${fmt(a, 1)} dB` : '—'
            })()}
          />
          <StatRow dot="#3b82f6" label="11am Avg LAeq 15"
            value={(() => {
              const rows = filtered.filter(r => r.service_type === 'regular_11am' && r.la_eq_15 != null)
              const a = avg(rows.map(r => r.la_eq_15!))
              return a != null ? `${fmt(a, 1)} dB` : '—'
            })()}
          />
          <StatRow dot="#dc2626" label="Exceedances"
            value={kpis.loudnessChecked > 0 ? `${kpis.loudnessExceedances} of ${kpis.loudnessChecked}` : '—'}
            valueClass={kpis.loudnessExceedances > 0 ? 'text-red-600' : 'text-emerald-600'}
          />
          <StatRow dot="#9ca3af" label="Compliance"
            value={kpis.loudnessCompliance != null ? `${kpis.loudnessCompliance}%` : '—'}
            valueClass={
              kpis.loudnessCompliance == null ? '' :
              kpis.loudnessCompliance >= 90 ? 'text-emerald-600' :
              kpis.loudnessCompliance >= 75 ? 'text-amber-600' : 'text-red-600'
            }
          />
          <StatRow dot="#e5e7eb" label="Goals" value="9am ≤88 · 11am ≤94 dB" />
        </div>

        {/* Online Streaming */}
        <div className="border border-gray-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-gray-900 mb-0.5">Online Streaming</p>
          <p className="text-xs text-gray-400 mb-3">Avg per Sunday · {yearLabel}</p>
          <StatRow dot="#3b82f6" label="9am Church Online (unique)"
            value={fmt(kpis.avgCo9am)} valueClass="text-blue-700" />
          <StatRow dot="#60a5fa" label="11am Church Online (unique)"
            value={fmt(kpis.avgCo11am)} valueClass="text-blue-700" />
          <StatRow dot="#e5e7eb" label="Combined (denominational)"
            value={fmt(kpis.avgCo)} valueClass="text-blue-700" />
          <StatRow dot="#d97706" label="YouTube Unique"
            value={fmt(kpis.avgYt)} />
          <StatRow dot="#9ca3af" label="CO Avg Watch Time"
            value={`${fmtSecs(kpis.avgWatchTime9am)} / ${fmtSecs(kpis.avgWatchTime11am)}`} />
          <div className="mt-3 px-3 py-2 bg-blue-50 rounded-lg text-[10px] text-blue-600 leading-snug">
            Church Online unique viewers is the denominational reporting number.
          </div>
        </div>

        {/* Post-Service Evaluations */}
        <div className="border border-gray-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-gray-900 mb-0.5">Post-Service Evaluations</p>
          <p className="text-xs text-gray-400 mb-3">
            Crew sentiment · {yearLabel}
            {evalCounts.total > 0 ? ` (${evalCounts.total} submissions)` : ''}
          </p>
          {evalCounts.total === 0 ? (
            <p className="text-gray-400 text-xs py-4 text-center">No evaluation data for this period</p>
          ) : (
            <>
              <StatRow dot="#16a34a" label="Excellent"
                value={`${evalCounts.excellent} (${Math.round(evalCounts.excellent / evalCounts.total * 100)}%)`}
                valueClass="text-emerald-600" />
              <StatRow dot="#3b82f6" label="Solid"
                value={`${evalCounts.solid} (${Math.round(evalCounts.solid / evalCounts.total * 100)}%)`}
                valueClass="text-blue-600" />
              <StatRow dot="#d97706" label="Rough Spots"
                value={`${evalCounts.rough_spots} (${Math.round(evalCounts.rough_spots / evalCounts.total * 100)}%)`}
                valueClass={evalCounts.rough_spots > 0 ? 'text-amber-600' : ''} />
              <StatRow dot="#dc2626" label="Significant Issues"
                value={`${evalCounts.significant_issues} (${Math.round(evalCounts.significant_issues / evalCounts.total * 100)}%)`}
                valueClass={evalCounts.significant_issues > 0 ? 'text-red-600' : ''} />
              <StatRow dot="#6b7280" label="Broken Moment Reports"
                value={String(evalCounts.broken)}
                valueClass={evalCounts.broken > 0 ? 'text-red-600' : 'text-emerald-600'} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
