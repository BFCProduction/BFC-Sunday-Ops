// ─────────────────────────────────────────────────────────────────────────────
// generatePayReportHtml.ts — printable crew-pay report for the business office.
// Admin-only. A per-person payroll list (hours + pay) across the workbook.
// ─────────────────────────────────────────────────────────────────────────────

export interface PayLine {
  name:  string
  hours: number
  pay:   number
}

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function money(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

export function generatePayReportHtml(
  workbookName: string,
  dateRange: string,
  lines: PayLine[],
  totalHours: number,
  totalPay: number,
): string {
  const generatedAt = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })

  const rows = lines.map(line => `
    <tr>
      <td>${esc(line.name)}</td>
      <td class="num">${line.hours.toFixed(1)}</td>
      <td class="num">${money(line.pay)}</td>
    </tr>`).join('')

  const body = lines.length === 0
    ? '<p class="empty">No paid crew hours to report yet.</p>'
    : `
    <table>
      <thead>
        <tr><th>Crew member</th><th class="num">Hours</th><th class="num">Pay</th></tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr class="total">
          <td><strong>Total</strong></td>
          <td class="num"><strong>${totalHours.toFixed(1)}</strong></td>
          <td class="num"><strong>${money(totalPay)}</strong></td>
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
  .wrap { max-width: 640px; margin: 0 auto; }
  .head { border-bottom: 2px solid #111827; padding-bottom: 12px; margin-bottom: 20px; }
  h1 { font-size: 24px; margin: 0; }
  .sub { color: #6b7280; font-size: 13px; margin: 4px 0 0; }
  .note { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 12px; font-size: 12px; color: #6b7280; margin-bottom: 18px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; border-bottom: 1px solid #e5e7eb; padding: 8px 10px; }
  td { font-size: 14px; padding: 9px 10px; border-bottom: 1px solid #f3f4f6; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  tfoot .total td { border-top: 2px solid #111827; border-bottom: none; font-size: 15px; padding-top: 12px; }
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
    <div class="note">Paid crew only. Hours are each person's call-to-release time per event, summed across the workbook, rounded to the nearest half hour. Confirm against actuals before processing payroll.</div>
    ${body}
  </div>
</body>
</html>`
}
