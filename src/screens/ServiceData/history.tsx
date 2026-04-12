import { Card } from '../../components/ui/Card'
import { formatHistoryDate, type ServiceHistoryColumn, type ServiceHistoryRecord } from './historyData'

export function ServiceHistoryTable({
  title,
  subtitle,
  color,
  columns,
  rows,
  loading,
  error,
}: {
  title: string
  subtitle: string
  color: string
  columns: ServiceHistoryColumn[]
  rows: ServiceHistoryRecord[]
  loading: boolean
  error: string | null
}) {
  const colSpan = columns.length + 1
  const minWidth = Math.max(420, 140 + columns.length * 120)

  return (
    <div>
      <div className="flex items-center gap-2 mb-2.5">
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <div>
          <p className="text-gray-900 text-sm font-semibold">{title}</p>
          <p className="text-gray-400 text-[11px]">{subtitle}</p>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full" style={{ minWidth }}>
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-2 text-gray-400 text-[10px] font-semibold text-left whitespace-nowrap">Date</th>
                {columns.map(column => (
                  <th
                    key={column.key}
                    className={`px-3 py-2 text-gray-400 text-[10px] font-semibold whitespace-nowrap ${
                      column.align === 'right' ? 'text-right' : 'text-left'
                    }`}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={colSpan} className="px-4 py-6 text-center text-gray-400 text-xs">Loading history...</td>
                </tr>
              )}

              {!loading && error && (
                <tr>
                  <td colSpan={colSpan} className="px-4 py-6 text-center text-red-500 text-xs">{error}</td>
                </tr>
              )}

              {!loading && !error && rows.length === 0 && (
                <tr>
                  <td colSpan={colSpan} className="px-4 py-6 text-center text-gray-400 text-xs">No history yet</td>
                </tr>
              )}

              {!loading && !error && rows.map(row => (
                <tr key={row.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-2.5 text-gray-600 text-xs whitespace-nowrap">{formatHistoryDate(row.service_date)}</td>
                  {columns.map(column => (
                    <td
                      key={column.key}
                      className={`px-3 py-2.5 text-gray-700 text-xs whitespace-nowrap ${
                        column.align === 'right' ? 'text-right' : 'text-left'
                      } ${column.mono ? 'font-mono' : ''}`}
                    >
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
