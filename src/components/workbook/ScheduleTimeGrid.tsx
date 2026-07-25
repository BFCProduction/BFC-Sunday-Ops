import { AlertTriangle, Lock } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// ScheduleTimeGrid — side-by-side schedule view on a shared vertical time axis.
//
// Time runs down the left edge; each column is a room or department; every item
// is positioned by its actual start/end. Items that overlap within a single
// column are lane-packed side by side and flagged as conflicts — that overlap
// IS the clash the view exists to surface. (See the Workbook v2 plan's
// "Design constraints" — this must be a timeline grid, never independent lists.)
// ─────────────────────────────────────────────────────────────────────────────

export interface TimeGridColumn {
  key: string
  label: string
}

export interface TimeGridItem {
  id: string
  start: number          // minutes from midnight
  end: number            // minutes from midnight (>= start)
  title: string
  timeLabel: string
  kind: 'event' | 'item' // events are read-only PCO blocks
  columnKeys: string[]   // which columns this item belongs to
}

const PX_PER_MIN = 0.6
const GUTTER = 46
const MIN_COL = 168
const MIN_BLOCK_H = 18

function hourLabel(minute: number) {
  const hour = Math.floor(minute / 60)
  const suffix = hour >= 12 ? 'p' : 'a'
  const h12 = hour % 12 || 12
  return `${h12}${suffix}`
}

interface Placement { item: TimeGridItem; lane: number; conflict: boolean }

function packColumn(items: TimeGridItem[]): { placed: Placement[]; lanes: number } {
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end)
  const placed: Placement[] = []
  let active: Array<{ lane: number; end: number; idx: number }> = []
  sorted.forEach(item => {
    active = active.filter(entry => entry.end > item.start)
    const used = new Set(active.map(entry => entry.lane))
    let lane = 0
    while (used.has(lane)) lane++
    placed.push({ item, lane, conflict: false })
    active.push({ lane, end: item.end, idx: placed.length - 1 })
    if (active.length > 1) active.forEach(entry => { placed[entry.idx].conflict = true })
  })
  const lanes = placed.reduce((max, entry) => Math.max(max, entry.lane), 0) + 1
  return { placed, lanes }
}

export function ScheduleTimeGrid({ columns, items }: { columns: TimeGridColumn[]; items: TimeGridItem[] }) {
  if (columns.length === 0 || items.length === 0) {
    return <p className="px-4 py-6 text-center text-sm text-gray-400">No scheduled activity for this day.</p>
  }

  const minStart = Math.min(...items.map(item => item.start))
  const maxEnd = Math.max(...items.map(item => item.end))
  const windowStart = Math.floor(minStart / 60) * 60
  const windowEnd = Math.max(Math.ceil(maxEnd / 60) * 60, windowStart + 180)
  const height = (windowEnd - windowStart) * PX_PER_MIN

  const hourMarks: number[] = []
  for (let minute = windowStart; minute <= windowEnd; minute += 60) hourMarks.push(minute)

  const bodyMinWidth = GUTTER + columns.length * MIN_COL

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: bodyMinWidth }}>
        {/* Column headers */}
        <div className="flex border-b border-gray-100">
          <div style={{ width: GUTTER, flexShrink: 0 }} />
          {columns.map(column => (
            <div key={column.key} style={{ flex: `1 0 ${MIN_COL}px` }}
              className="border-l border-gray-100 px-2 py-1.5 text-center text-xs font-semibold text-gray-600 truncate">
              {column.label}
            </div>
          ))}
        </div>

        {/* Grid body */}
        <div className="relative" style={{ height }}>
          {/* Hour gutter + gridlines */}
          {hourMarks.map(minute => (
            <div key={minute} className="absolute left-0 right-0" style={{ top: (minute - windowStart) * PX_PER_MIN }}>
              <div className="absolute left-0 text-[10px] font-mono text-gray-300" style={{ top: -6, width: GUTTER - 6, textAlign: 'right' }}>
                {hourLabel(minute)}
              </div>
              <div className="border-t border-gray-100" style={{ marginLeft: GUTTER }} />
            </div>
          ))}

          {/* Columns with positioned blocks */}
          <div className="absolute top-0 bottom-0 flex" style={{ left: GUTTER, right: 0 }}>
            {columns.map(column => {
              const columnItems = items.filter(item => item.columnKeys.includes(column.key))
              const { placed, lanes } = packColumn(columnItems)
              return (
                <div key={column.key} className="relative border-l border-gray-100" style={{ flex: `1 0 ${MIN_COL}px` }}>
                  {placed.map(({ item, lane, conflict }) => {
                    const top = (item.start - windowStart) * PX_PER_MIN
                    const blockHeight = Math.max((item.end - item.start) * PX_PER_MIN, MIN_BLOCK_H)
                    const widthPct = 100 / lanes
                    const tone = conflict
                      ? 'border-red-400 bg-red-50 text-red-800'
                      : item.kind === 'event'
                        ? 'border-blue-300 bg-blue-50 text-blue-900'
                        : 'border-teal-300 bg-teal-50 text-teal-900'
                    return (
                      <div
                        key={item.id}
                        title={`${item.title} · ${item.timeLabel}`}
                        className={`absolute overflow-hidden rounded-md border px-1.5 py-1 ${tone}`}
                        style={{ top: top + 1, height: blockHeight - 2, left: `calc(${lane * widthPct}% + 2px)`, width: `calc(${widthPct}% - 4px)` }}
                      >
                        <p className="truncate text-[11px] font-semibold leading-tight">
                          {conflict && <AlertTriangle className="mr-1 inline h-3 w-3 align-[-2px]" aria-hidden="true" />}
                          {item.kind === 'event' && !conflict && <Lock className="mr-1 inline h-3 w-3 align-[-2px]" aria-hidden="true" />}
                          {item.title}
                        </p>
                        <p className="truncate font-mono text-[10px] opacity-80">{item.timeLabel}</p>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
