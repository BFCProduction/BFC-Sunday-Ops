import type { CallSheetPerson } from './generateCallSheetHtml'
import type { PayLine } from './generatePayReportHtml'
import type { Workbook, WorkbookIntercomChannel } from '../types'
import type { WorkbookScheduleExportRow } from './generateWorkbookScheduleHtml'

export type WorkbookPrintSection = 'schedule' | 'intercom' | 'callSheets' | 'crewPay'

export interface IntercomPrintRow {
  name: string
  roles: string[]
  packType: string | null
  channelModes: Record<string, 'momentary' | 'latch'>
}

export interface IntercomPrintEvent {
  eventName: string
  eventDate: string
  channels: WorkbookIntercomChannel[]
  rows: IntercomPrintRow[]
  packUsage: Array<{ label: string; used: number; available: number }>
}

export interface WorkbookPacketInput {
  workbook: Workbook
  sections: WorkbookPrintSection[]
  scheduleRows: WorkbookScheduleExportRow[]
  intercomEvents: IntercomPrintEvent[]
  callSheetPeople: CallSheetPerson[]
  payLines: PayLine[]
  totalHours: number
  totalPay: number
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

function formatTime(value: string | null | undefined) {
  if (!value) return '—'
  const [hour, minute] = value.slice(0, 5).split(':').map(Number)
  if (Number.isNaN(hour)) return value
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`
}

function money(value: number) {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function packetHeader(title: string, workbook: Workbook, subtitle?: string) {
  const range = workbook.start_date === workbook.end_date
    ? formatDate(workbook.start_date)
    : `${formatDate(workbook.start_date)} – ${formatDate(workbook.end_date)}`
  return `
    <header class="page-head">
      <div>
        <p class="eyebrow">Sunday Ops Workbook</p>
        <h1>${esc(title)}</h1>
        <p class="meta">${esc(workbook.name)} · ${esc(range)}${workbook.venue ? ` · ${esc(workbook.venue)}` : ''}</p>
      </div>
      ${subtitle ? `<p class="head-note">${esc(subtitle)}</p>` : ''}
    </header>`
}

function scheduleSection(input: WorkbookPacketInput) {
  const grouped = new Map<string, WorkbookScheduleExportRow[]>()
  for (const row of input.scheduleRows) {
    const rows = grouped.get(row.date) ?? []
    rows.push(row)
    grouped.set(row.date, rows)
  }
  const days = [...grouped.entries()].map(([date, rows]) => `
    <section class="day-block">
      <h2>${esc(formatDate(date))}</h2>
      <table>
        <thead><tr><th class="time-col">Time</th><th>Item</th><th class="location-col">Room</th><th>Notes / assignments</th></tr></thead>
        <tbody>
          ${rows.map(row => `
            <tr>
              <td class="mono">${formatTime(row.startTime)}${row.endTime ? `<br><span class="muted">${formatTime(row.endTime)}</span>` : ''}</td>
              <td><strong>${esc(row.title)}</strong>${row.relatedEvent ? `<div class="muted">${esc(row.relatedEvent)}</div>` : ''}</td>
              <td>${row.location ? esc(row.location) : '<span class="muted">—</span>'}</td>
              <td>${row.notes ? esc(row.notes) : ''}${row.assignments.length ? `<div class="assignment-list">${row.assignments.map(esc).join(' · ')}</div>` : ''}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </section>`).join('')
  return `
    <section class="packet-page">
      ${packetHeader('Detail Schedule', input.workbook)}
      ${days || '<p class="empty">No schedule rows yet.</p>'}
    </section>`
}

function intercomSection(input: WorkbookPacketInput) {
  if (input.intercomEvents.length === 0) {
    return `<section class="packet-page">${packetHeader('Intercom Grids', input.workbook)}<p class="empty">No event Intercom Grids are configured.</p></section>`
  }
  return input.intercomEvents.map(event => {
    const inventory = event.packUsage.map(pack => {
      const over = pack.used > pack.available
      return `<span class="inventory ${over ? 'over' : ''}">${esc(pack.label)} ${pack.used}/${pack.available}</span>`
    }).join('')
    return `
      <section class="packet-page intercom-page">
        ${packetHeader('Intercom Grid', input.workbook, `${formatDate(event.eventDate)} · ${event.eventName}`)}
        <div class="legend">${inventory}<span class="mode momentary">M · Momentary</span><span class="mode latch">L · Latch</span></div>
        <table class="intercom-table">
          <thead>
            <tr>
              <th class="number-col">#</th><th class="crew-col">Crew member</th><th class="role-col">Role</th><th class="pack-col">Com pack</th>
              ${event.channels.map(channel => `<th>${esc(channel.name)}</th>`).join('')}
              <th class="total-col">Total</th>
            </tr>
          </thead>
          <tbody>
            ${event.rows.map((row, index) => `
              <tr>
                <td class="center mono">${index + 1}</td>
                <td><strong>${esc(row.name)}</strong></td>
                <td>${row.roles.length ? esc(row.roles.join(' / ')) : '<span class="muted">—</span>'}</td>
                <td>${row.packType ? esc(row.packType) : '<span class="muted">No intercom</span>'}</td>
                ${event.channels.map(channel => {
                  const mode = row.packType ? row.channelModes[channel.id] : null
                  return `<td class="center">${mode ? `<span class="mode-cell ${mode}">${mode === 'momentary' ? 'M' : 'L'}</span>` : ''}</td>`
                }).join('')}
                <td class="center mono"><strong>${row.packType ? Object.keys(row.channelModes).length : 0}</strong></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </section>`
  }).join('')
}

function callSheetSection(input: WorkbookPacketInput) {
  if (input.callSheetPeople.length === 0) {
    return `<section class="packet-page">${packetHeader('Call Sheets', input.workbook)}<p class="empty">No assigned crew to build call sheets from.</p></section>`
  }
  return input.callSheetPeople.map(person => `
    <section class="packet-page">
      ${packetHeader(`Call Sheet · ${person.name}`, input.workbook)}
      <table>
        <thead><tr><th>Day</th><th>Event</th><th>Role</th><th class="time-col">Call</th><th class="time-col">Release</th></tr></thead>
        <tbody>
          ${person.shifts.map(shift => `
            <tr>
              <td>${esc(formatDate(shift.date))}</td>
              <td>${shift.event ? esc(shift.event) : '<span class="muted">—</span>'}</td>
              <td>${shift.role ? esc(shift.role) : '<span class="muted">—</span>'}</td>
              <td class="mono">${formatTime(shift.call)}</td>
              <td class="mono">${formatTime(shift.release)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      <p class="footnote">Times come from the workbook crew roster. Check with your production lead if anything looks off.</p>
    </section>`).join('')
}

function paySection(input: WorkbookPacketInput) {
  return `
    <section class="packet-page">
      ${packetHeader('Crew Pay · Business Office', input.workbook)}
      <p class="notice">Paid crew only. Hours are each person’s call-to-release time per event, summed across the workbook and rounded to the nearest half hour. Confirm against actuals before processing payroll.</p>
      ${input.payLines.length === 0 ? '<p class="empty">No paid crew hours to report.</p>' : `
        <table class="pay-table">
          <thead><tr><th>Crew member</th><th class="numeric">Hours</th><th class="numeric">Pay</th></tr></thead>
          <tbody>${input.payLines.map(line => `<tr><td>${esc(line.name)}</td><td class="numeric mono">${line.hours.toFixed(1)}</td><td class="numeric mono">${money(line.pay)}</td></tr>`).join('')}</tbody>
          <tfoot><tr><td><strong>Total</strong></td><td class="numeric mono"><strong>${input.totalHours.toFixed(1)}</strong></td><td class="numeric mono"><strong>${money(input.totalPay)}</strong></td></tr></tfoot>
        </table>`}
    </section>`
}

export function generateWorkbookPacketHtml(input: WorkbookPacketInput): string {
  const sectionHtml = input.sections.map(section => {
    if (section === 'schedule') return scheduleSection(input)
    if (section === 'intercom') return intercomSection(input)
    if (section === 'callSheets') return callSheetSection(input)
    return paySection(input)
  }).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${esc(input.workbook.name)} — Workbook Packet</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; color: #111827; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #eef2f7; }
  .packet-page { width: 11in; min-height: 8.5in; margin: 18px auto; padding: .38in; background: white; page-break-after: always; }
  .packet-page:last-child { page-break-after: auto; }
  .page-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; border-bottom: 3px solid #111827; padding-bottom: 10px; margin-bottom: 16px; }
  .eyebrow { margin: 0 0 3px; color: #2563eb; font-size: 8px; font-weight: 800; letter-spacing: .13em; text-transform: uppercase; }
  h1 { margin: 0; font-size: 22px; line-height: 1.05; }
  h2 { margin: 16px 0 6px; font-size: 12px; }
  .meta, .head-note { margin: 4px 0 0; color: #64748b; font-size: 9px; }
  .head-note { max-width: 42%; text-align: right; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th { padding: 6px 7px; border: 1px solid #d1d5db; background: #e5e7eb; color: #374151; font-size: 7.5px; letter-spacing: .035em; text-align: left; text-transform: uppercase; }
  td { padding: 6px 7px; border: 1px solid #e5e7eb; font-size: 8.5px; vertical-align: top; }
  tr { break-inside: avoid; }
  .day-block { break-inside: avoid; }
  .time-col { width: .82in; }
  .location-col { width: 1.15in; }
  .assignment-list { margin-top: 3px; color: #475569; font-size: 7.5px; }
  .muted { color: #9ca3af; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-variant-numeric: tabular-nums; }
  .center { text-align: center; vertical-align: middle; }
  .numeric { text-align: right; }
  .empty { padding: 80px 0; color: #94a3b8; font-size: 12px; text-align: center; }
  .legend { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 10px; }
  .inventory, .mode { display: inline-block; border-radius: 999px; padding: 3px 7px; background: #f1f5f9; color: #475569; font-size: 7.5px; font-weight: 700; }
  .inventory.over { background: #fee2e2; color: #b91c1c; }
  .mode.momentary { background: #dbeafe; color: #1d4ed8; }
  .mode.latch { background: #ede9fe; color: #6d28d9; }
  .intercom-table th { padding: 5px 3px; text-align: center; overflow-wrap: anywhere; }
  .intercom-table td { padding: 5px 4px; }
  .intercom-table .number-col { width: .3in; }
  .intercom-table .crew-col { width: 1.45in; text-align: left; }
  .intercom-table .role-col { width: 1.55in; text-align: left; }
  .intercom-table .pack-col { width: .8in; text-align: left; }
  .intercom-table .total-col { width: .45in; }
  .mode-cell { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 4px; font-size: 8px; font-weight: 900; }
  .mode-cell.momentary { background: #dbeafe; color: #1d4ed8; }
  .mode-cell.latch { background: #ede9fe; color: #6d28d9; }
  .notice { margin: 0 0 14px; padding: 9px 11px; border: 1px solid #e5e7eb; border-radius: 7px; background: #f8fafc; color: #64748b; font-size: 8.5px; }
  .pay-table { max-width: 6.8in; }
  .pay-table tfoot td { border-top: 2px solid #111827; font-size: 10px; }
  .footnote { margin-top: 10px; color: #9ca3af; font-size: 8px; }
  @media print {
    @page { size: letter landscape; margin: 0; }
    body { background: white; }
    .packet-page { margin: 0; }
  }
</style>
</head>
<body>${sectionHtml}</body>
</html>`
}
