const GOAL_9AM  = 88
const GOAL_11AM = 94

function thStyle(): string {
  return `background:#f9fafb;font-size:9px;font-weight:700;text-transform:uppercase;
    letter-spacing:.08em;color:#9ca3af;text-align:left;padding:6px 10px;border:1px solid #e5e7eb;`
}

function tdStyle(even = false): string {
  return `padding:6px 10px;border:1px solid #f3f4f6;color:#374151;font-size:10.5px;${even ? 'background:#fafafa;' : ''}`
}

function sectionTitle(text: string): string {
  return `<div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.13em;
    color:#6b7280;padding-bottom:6px;border-bottom:1px solid #e5e7eb;margin-bottom:10px;">${text}</div>`
}

function kpiCard(value: string, label: string, sub?: string): string {
  return `<div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;text-align:center;">
    <div style="font-size:24px;font-weight:800;color:#111827;letter-spacing:-.02em;line-height:1;">${value}</div>
    <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#9ca3af;margin-top:5px;">${label}</div>
    ${sub ? `<div style="font-size:9px;color:#d1d5db;margin-top:3px;">${sub}</div>` : ''}
  </div>`
}

function formatGeneratedAt(): string {
  return new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) + ' CT'
}

function avg(vals: number[]): number | null {
  const valid = vals.filter(v => v !== null && v !== undefined && !isNaN(v))
  if (!valid.length) return null
  return Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 10) / 10
}

export interface LoudnessRow {
  date: string          // YYYY-MM-DD
  service_1_max_db: number | null
  service_1_laeq:   number | null
  service_2_max_db: number | null
  service_2_laeq:   number | null
}

export function generateLoudnessReportHtml(rows: LoudnessRow[], logoBase64?: string): string {
  // Sort ascending by date
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date))

  // Overall stats
  const all9LAeq  = sorted.map(r => r.service_1_laeq).filter((v): v is number => v !== null)
  const all11LAeq = sorted.map(r => r.service_2_laeq).filter((v): v is number => v !== null)
  const avg9  = avg(all9LAeq)
  const avg11 = avg(all11LAeq)
  const over9Count  = all9LAeq.filter(v => v > GOAL_9AM).length
  const over11Count = all11LAeq.filter(v => v > GOAL_11AM).length

  // Group by year
  const byYear: Record<string, LoudnessRow[]> = {}
  for (const r of sorted) {
    const yr = r.date.slice(0, 4)
    if (!byYear[yr]) byYear[yr] = []
    byYear[yr].push(r)
  }

  function formatDate(iso: string): string {
    return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    })
  }

  function valCell(val: number | null, goal: number, even: boolean): string {
    const over = val !== null && val > goal
    const color = over ? '#dc2626' : '#374151'
    const flag  = over ? ' !' : ''
    return `<td style="${tdStyle(even)}font-family:monospace;color:${color};font-weight:${over ? '700' : '400'};">${val !== null ? val + flag : '—'}</td>`
  }

  // Build year sections
  const yearSections = Object.entries(byYear).map(([year, yearRows]) => {
    const y9LAeq  = yearRows.map(r => r.service_1_laeq).filter((v): v is number => v !== null)
    const y11LAeq = yearRows.map(r => r.service_2_laeq).filter((v): v is number => v !== null)
    const yAvg9   = avg(y9LAeq)
    const yAvg11  = avg(y11LAeq)

    const dataRows = yearRows.map((r, i) => {
      const even = i % 2 === 1
      return `<tr>
        <td style="${tdStyle(even)}">${formatDate(r.date)}</td>
        ${valCell(r.service_1_max_db, 999, even)}
        ${valCell(r.service_1_laeq,   GOAL_9AM,  even)}
        ${valCell(r.service_2_max_db, 999, even)}
        ${valCell(r.service_2_laeq,   GOAL_11AM, even)}
      </tr>`
    }).join('')

    const avgRow = `<tr>
      <td style="padding:6px 10px;border:1px solid #e5e7eb;font-size:9px;font-weight:700;
        text-transform:uppercase;letter-spacing:.06em;color:#9ca3af;background:#f9fafb;">
        ${year} Average
      </td>
      <td style="padding:6px 10px;border:1px solid #e5e7eb;background:#f9fafb;"></td>
      <td style="padding:6px 10px;border:1px solid #e5e7eb;font-family:monospace;font-size:10.5px;
        font-weight:700;background:#f9fafb;color:${yAvg9 !== null && yAvg9 > GOAL_9AM ? '#dc2626' : '#374151'};">
        ${yAvg9 ?? '—'}
      </td>
      <td style="padding:6px 10px;border:1px solid #e5e7eb;background:#f9fafb;"></td>
      <td style="padding:6px 10px;border:1px solid #e5e7eb;font-family:monospace;font-size:10.5px;
        font-weight:700;background:#f9fafb;color:${yAvg11 !== null && yAvg11 > GOAL_11AM ? '#dc2626' : '#374151'};">
        ${yAvg11 ?? '—'}
      </td>
    </tr>`

    return `
      <div style="margin-bottom:24px;">
        ${sectionTitle(year + ' — ' + yearRows.length + ' Sunday' + (yearRows.length !== 1 ? 's' : ''))}
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr>
            <th style="${thStyle()}">Date</th>
            <th style="${thStyle()}text-align:right;">9am Max dB A</th>
            <th style="${thStyle()}text-align:right;">9am LAeq 15</th>
            <th style="${thStyle()}text-align:right;">11am Max dB A</th>
            <th style="${thStyle()}text-align:right;">11am LAeq 15</th>
          </tr></thead>
          <tbody>
            ${dataRows}
            ${avgRow}
          </tbody>
        </table>
      </div>`
  }).join('')

  const generatedDate = new Date().toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>BFC Loudness Log — Historical Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body {
      font-family: Inter, "Segoe UI", sans-serif;
      background: #f3f4f6;
      padding: 32px 20px 60px;
    }
    .page {
      width: 816px;
      background: #fff;
      margin: 0 auto 40px;
      box-shadow: 0 8px 40px rgba(0,0,0,.22);
    }
    @media print {
      body { background: #fff; padding: 0; }
      .page { box-shadow: none; margin: 0; width: 100%; }
    }
  </style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div style="background:#1a1a1a;padding:28px 40px 22px;display:flex;align-items:flex-start;justify-content:space-between;">
    <div>
      ${logoBase64
        ? `<img src="${logoBase64}" style="height:28px;width:auto;display:block;" alt="BFC Production" />`
        : `<div style="color:#fff;font-size:17px;font-weight:700;letter-spacing:.02em;">BFC Production</div>`
      }
      <div style="color:#9ca3af;font-size:10px;margin-top:5px;">Bethany First Church · Sunday Ops</div>
    </div>
    <div style="text-align:right;">
      <div style="color:#fff;font-size:20px;font-weight:800;letter-spacing:-.01em;">Loudness Log — Historical Report</div>
      <div style="color:#9ca3af;font-size:10px;margin-top:4px;">Generated ${generatedDate} · ${formatGeneratedAt()}</div>
    </div>
  </div>
  <div style="height:4px;background:linear-gradient(90deg,#2563eb 0%,#10b981 100%);"></div>

  <!-- Body -->
  <div style="padding:28px 40px;">

    <!-- KPI row -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:28px;">
      ${kpiCard(String(sorted.length), 'Sundays Logged', Object.keys(byYear).join(' – '))}
      ${kpiCard(avg9 !== null ? String(avg9) : '—', '9am Avg LAeq 15', `goal ≤ ${GOAL_9AM}`)}
      ${kpiCard(avg11 !== null ? String(avg11) : '—', '11am Avg LAeq 15', `goal ≤ ${GOAL_11AM}`)}
      ${kpiCard(String(over9Count + over11Count), 'Goal Exceedances', `${over9Count} at 9am · ${over11Count} at 11am`)}
    </div>

    <!-- Goals legend -->
    <div style="display:flex;gap:16px;margin-bottom:22px;font-size:9.5px;color:#6b7280;">
      <span>9am LAeq 15 goal: <strong>≤ ${GOAL_9AM} dB</strong></span>
      <span>11am LAeq 15 goal: <strong>≤ ${GOAL_11AM} dB</strong></span>
      <span style="color:#dc2626;font-weight:600;">Values marked ! exceed goal</span>
    </div>

    <!-- Year sections -->
    ${yearSections}

  </div>

  <!-- Footer -->
  <div style="border-top:1px solid #e5e7eb;padding:12px 40px;display:flex;
    align-items:center;justify-content:space-between;">
    <span style="font-size:8.5px;color:#9ca3af;">BFC Sunday Ops · bethanynaz.org · Confidential — internal use only</span>
    <span style="font-size:8.5px;color:#9ca3af;">${sorted.length} records · ${Object.keys(byYear).length} years</span>
  </div>

</div>
</body>
</html>`
}
