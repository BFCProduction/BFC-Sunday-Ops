import type { CallSheetPerson } from './generateCallSheetHtml'
import type { PayLine } from './generatePayReportHtml'
import type { Department, IntercomChannelState, Workbook, WorkbookIntercomChannel, WorkbookSupplyItem } from '../types'
import type { WorkbookScheduleExportRow } from './generateWorkbookScheduleHtml'
import { INPUT_LIST_CONNECTION_TYPES } from './inputListConnectionTypes'
import type { InputListPrintDocument, InputListPrintRow, InputListPrintSection } from './inputLists'

export type WorkbookPrintSection = 'schedule' | 'inputLists' | 'supplies' | 'intercom' | 'callSheets' | 'crewPay'

export interface IntercomPrintRow {
  name: string
  roles: string[]
  packType: string | null
  channelStates: Record<string, IntercomChannelState>
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
  inputListDocuments: InputListPrintDocument[]
  supplies: WorkbookSupplyItem[]
  includeSupplyCosts: boolean
  departments: Department[]
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

function quantity(value: number) {
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function printableLink(value: string | null) {
  if (!value || !/^https?:\/\//i.test(value)) return null
  try {
    return { url: value, label: new URL(value).hostname.replace(/^www\./, '') }
  } catch {
    return null
  }
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
        <div class="legend">${inventory}<span class="mode momentary">M · Momentary</span><span class="mode latch">L · Latch</span><span class="mode latch-momentary">LM · Latch/Momentary</span><span class="mode listen">Listen</span><span class="mode listen-on-talk">Listen on Talk</span><span class="mode program-feed">☑ Program feed</span></div>
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
                  const state = row.packType ? row.channelStates[channel.id] : null
                  if (channel.is_program) {
                    return `<td class="center"><span class="program-checkbox">${state?.program_enabled ? '☑' : '☐'}</span></td>`
                  }
                  const talkLabel = state?.talk_mode === 'momentary'
                    ? 'M'
                    : state?.talk_mode === 'latch'
                      ? 'L'
                      : state?.talk_mode === 'latch_momentary'
                        ? 'LM'
                        : ''
                  const listenLabel = state?.listen_mode === 'listen'
                    ? 'Listen'
                    : state?.listen_mode === 'listen_on_talk'
                      ? 'On Talk'
                      : ''
                  return `<td class="center"><div class="channel-state-cell">${talkLabel ? `<span class="mode-cell ${state?.talk_mode}">${talkLabel}</span>` : ''}${listenLabel ? `<span class="listen-cell ${state?.listen_mode}">${listenLabel}</span>` : ''}</div></td>`
                }).join('')}
                <td class="center mono"><strong>${row.packType ? Object.values(row.channelStates).filter(state => state.talk_mode || state.listen_mode || state.program_enabled).length : 0}</strong></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </section>`
  }).join('')
}

function splitInputListRows(rows: InputListPrintRow[]): [InputListPrintRow[], InputListPrintRow[]] {
  if (rows.length < 2) return [rows, []]

  const groups: InputListPrintRow[][] = []
  for (const row of rows) {
    const current = groups[groups.length - 1]
    if (current?.[0]?.groupKey === row.groupKey) current.push(row)
    else groups.push([row])
  }
  if (groups.length < 2) return [rows, []]

  const midpoint = rows.length / 2
  let cumulative = 0
  let bestGroupCount = 1
  let bestDifference = Number.POSITIVE_INFINITY
  for (let index = 0; index < groups.length - 1; index++) {
    cumulative += groups[index].length
    const difference = Math.abs(midpoint - cumulative)
    if (difference <= bestDifference) {
      bestDifference = difference
      bestGroupCount = index + 1
    }
  }

  return [
    groups.slice(0, bestGroupCount).flat(),
    groups.slice(bestGroupCount).flat(),
  ]
}

function inputListTable(section: InputListPrintSection, rows: InputListPrintRow[]) {
  return `<table class="input-list-table">
    <thead>
      <tr>
        ${section.columns.map(column => `<th>${esc(column)}</th>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${rows.map((row, index) => {
        const isGroupStart = index === 0 || rows[index - 1].groupKey !== row.groupKey
        let groupRowSpan = 1
        if (isGroupStart) {
          while (index + groupRowSpan < rows.length && rows[index + groupRowSpan].groupKey === row.groupKey) {
            groupRowSpan += 1
          }
        }
        return `
          <tr class="input-list-row input-list-type-${row.connectionType.replaceAll('_', '-')} ${index > 0 && isGroupStart ? 'input-list-group-start' : ''}">
            ${row.values.map((value, columnIndex) => {
              if (columnIndex === section.groupColumnIndex && !isGroupStart) return ''
              if (columnIndex === section.groupColumnIndex && groupRowSpan > 1) {
                return isGroupStart
                  ? `<td class="input-list-group-cell" rowspan="${groupRowSpan}">${value ? esc(value) : '<span class="muted">—</span>'}</td>`
                  : ''
              }
              return `<td>${value ? esc(value) : '<span class="muted">—</span>'}</td>`
            }).join('')}
          </tr>`
      }).join('')}
    </tbody>
  </table>`
}

function inputListLegend(document: InputListPrintDocument) {
  const usedTypes = new Set(document.sections.flatMap(section => section.rows.map(row => row.connectionType)))
  return `<div class="input-list-legend">
    <span class="input-list-legend-title">Connection colors</span>
    ${INPUT_LIST_CONNECTION_TYPES
      .filter(option => usedTypes.has(option.key))
      .map(option => `
        <span class="input-list-legend-item">
          <span class="input-list-swatch input-list-swatch-${option.key.replaceAll('_', '-')}"></span>
          ${esc(option.label)}
        </span>`)
      .join('')}
  </div>`
}

function inputListsSection(input: WorkbookPacketInput) {
  if (input.inputListDocuments.length === 0) {
    return `<section class="packet-page">${packetHeader('Input Lists', input.workbook)}<p class="empty">No room input lists are configured for this workbook.</p></section>`
  }

  return input.inputListDocuments.map(document => `
    <section class="packet-page input-list-page">
      ${packetHeader('Input List', input.workbook, document.locationName)}
      ${inputListLegend(document)}
      ${document.sections.map(section => `
        <section class="input-list-block">
          <h2>${esc(section.name)}</h2>
          ${section.rows.length === 0 || section.columns.length === 0
            ? '<p class="input-list-empty">No configured connections.</p>'
            : (() => {
                const [leftRows, rightRows] = splitInputListRows(section.rows)
                return rightRows.length
                  ? `<div class="input-list-table-pair">
                      ${inputListTable(section, leftRows)}
                      ${inputListTable(section, rightRows)}
                    </div>`
                  : inputListTable(section, leftRows)
              })()}
        </section>`).join('')}
    </section>`).join('')
}

function suppliesSection(input: WorkbookPacketInput) {
  const departmentById = new Map(input.departments.map(department => [department.id, department.name]))
  const total = input.supplies.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)
  return `
    <section class="packet-page">
      ${packetHeader('Supplies Shopping List', input.workbook)}
      ${input.supplies.length === 0 ? '<p class="empty">No supply items have been added.</p>' : `
        <table class="supplies-table">
          <thead>
            <tr><th class="number-col">#</th><th>Item</th><th class="description-col">Description</th><th class="quantity-col numeric">Qty</th>${input.includeSupplyCosts ? '<th class="price-col numeric">Price</th>' : ''}<th class="department-col">Department</th><th class="link-col">Link</th>${input.includeSupplyCosts ? '<th class="price-col numeric">Total</th>' : ''}</tr>
          </thead>
          <tbody>
            ${input.supplies.map((item, index) => {
              const link = printableLink(item.purchase_url)
              return `<tr>
                <td class="center mono">${index + 1}</td>
                <td><strong>${esc(item.item_name)}</strong></td>
                <td>${item.description ? esc(item.description) : '<span class="muted">—</span>'}</td>
                <td class="numeric mono">${quantity(item.quantity)}</td>
                ${input.includeSupplyCosts ? `<td class="numeric mono">${money(item.unit_price)}</td>` : ''}
                <td>${item.department_id ? esc(departmentById.get(item.department_id) ?? 'Unknown') : '<span class="muted">—</span>'}</td>
                <td>${link ? `<a href="${esc(link.url)}">${esc(link.label)}</a>` : '<span class="muted">—</span>'}</td>
                ${input.includeSupplyCosts ? `<td class="numeric mono"><strong>${money(item.quantity * item.unit_price)}</strong></td>` : ''}
              </tr>`
            }).join('')}
          </tbody>
          ${input.includeSupplyCosts ? `<tfoot><tr><td colspan="7"><strong>Estimated total</strong></td><td class="numeric mono"><strong>${money(total)}</strong></td></tr></tfoot>` : ''}
        </table>`}
    </section>`
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
    if (section === 'inputLists') return inputListsSection(input)
    if (section === 'supplies') return suppliesSection(input)
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
  body { margin: 0; color: #111827; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #eef2f7; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .packet-page { width: 8.5in; min-height: 11in; margin: 18px auto; padding: .38in; background: white; page-break-after: always; }
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
  .mode.latch-momentary { background: #d1fae5; color: #047857; }
  .mode.listen { background: #cffafe; color: #0e7490; }
  .mode.listen-on-talk { background: #ffedd5; color: #c2410c; }
  .mode.program-feed { background: #fef3c7; color: #b45309; }
  .intercom-table th { padding: 5px 3px; text-align: center; overflow-wrap: anywhere; }
  .intercom-table td { padding: 5px 4px; }
  .intercom-table .number-col { width: .3in; }
  .intercom-table .crew-col { width: 1.45in; text-align: left; }
  .intercom-table .role-col { width: 1.55in; text-align: left; }
  .intercom-table .pack-col { width: .8in; text-align: left; }
  .intercom-table .total-col { width: .45in; }
  .input-list-block { margin-bottom: 10px; }
  .input-list-block h2 { margin-top: 0; padding: 5px 7px; background: #f1f5f9; }
  .input-list-table-pair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .1in; align-items: start; }
  .input-list-table { table-layout: auto; }
  .input-list-table thead { display: table-header-group; }
  .input-list-table th { padding: 2.5px; font-size: 7px; line-height: 1.15; letter-spacing: .025em; white-space: normal; overflow-wrap: normal; word-break: normal; hyphens: none; }
  .input-list-table td { padding: 2px 2.25px; font-size: 7.75px; line-height: 1.1; white-space: nowrap; }
  .input-list-table .input-list-group-cell { width: .58in; border-right: 2px solid #94a3b8; background: #fff; color: #1f2937; font-weight: 800; text-align: center; vertical-align: middle; }
  .input-list-type-audio-input td:not(.input-list-group-cell) { background: #fff; }
  .input-list-type-audio-output td:not(.input-list-group-cell) { background: #ccc; }
  .input-list-type-monitor-output td:not(.input-list-group-cell) { background: #efefef; }
  .input-list-type-network td:not(.input-list-group-cell) { background: #b7b7b7; }
  .input-list-type-fiber td:not(.input-list-group-cell) { background: #ff0; }
  .input-list-type-bnc td:not(.input-list-group-cell) { background: #999; }
  .input-list-table .input-list-group-start td { border-top: 2px solid #9ca3af; }
  .input-list-legend { display: flex; flex-wrap: wrap; align-items: center; gap: 5px 10px; margin: -4px 0 12px; }
  .input-list-legend-title { color: #64748b; font-size: 7px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
  .input-list-legend-item { display: inline-flex; align-items: center; gap: 4px; color: #475569; font-size: 8px; font-weight: 700; }
  .input-list-swatch { width: 10px; height: 10px; border: 1px solid #cbd5e1; border-radius: 2px; }
  .input-list-swatch-audio-input { background: #fff; }
  .input-list-swatch-audio-output { background: #ccc; }
  .input-list-swatch-monitor-output { background: #efefef; }
  .input-list-swatch-network { background: #b7b7b7; }
  .input-list-swatch-fiber { background: #ff0; }
  .input-list-swatch-bnc { background: #999; }
  .input-list-empty { margin: 0; padding: 10px; color: #94a3b8; font-size: 10px; }
  .supplies-table .number-col { width: .3in; }
  .supplies-table .description-col { width: 2.2in; }
  .supplies-table .quantity-col { width: .55in; }
  .supplies-table .price-col { width: .75in; }
  .supplies-table .department-col { width: 1.05in; }
  .supplies-table .link-col { width: 1.05in; }
  .supplies-table a { color: #2563eb; text-decoration: none; }
  .supplies-table tfoot td { border-top: 2px solid #111827; font-size: 9.5px; }
  .channel-state-cell { display: flex; flex-direction: column; align-items: center; gap: 2px; }
  .mode-cell { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; padding: 0 3px; border-radius: 4px; font-size: 8px; font-weight: 900; }
  .mode-cell.momentary { background: #dbeafe; color: #1d4ed8; }
  .mode-cell.latch { background: #ede9fe; color: #6d28d9; }
  .mode-cell.latch_momentary { background: #d1fae5; color: #047857; }
  .listen-cell { display: inline-flex; align-items: center; justify-content: center; border-radius: 4px; padding: 2px 4px; font-size: 6.5px; font-weight: 800; }
  .listen-cell.listen { background: #cffafe; color: #0e7490; }
  .listen-cell.listen_on_talk { background: #ffedd5; color: #c2410c; }
  .program-checkbox { color: #b45309; font-size: 14px; font-weight: 900; }
  .notice { margin: 0 0 14px; padding: 9px 11px; border: 1px solid #e5e7eb; border-radius: 7px; background: #f8fafc; color: #64748b; font-size: 8.5px; }
  .pay-table { max-width: 6.8in; }
  .pay-table tfoot td { border-top: 2px solid #111827; font-size: 10px; }
  .footnote { margin-top: 10px; color: #9ca3af; font-size: 8px; }
  @media print {
    @page { size: letter portrait; margin: .38in; }
    body { background: white; }
    .packet-page { width: auto; min-height: auto; margin: 0; padding: 0; }
  }
</style>
</head>
<body>${sectionHtml}</body>
</html>`
}
