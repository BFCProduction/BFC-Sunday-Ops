// ─────────────────────────────────────────────────────────────────────────────
// generateCallSheetHtml.ts — printable per-person call sheets for a workbook.
// One section per crew member (page break between people), listing their call /
// release times, role, and event for each day.
// ─────────────────────────────────────────────────────────────────────────────

export interface CallSheetShift {
  date: string
  event: string | null
  role: string | null
  call: string | null
  release: string | null
}

export interface CallSheetPerson {
  name: string
  shifts: CallSheetShift[]
}

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function fmtDay(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function fmtTime(time: string | null): string {
  if (!time) return '—'
  const [hour, minute] = time.slice(0, 5).split(':').map(Number)
  if (Number.isNaN(hour)) return time
  const suffix = hour >= 12 ? 'PM' : 'AM'
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${suffix}`
}

export function generateCallSheetHtml(workbookName: string, dateRange: string, people: CallSheetPerson[]): string {
  const sections = people.map(person => {
    const rows = person.shifts.map(shift => `
      <tr>
        <td>${esc(fmtDay(shift.date))}</td>
        <td>${shift.event ? esc(shift.event) : '<span class="muted">—</span>'}</td>
        <td>${shift.role ? esc(shift.role) : '<span class="muted">—</span>'}</td>
        <td class="mono">${fmtTime(shift.call)}</td>
        <td class="mono">${fmtTime(shift.release)}</td>
      </tr>`).join('')
    return `
    <section class="sheet">
      <div class="sheet-head">
        <h2>${esc(person.name)}</h2>
        <p class="sub">${esc(workbookName)} · ${esc(dateRange)}</p>
      </div>
      <table>
        <thead>
          <tr><th>Day</th><th>Event</th><th>Role</th><th>Call</th><th>Release</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="foot">Times come from the workbook crew roster. Check with your production lead if anything looks off.</p>
    </section>`
  }).join('')

  const body = people.length === 0
    ? '<p class="empty">No crew with call times to build sheets from yet.</p>'
    : sections

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Call Sheets — ${esc(workbookName)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #111827; margin: 0; padding: 32px; }
  .sheet { max-width: 720px; margin: 0 auto 40px; page-break-after: always; }
  .sheet:last-child { page-break-after: auto; }
  .sheet-head { border-bottom: 2px solid #111827; padding-bottom: 10px; margin-bottom: 16px; }
  h2 { font-size: 26px; margin: 0; }
  .sub { color: #6b7280; font-size: 13px; margin: 4px 0 0; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; border-bottom: 1px solid #e5e7eb; padding: 8px 10px; }
  td { font-size: 14px; padding: 10px; border-bottom: 1px solid #f3f4f6; }
  .mono { font-variant-numeric: tabular-nums; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .muted { color: #9ca3af; }
  .foot { color: #9ca3af; font-size: 11px; margin-top: 14px; }
  .empty { text-align: center; color: #6b7280; padding: 60px 0; }
  @media print { body { padding: 0; } .sheet { margin: 0 auto; padding: 24px; } }
</style>
</head>
<body>${body}</body>
</html>`
}
