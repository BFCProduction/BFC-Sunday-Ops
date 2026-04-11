import { useState, useEffect, useCallback } from 'react'
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

interface CombinedRow {
  date: string
  am9: ServiceRecord | null
  am11: ServiceRecord | null
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

function fmtWeather(r: ServiceRecord | null): string {
  if (!r) return '—'
  const temp = r.weather_temp_f != null ? `${Math.round(r.weather_temp_f)}°F` : ''
  const cond = r.weather_condition ?? ''
  return [temp, cond].filter(Boolean).join(' ') || '—'
}

function slash(a: string, b: string): string {
  if (a === '—' && b === '—') return '—'
  return `${a} / ${b}`
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

// ── Single Service Table (9am, 11am, or Special) ──────────────────────────────

function SingleTable({
  serviceType,
  showLabel = false,
}: {
  serviceType: 'sunday-9am' | 'sunday-11am' | 'special'
  showLabel?: boolean
}) {
  const [records, setRecords] = useState<ServiceRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [sortAsc, setSortAsc] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const goal = GOAL_LAeq[serviceType]
  const colCount = showLabel ? 16 : 15

  const loadPage = useCallback(async () => {
    setLoading(true)
    setError(null)
    const from = page * PAGE_SIZE
    const { data, count, error: err } = await supabase
      .from('analytics_records')
      .select('*', { count: 'exact' })
      .eq('service_type', serviceType)
      .order('service_date', { ascending: sortAsc })
      .range(from, from + PAGE_SIZE - 1)
    if (err) {
      setError(err.message)
    } else {
      setRecords(data ?? [])
      setTotal(count ?? 0)
    }
    setLoading(false)
  }, [page, sortAsc, serviceType])

  useEffect(() => { loadPage() }, [loadPage])

  // Reset page when sort order changes
  useEffect(() => { setPage(0) }, [sortAsc])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1
  const to = Math.min((page + 1) * PAGE_SIZE, total)

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
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setSortAsc(a => !a)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
        >
          <ArrowUpDown className="w-3 h-3" />
          {sortAsc ? 'Oldest first' : 'Newest first'}
        </button>
        <p className="text-gray-400 text-xs">
          {total === 0 ? 'No records' : `Showing ${from}–${to} of ${total.toLocaleString()}`}
        </p>
      </div>

      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full" style={{ minWidth: showLabel ? 1520 : 1440 }}>
            <thead>
              <tr>
                <TH sticky>Date</TH>
                {showLabel && <TH>Service</TH>}
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
                  <td colSpan={colCount} className="py-10 text-center text-gray-400 text-xs">Loading…</td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="py-10 text-center text-gray-400 text-xs">No records found</td>
                </tr>
              ) : records.map(r => {
                const laOver = goal != null && r.la_eq_15 != null && r.la_eq_15 > goal
                return (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    <TD sticky className="font-medium text-gray-900">{fmtDate(r.service_date)}</TD>
                    {showLabel && <TD className="text-gray-600 max-w-[140px] truncate">{r.service_label ?? '—'}</TD>}
                    <TD right mono className="text-gray-900 font-semibold">{combinedAttStr(r)}</TD>
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

// ── Combined Table ────────────────────────────────────────────────────────────

function CombinedTable() {
  const [allRecords, setAllRecords] = useState<ServiceRecord[]>([])
  const [page, setPage] = useState(0)
  const [sortAsc, setSortAsc] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      // Fetch all regular records — ~500 rows max is fine client-side
      const { data, error: err } = await supabase
        .from('analytics_records')
        .select('*')
        .in('service_type', ['sunday-9am', 'sunday-11am'])
      if (err) {
        setError(err.message)
      } else {
        setAllRecords(data ?? [])
      }
      setLoading(false)
    }
    load()
  }, [])

  // Group by date
  const dateMap = new Map<string, CombinedRow>()
  for (const r of allRecords) {
    if (!dateMap.has(r.service_date)) {
      dateMap.set(r.service_date, { date: r.service_date, am9: null, am11: null })
    }
    const row = dateMap.get(r.service_date)!
    if (r.service_type === 'sunday-9am') row.am9 = r
    else row.am11 = r
  }

  const sortedRows: CombinedRow[] = Array.from(dateMap.values()).sort((a, b) =>
    sortAsc ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)
  )

  const totalSundays = sortedRows.length
  const totalPages = Math.max(1, Math.ceil(totalSundays / PAGE_SIZE))
  const pageRows = sortedRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const from = totalSundays === 0 ? 0 : page * PAGE_SIZE + 1
  const to = Math.min((page + 1) * PAGE_SIZE, totalSundays)

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
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => { setSortAsc(a => !a); setPage(0) }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
        >
          <ArrowUpDown className="w-3 h-3" />
          {sortAsc ? 'Oldest first' : 'Newest first'}
        </button>
        <p className="text-gray-400 text-xs">
          {totalSundays === 0
            ? 'No records'
            : `Showing ${from}–${to} of ${totalSundays.toLocaleString()} Sundays`}
        </p>
      </div>

      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full" style={{ minWidth: 1600 }}>
            <thead>
              <tr>
                <TH sticky>Date</TH>
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
                  <td colSpan={15} className="py-10 text-center text-gray-400 text-xs">Loading…</td>
                </tr>
              ) : pageRows.length === 0 ? (
                <tr>
                  <td colSpan={15} className="py-10 text-center text-gray-400 text-xs">No records found</td>
                </tr>
              ) : pageRows.map(({ date, am9, am11 }) => {
                // Combined attendance = sum across both services (nulls treated as 0)
                const hasAnyAtt =
                  am9?.in_person_attendance != null || am11?.in_person_attendance != null ||
                  am9?.church_online_unique_viewers != null || am11?.church_online_unique_viewers != null
                const combinedTotal = hasAnyAtt
                  ? (
                      (am9?.in_person_attendance ?? 0) + (am11?.in_person_attendance ?? 0) +
                      (am9?.church_online_unique_viewers ?? 0) + (am11?.church_online_unique_viewers ?? 0) +
                      (am9?.youtube_unique_viewers ?? 0) + (am11?.youtube_unique_viewers ?? 0)
                    ).toLocaleString()
                  : '—'

                const la9over = am9 != null && am9.la_eq_15 != null && am9.la_eq_15 > GOAL_LAeq['sunday-9am']
                const la11over = am11 != null && am11.la_eq_15 != null && am11.la_eq_15 > GOAL_LAeq['sunday-11am']
                const la9str = fmtDb(am9?.la_eq_15)
                const la11str = fmtDb(am11?.la_eq_15)

                return (
                  <tr key={date} className="hover:bg-gray-50 transition-colors">
                    <TD sticky className="font-medium text-gray-900">{fmtDate(date)}</TD>
                    <TD right mono className="text-gray-900 font-semibold">{combinedTotal}</TD>
                    <TD right mono>{slash(fmtNum(am9?.in_person_attendance), fmtNum(am11?.in_person_attendance))}</TD>
                    <TD right mono>{slash(fmtNum(am9?.church_online_views), fmtNum(am11?.church_online_views))}</TD>
                    <TD right mono>{slash(fmtNum(am9?.church_online_unique_viewers), fmtNum(am11?.church_online_unique_viewers))}</TD>
                    <TD right mono>{slash(fmtSecs(am9?.church_online_avg_watch_time_secs), fmtSecs(am11?.church_online_avg_watch_time_secs))}</TD>
                    <TD right mono>{slash(fmtNum(am9?.youtube_unique_viewers), fmtNum(am11?.youtube_unique_viewers))}</TD>
                    <TD right mono>{slash(fmtSecs(am9?.service_run_time_secs), fmtSecs(am11?.service_run_time_secs))}</TD>
                    <TD right mono>{slash(fmtSecs(am9?.message_run_time_secs), fmtSecs(am11?.message_run_time_secs))}</TD>
                    <TD right mono>{fmtSecs(am9?.stage_flip_time_secs)}</TD>
                    <TD className="whitespace-nowrap">{fmtWeather(am9 ?? am11)}</TD>
                    <TD right mono>{slash(fmtDb(am9?.max_db_a_slow), fmtDb(am11?.max_db_a_slow))}</TD>
                    <TD right mono>{slash(fmtDb(am9?.max_db_c_slow), fmtDb(am11?.max_db_c_slow))}</TD>
                    <TD right mono>
                      {la9str === '—' && la11str === '—' ? '—' : (
                        <>
                          <span className={la9over ? 'text-red-600 font-semibold' : ''}>
                            {la9str}{la9over ? '⚠' : ''}
                          </span>
                          {' / '}
                          <span className={la11over ? 'text-red-600 font-semibold' : ''}>
                            {la11str}{la11over ? '⚠' : ''}
                          </span>
                        </>
                      )}
                    </TD>
                    <TD right mono>{slash(fmtDb(am9?.lc_eq_15), fmtDb(am11?.lc_eq_15))}</TD>
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
          total={totalSundays}
          label="Sundays"
          onPrev={() => setPage(p => Math.max(0, p - 1))}
          onNext={() => setPage(p => Math.min(totalPages - 1, p + 1))}
        />
      )}
    </div>
  )
}

// ── Explorer ──────────────────────────────────────────────────────────────────

type ExplorerTab = '9am' | '11am' | 'combined' | 'special'

const EXPLORER_TABS: { id: ExplorerTab; label: string }[] = [
  { id: '9am',      label: '9:00 AM'          },
  { id: '11am',     label: '11:00 AM'         },
  { id: 'combined', label: 'Combined'          },
  { id: 'special',  label: 'Special Services' },
]

export function Explorer() {
  const [tab, setTab] = useState<ExplorerTab>('9am')

  return (
    <div>
      {/* Inner tab bar */}
      <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5 w-fit mb-5">
        {EXPLORER_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${
              tab === t.id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === '9am'      && <SingleTable serviceType="sunday-9am" />}
      {tab === '11am'     && <SingleTable serviceType="sunday-11am" />}
      {tab === 'combined' && <CombinedTable />}
      {tab === 'special'  && <SingleTable serviceType="special" showLabel />}
    </div>
  )
}
