import { useState, useEffect, useMemo } from 'react'
import { ChevronLeft, ChevronRight, ArrowUpDown } from 'lucide-react'
import { supabase } from '../../lib/supabase'

const PAGE_SIZE = 52
const GOAL_LAeq: Record<string, number> = { 'sunday-9am': 88, 'sunday-11am': 94 }

interface ServiceRecord {
  id: string
  service_date: string
  service_type: 'sunday-9am' | 'sunday-11am' | 'special'
  service_label: string | null
  in_person_attendance: number | null
  church_online_views: number | null
  church_online_unique_viewers: number | null
  church_online_avg_watch_time_secs: number | null
  youtube_unique_viewers: number | null
  service_run_time_secs: number | null
  message_run_time_secs: number | null
  stage_flip_time_secs: number | null
  weather_temp_f: number | null
  weather_condition: string | null
  max_db_a_slow: number | null
  la_eq_15: number | null
  max_db_c_slow: number | null
  lc_eq_15: number | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtSecs(secs: number | null | undefined): string {
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

function fmtNum(v: number | null | undefined): string {
  return v == null ? '—' : v.toLocaleString()
}

function fmtDb(v: number | null | undefined): string {
  return v == null ? '—' : v.toFixed(1)
}

function fmtWeather(r: ServiceRecord): string {
  const temp = r.weather_temp_f != null ? `${Math.round(r.weather_temp_f)}°F` : ''
  const cond = r.weather_condition ?? ''
  return [temp, cond].filter(Boolean).join(' ') || '—'
}

function combinedAttStr(r: ServiceRecord): string {
  if (
    r.in_person_attendance == null &&
    r.church_online_unique_viewers == null &&
    r.youtube_unique_viewers == null
  ) return '—'
  return (
    (r.in_person_attendance ?? 0) +
    (r.church_online_unique_viewers ?? 0) +
    (r.youtube_unique_viewers ?? 0)
  ).toLocaleString()
}

// ── Shared cell components ────────────────────────────────────────────────────

function TH({
  children,
  right = false,
  sticky = false,
  className = '',
}: {
  children: React.ReactNode
  right?: boolean
  sticky?: boolean
  className?: string
}) {
  return (
    <th
      className={[
        'px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400',
        'whitespace-nowrap border-b border-gray-100 bg-gray-50',
        right ? 'text-right' : 'text-left',
        sticky ? 'sticky left-0 z-10' : '',
        className,
      ].join(' ')}
    >
      {children}
    </th>
  )
}

function TD({
  children,
  right = false,
  mono = false,
  sticky = false,
  className = '',
}: {
  children: React.ReactNode
  right?: boolean
  mono?: boolean
  sticky?: boolean
  className?: string
}) {
  return (
    <td
      className={[
        'px-3 py-2 text-xs border-b border-gray-50',
        right ? 'text-right' : 'text-left',
        mono ? 'font-mono' : '',
        sticky ? 'sticky left-0 z-10 bg-white' : '',
        className,
      ].join(' ')}
    >
      {children}
    </td>
  )
}

// ── Pagination Controls ───────────────────────────────────────────────────────

function Pagination({
  page,
  totalPages,
  from,
  to,
  total,
  label,
  onPrev,
  onNext,
}: {
  page: number
  totalPages: number
  from: number
  to: number
  total: number
  label: string
  onPrev: () => void
  onNext: () => void
}) {
  return (
    <div className="flex items-center justify-between mt-3">
      <button
        onClick={onPrev}
        disabled={page === 0}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <ChevronLeft className="w-3.5 h-3.5" /> Previous
      </button>
      <span className="text-gray-400 text-xs">
        Showing {from}–{to} of {total.toLocaleString()} {label} · Page {page + 1} of {totalPages}
      </span>
      <button
        onClick={onNext}
        disabled={page >= totalPages - 1}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Next <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// ── Service badge ─────────────────────────────────────────────────────────────

const SERVICE_META: Record<string, { label: string; color: string; bg: string }> = {
  'sunday-9am':  { label: '9am',     color: '#3b82f6', bg: 'rgba(59,130,246,0.15)'  },
  'sunday-11am': { label: '11am',    color: '#8b5cf6', bg: 'rgba(139,92,246,0.15)'  },
  'special':     { label: 'Special', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)'  },
}

function ServiceBadge({ type }: { type: string }) {
  const meta = SERVICE_META[type] ?? { label: type, color: '#6b7280', bg: 'rgba(107,114,128,0.15)' }
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ backgroundColor: meta.bg, color: meta.color }}
    >
      <span
        className="rounded-full flex-shrink-0"
        style={{ width: 6, height: 6, backgroundColor: meta.color }}
      />
      {meta.label}
    </span>
  )
}

// ── Sort helpers ──────────────────────────────────────────────────────────────

type SortKey = 'date' | 'in_person_attendance' | 'service_run_time_secs' | 'message_run_time_secs' | 'max_db_a_slow' | 'la_eq_15'

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'date',                   label: 'Date'       },
  { value: 'in_person_attendance',   label: 'Attendance' },
  { value: 'service_run_time_secs',  label: 'Svc Time'   },
  { value: 'message_run_time_secs',  label: 'Msg Time'   },
  { value: 'max_db_a_slow',          label: 'dB A Max'   },
  { value: 'la_eq_15',               label: 'LAeq 15'    },
]

function compareRecords(a: ServiceRecord, b: ServiceRecord, key: SortKey, asc: boolean): number {
  if (key === 'date') {
    const va = a.service_date
    const vb = b.service_date
    return asc ? va.localeCompare(vb) : vb.localeCompare(va)
  }
  const va = (a[key as keyof ServiceRecord] as number | null)
  const vb = (b[key as keyof ServiceRecord] as number | null)
  // Nulls always go to the bottom
  if (va == null && vb == null) return 0
  if (va == null) return 1
  if (vb == null) return -1
  return asc ? va - vb : vb - va
}

// ── Explorer ──────────────────────────────────────────────────────────────────

type ServiceFilter = 'all' | 'sunday-9am' | 'sunday-11am' | 'special'

export function Explorer() {
  const [allRecords, setAllRecords] = useState<ServiceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters & sort
  const [serviceFilter, setServiceFilter] = useState<ServiceFilter>('all')
  const [yearFilter, setYearFilter] = useState<string>('all')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortAsc, setSortAsc] = useState(false)
  const [page, setPage] = useState(0)

  // Load all records once
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      const { data, error: err } = await supabase
        .from('analytics_records')
        .select('*')
        .order('service_date', { ascending: false })
      if (err) {
        setError(err.message)
      } else {
        setAllRecords(data ?? [])
      }
      setLoading(false)
    }
    load()
  }, [])

  // Derive available years from loaded records
  const availableYears = useMemo(() => {
    const years = new Set<string>()
    for (const r of allRecords) {
      years.add(r.service_date.slice(0, 4))
    }
    return Array.from(years).sort((a, b) => b.localeCompare(a))
  }, [allRecords])

  // Filter + sort client-side
  const filteredSorted = useMemo(() => {
    let rows = allRecords
    if (serviceFilter !== 'all') {
      rows = rows.filter(r => r.service_type === serviceFilter)
    }
    if (yearFilter !== 'all') {
      rows = rows.filter(r => r.service_date.startsWith(yearFilter))
    }
    return [...rows].sort((a, b) => compareRecords(a, b, sortKey, sortAsc))
  }, [allRecords, serviceFilter, yearFilter, sortKey, sortAsc])

  // Reset page on filter/sort change
  useEffect(() => { setPage(0) }, [serviceFilter, yearFilter, sortKey, sortAsc])

  const total = filteredSorted.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const pageRows = filteredSorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1
  const to = Math.min((page + 1) * PAGE_SIZE, total)

  const ctrlClass =
    'bg-gray-100 text-gray-700 text-xs font-semibold rounded-lg px-3 py-1.5 border-0 focus:outline-none focus:ring-2 focus:ring-blue-500'

  const directionLabel = sortKey === 'date'
    ? (sortAsc ? 'Oldest → Newest' : 'Newest → Oldest')
    : (sortAsc ? 'Low → High' : 'High → Low')

  if (error) {
    return (
      <div className="py-12 text-center border border-gray-200 rounded-lg">
        <p className="text-red-500 text-sm font-medium mb-1">{error}</p>
        <p className="text-gray-400 text-xs">Make sure migration 012_create_service_records.sql has been run.</p>
      </div>
    )
  }

  return (
    <div>
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {/* Service filter */}
        <select
          value={serviceFilter}
          onChange={e => setServiceFilter(e.target.value as ServiceFilter)}
          className={ctrlClass}
        >
          <option value="all">All Services</option>
          <option value="sunday-9am">9:00 AM</option>
          <option value="sunday-11am">11:00 AM</option>
          <option value="special">Special</option>
        </select>

        {/* Year filter */}
        <select
          value={yearFilter}
          onChange={e => setYearFilter(e.target.value)}
          className={ctrlClass}
        >
          <option value="all">All Years</option>
          {availableYears.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>

        {/* Sort key */}
        <select
          value={sortKey}
          onChange={e => setSortKey(e.target.value as SortKey)}
          className={ctrlClass}
        >
          {SORT_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {/* Sort direction */}
        <button
          onClick={() => setSortAsc(a => !a)}
          className={`${ctrlClass} flex items-center gap-1.5 cursor-pointer`}
        >
          <ArrowUpDown className="w-3 h-3" />
          {directionLabel}
        </button>

        {/* Row count summary */}
        <span className="ml-auto text-gray-400 text-xs">
          {loading
            ? 'Loading…'
            : total === 0
              ? 'No records'
              : `${total.toLocaleString()} record${total === 1 ? '' : 's'}`}
        </span>
      </div>

      {/* Table */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full" style={{ minWidth: 1560 }}>
            <thead>
              <tr>
                <TH sticky>Date</TH>
                <TH>Service</TH>
                <TH right>Combined</TH>
                <TH right>In-Person</TH>
                <TH right>CO Views</TH>
                <TH right>CO Unique</TH>
                <TH right>CO Avg Watch</TH>
                <TH right>YT Unique</TH>
                <TH right>Svc Time</TH>
                <TH right>Msg Time</TH>
                <TH right>Flip Time</TH>
                <TH>Weather</TH>
                <TH right>dB A Max</TH>
                <TH right>dB C Max</TH>
                <TH right>LAeq 15</TH>
                <TH right>LCeq 15</TH>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={16} className="py-10 text-center text-gray-400 text-xs">Loading…</td>
                </tr>
              ) : pageRows.length === 0 ? (
                <tr>
                  <td colSpan={16} className="py-10 text-center text-gray-400 text-xs">No records found</td>
                </tr>
              ) : pageRows.map(r => {
                const goal = GOAL_LAeq[r.service_type]
                const laOver = goal != null && r.la_eq_15 != null && r.la_eq_15 > goal
                return (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    <TD sticky className="font-medium text-gray-900">{fmtDate(r.service_date)}</TD>
                    <TD><ServiceBadge type={r.service_type} /></TD>
                    <TD right mono>{combinedAttStr(r)}</TD>
                    <TD right mono>{fmtNum(r.in_person_attendance)}</TD>
                    <TD right mono>{fmtNum(r.church_online_views)}</TD>
                    <TD right mono>{fmtNum(r.church_online_unique_viewers)}</TD>
                    <TD right mono>{fmtSecs(r.church_online_avg_watch_time_secs)}</TD>
                    <TD right mono>{fmtNum(r.youtube_unique_viewers)}</TD>
                    <TD right mono>{fmtSecs(r.service_run_time_secs)}</TD>
                    <TD right mono>{fmtSecs(r.message_run_time_secs)}</TD>
                    <TD right mono>{fmtSecs(r.stage_flip_time_secs)}</TD>
                    <TD className="whitespace-nowrap">{fmtWeather(r)}</TD>
                    <TD right mono>{fmtDb(r.max_db_a_slow)}</TD>
                    <TD right mono>{fmtDb(r.max_db_c_slow)}</TD>
                    <TD right mono className={laOver ? 'text-red-600 font-semibold' : ''}>
                      {fmtDb(r.la_eq_15)}{laOver ? ' ⚠' : ''}
                    </TD>
                    <TD right mono>{fmtDb(r.lc_eq_15)}</TD>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          from={from}
          to={to}
          total={total}
          label="records"
          onPrev={() => setPage(p => Math.max(0, p - 1))}
          onNext={() => setPage(p => Math.min(totalPages - 1, p + 1))}
        />
      )}
    </div>
  )
}
