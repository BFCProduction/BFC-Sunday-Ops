// ─────────────────────────────────────────────────────────────────────────────
// generatePayReportHtml.ts — printable crew-pay report for the business office.
// Admin-only; fed by the workbook-pay Edge Function.
// ─────────────────────────────────────────────────────────────────────────────
import type { WorkbookPay } from './adminApi'

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function money(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function fmtDay(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function fmtTime(time: string): string {
  const [hour, minute] = time.slice(0, 5).split(':').map(Number)
  if (Number.isNaN(hour)) return time
  const suffix = hour >= 12 ? 'PM' : 'AM'
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${suffix}`
}

export function generatePayReportHtml(workbookName: string, dateRange: string, pay: WorkbookPay): string {
  const generatedAt = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })

  const peopleRows = pay.people.map(person => {
    const dayRows = person.days.map(day => `
      <tr class="day">
        <td>${esc(fmtDay(day.date))}</td>
        <td class="mono">${fmtTime(day.call)}–${fmtTime(day.release)}</td>
        <td class="num">${day.hours.toFixed(1)}</td>
        <td class="num">${money(day.rate)}</td>
        <td class="num">${money(day.pay)}</td>
      </tr>`).join('')
    return `
      <tbody class="person">
        <tr class="person-head">
          <td colspan="2"><strong>${esc(person.name)}</strong></td>
          <td class="num">${person.hours.toFixed(1)} hrs</td>
          <td></td>
          <td class="num"><strong>${money(person.pay)}</strong></td>
        </tr>
        ${dayRows}
      </tbody>`
  }).join('')

  const body = pay.people.length === 0
    ? '<p class="empty">No paid crew hours to report yet.</p>'
    : `
    <table>
      <thead>
        <tr><th>Day</th><th>Call – Release</th><th class="num">Hours</th><th class="num">Rate</th><th class="num">Pay</th></tr>
      </thead>
      ${peopleRows}
      <tfoot>
        <tr class="total">
          <td colspan="2"><strong>Total</strong></td>
          <td class="num"><strong>${pay.total_hours.toFixed(1)} hrs</strong></td>
          <td></td>
          <td class="num"><strong>${money(pay.total_pay)}</strong></td>
        </tr>
      </tfoot>
    </table>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Crew Pay — ${esc(workbookName)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #111827; margin: 0; padding: 40px; }
  .wrap { max-width: 780px; margin: 0 auto; }
  .head { border-bottom: 2px solid #111827; padding-bottom: 12px; margin-bottom: 20px; }
  h1 { font-size: 24px; margin: 0; }
  .sub { color: #6b7280; font-size: 13px; margin: 4px 0 0; }
  .note { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 12px; font-size: 12px; color: #6b7280; margin-bottom: 18px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; border-bottom: 1px solid #e5e7eb; padding: 8px 10px; }
  td { font-size: 13px; padding: 7px 10px; }
  .person { border-top: 1px solid #e5e7eb; }
  .person-head td { padding-top: 12px; }
  .day td { color: #4b5563; }
  .day td:first-child { padding-left: 24px; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  tfoot .total td { border-top: 2px solid #111827; font-size: 15px; padding-top: 12px; }
  .empty { text-align: center; color: #6b7280; padding: 60px 0; }
  @media print { body { padding: 0; } .wrap { padding: 24px; } }
</style>
</head>
<body>
  <div class="wrap">
    <div class="head">
      <h1>Crew Pay — ${esc(workbookName)}</h1>
      <p class="sub">${esc(dateRange)} · generated ${esc(generatedAt)}</p>
    </div>
    <div class="note">Paid crew only. Hours are each person's on-clock span per day (first call to last release, gaps included), rounded to the nearest half hour. Confirm against actuals before processing payroll.</div>
    ${body}
  </div>
</body>
</html>`
}
