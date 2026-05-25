import type { Workbook } from '../types'

export interface WorkbookScheduleExportRow {
  id: string
  kind: 'event' | 'item'
  date: string
  startTime: string | null
  endTime: string | null
  title: string
  location: string | null
  relatedEvent: string | null
  assignments: string[]
  notes: string | null
}

function esc(value: string | null | undefined) {
  return (value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatTime(value: string | null) {
  if (!value) return ''
  const [hour, minute] = value.slice(0, 5).split(':').map(Number)
  const date = new Date()
  date.setHours(hour, minute, 0, 0)
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function scheduleRows(rows: WorkbookScheduleExportRow[]) {
  const dates = [...new Set(rows.map(row => row.date))]
  return dates.map(date => {
    const contents = rows
      .filter(row => row.date === date)
      .map(row => {
        const time = row.endTime
          ? `${formatTime(row.startTime)} - ${formatTime(row.endTime)}`
          : formatTime(row.startTime)
        const subtitle = [row.location, row.relatedEvent].filter(Boolean).join(' | ')
        const details = row.assignments.length > 0
          ? `<div class="assignments">${row.assignments.map(esc).join('<br />')}</div>`
          : ''
        return `
          <tr class="${row.kind === 'event' ? 'event' : ''}">
            <td class="time">${esc(time)}</td>
            <td>
              <div class="title">${esc(row.title)}</div>
              ${subtitle ? `<div class="subtitle">${esc(subtitle)}</div>` : ''}
              ${details}
            </td>
            <td class="notes">${esc(row.notes)}</td>
          </tr>
        `
      })
      .join('')
    return `<tr class="day"><td colspan="3">${esc(formatDate(date))}</td></tr>${contents}`
  }).join('')
}

export function generateWorkbookScheduleHtml(workbook: Workbook, rows: WorkbookScheduleExportRow[]) {
  const version = workbook.published_version > 0
    ? `Published v${workbook.published_version}`
    : 'Draft'
  const dateRange = workbook.start_date === workbook.end_date
    ? formatDate(workbook.start_date)
    : `${formatDate(workbook.start_date)} - ${formatDate(workbook.end_date)}`

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(workbook.name)} - Detail Schedule</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, sans-serif; color: #111827; background: #fff; }
    .page { padding: 0.62in 0.68in; }
    h1 { margin: 0; font-size: 23px; letter-spacing: -0.025em; }
    .meta { margin-top: 7px; font-size: 11px; color: #64748b; }
    .bar { margin-top: 18px; background: #dcebee; border-top: 1px solid #b3cfd4; border-bottom: 1px solid #b3cfd4; padding: 7px 10px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; }
    table { border-collapse: collapse; width: 100%; margin-top: 16px; font-size: 11px; }
    th { text-align: left; padding: 7px 8px; background: #e5e7eb; font-size: 10px; text-transform: uppercase; letter-spacing: 0.07em; }
    td { vertical-align: top; border-bottom: 1px solid #e5e7eb; padding: 8px; }
    .time { width: 128px; text-align: right; white-space: nowrap; font-style: italic; }
    .notes { width: 190px; color: #374151; }
    .day td { background: #4b5563; border-bottom: none; color: white; font-weight: 700; font-style: italic; padding: 7px 9px; }
    .title { font-weight: 700; }
    .event .title { color: #1d4ed8; text-transform: uppercase; }
    .subtitle { margin-top: 2px; color: #475569; font-size: 10.5px; }
    .assignments { margin-top: 5px; color: #374151; line-height: 1.42; }
    .footer { margin-top: 22px; font-size: 10px; color: #6b7280; display: flex; justify-content: space-between; }
    @media print {
      @page { size: letter; margin: 0; }
      .day { break-after: avoid; }
      tr { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="page">
    <h1>${esc(workbook.name)}</h1>
    <div class="meta">${esc(workbook.venue)}${workbook.venue ? ' | ' : ''}${esc(dateRange)} | ${esc(version)}</div>
    <div class="bar">Detail Schedule</div>
    <table>
      <thead><tr><th class="time">Time</th><th>Item</th><th class="notes">Notes</th></tr></thead>
      <tbody>${scheduleRows(rows)}</tbody>
    </table>
    <div class="footer"><span>Sunday Ops Workbook Schedule</span><span>${esc(version)}</span></div>
  </div>
</body>
</html>`
}
