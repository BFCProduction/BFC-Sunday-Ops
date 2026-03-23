import type { ReportData } from './reportData'

const FEEL_LABELS: Record<string, string> = {
  excellent:           'Excellent',
  solid:               'Solid',
  rough_spots:         'Had some rough spots',
  significant_issues:  'Significant issues',
}

const FEEL_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  excellent:           { bg: '#ecfdf5', color: '#065f46', border: '#6ee7b7' },
  solid:               { bg: '#eff6ff', color: '#1e40af', border: '#93c5fd' },
  rough_spots:         { bg: '#fffbeb', color: '#92400e', border: '#fcd34d' },
  significant_issues:  { bg: '#fef2f2', color: '#991b1b', border: '#fca5a5' },
}

const SEV_COLORS: Record<string, string> = {
  Low:      '#22c55e',
  Medium:   '#f59e0b',
  High:     '#ef4444',
  Critical: '#dc2626',
}

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function feelPill(feel: string | null): string {
  if (!feel) return ''
  const c = FEEL_COLORS[feel] || { bg: '#f3f4f6', color: '#374151', border: '#d1d5db' }
  const label = FEEL_LABELS[feel] || feel
  return `<span style="display:inline-block;padding:3px 9px;border-radius:20px;font-size:9px;font-weight:700;
    background:${c.bg};color:${c.color};border:1px solid ${c.border};">${esc(label)}</span>`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function formatGeneratedAt(): string {
  return new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) + ' CT'
}

// ── Section heading ───────────────────────────────────────────────────────────
function sectionTitle(text: string): string {
  return `<div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.13em;
    color:#6b7280;padding-bottom:6px;border-bottom:1px solid #e5e7eb;margin-bottom:10px;">${esc(text)}</div>`
}

// ── Attendance ────────────────────────────────────────────────────────────────
function buildAttendance(data: ReportData): string {
  const { attendance } = data
  if (!attendance) {
    return `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:10px 12px;
      font-size:10px;color:#9ca3af;">Attendance not recorded for this Sunday.</div>`
  }
  const s1 = attendance.service_1_count ?? '—'
  const s2 = attendance.service_2_count ?? '—'
  const total =
    (attendance.service_1_count ?? 0) + (attendance.service_2_count ?? 0) || '—'
  const noteRow = attendance.notes
    ? `<tr><td colspan="4" style="padding:7px 10px;border:1px solid #f3f4f6;font-size:10px;color:#6b7280;
        font-style:italic;">Note: ${esc(attendance.notes)}</td></tr>`
    : ''
  return `<table style="width:100%;border-collapse:collapse;font-size:11px;">
    <thead><tr>
      <th style="${thStyle()}">Service</th>
      <th style="${thStyle()}">Count</th>
    </tr></thead>
    <tbody>
      <tr><td style="${tdStyle()}">9:00 AM</td><td style="${tdStyle()}">${s1}</td></tr>
      <tr><td style="${tdStyle(true)}">11:00 AM</td><td style="${tdStyle(true)}">${s2}</td></tr>
      <tr><td style="${tdStyle()} ${totalTdExtra()}">Total</td>
          <td style="${tdStyle()} ${totalTdExtra()}">${total}</td></tr>
      ${noteRow}
    </tbody>
  </table>`
}

// ── Runtimes ──────────────────────────────────────────────────────────────────
function buildRuntimes(data: ReportData): string {
  const { runtimes } = data
  if (runtimes.length === 0) {
    return `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:10px 12px;
      font-size:10px;color:#9ca3af;">No runtime fields configured.</div>`
  }
  const rows = runtimes.map((r, i) => {
    const even = i % 2 === 1
    return `<tr>
      <td style="${tdStyle(even)}">${esc(r.label)}</td>
      <td style="${tdStyle(even)} font-family:monospace;">${r.value ? esc(r.value) : '<span style="color:#9ca3af;">—</span>'}</td>
    </tr>`
  }).join('')
  return `<table style="width:100%;border-collapse:collapse;font-size:11px;">
    <thead><tr>
      <th style="${thStyle()}">Field</th>
      <th style="${thStyle()}">Value</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`
}

// ── Issues ────────────────────────────────────────────────────────────────────
function buildIssues(data: ReportData): string {
  const { issues } = data
  if (issues.length === 0) {
    return `<div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:6px;padding:10px 12px;
      font-size:10px;color:#065f46;font-weight:600;">✓ No issues logged for this Sunday.</div>`
  }
  const rows = issues.map((issue, i) => {
    const even = i % 2 === 1
    const color = SEV_COLORS[issue.severity] || '#9ca3af'
    return `<tr>
      <td style="${tdStyle(even)}">
        <span style="display:inline-flex;align-items:center;gap:5px;">
          <span style="width:7px;height:7px;border-radius:50%;background:${color};display:inline-block;flex-shrink:0;"></span>
          ${esc(issue.severity)}
        </span>
      </td>
      <td style="${tdStyle(even)};font-weight:600;">${esc(issue.title)}</td>
      <td style="${tdStyle(even)};color:#6b7280;font-size:10px;">${esc(issue.description || '')}</td>
    </tr>`
  }).join('')
  return `<table style="width:100%;border-collapse:collapse;font-size:11px;">
    <thead><tr>
      <th style="${thStyle()}">Severity</th>
      <th style="${thStyle()}">Issue</th>
      <th style="${thStyle()}">Details</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`
}

// ── Checklist exceptions ──────────────────────────────────────────────────────
function buildChecklistExceptions(data: ReportData): string {
  const { checklistExceptions, checklistTotalItems, checklistCompletedCount } = data

  if (checklistCompletedCount === 0) {
    return `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:10px 12px;
      font-size:10px;color:#9ca3af;">Checklist not started — no items were checked off.</div>`
  }
  if (checklistExceptions.length === 0) {
    return `<div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:6px;padding:10px 12px;
      font-size:10px;color:#065f46;font-weight:600;">
      ✓ All ${checklistTotalItems} checklist items completed.
    </div>`
  }

  const displayed = checklistExceptions.slice(0, 30)
  const overflow = checklistExceptions.length > 30 ? checklistExceptions.length - 30 : 0

  const rows = displayed.map(item => `
    <div style="display:flex;align-items:flex-start;gap:8px;padding:7px 0;
      border-bottom:1px solid #f3f4f6;font-size:10.5px;">
      <span style="width:14px;height:14px;border-radius:3px;background:#fef2f2;
        border:1px solid #fca5a5;display:flex;align-items:center;justify-content:center;
        flex-shrink:0;margin-top:1px;font-size:9px;font-weight:700;color:#ef4444;">✕</span>
      <div>
        <span style="font-weight:600;color:#111827;">${esc(item.task)}</span>
        <span style="color:#9ca3af;font-size:10px;margin-left:6px;">${esc(item.section)}${item.subsection ? ' · ' + esc(item.subsection) : ''} · ${esc(item.role)}</span>
      </div>
    </div>`).join('')

  const overflowNote = overflow > 0
    ? `<div style="font-size:10px;color:#9ca3af;margin-top:6px;">…and ${overflow} more unchecked items.</div>`
    : ''

  return `<div style="font-size:10px;color:#6b7280;margin-bottom:8px;">
    ${checklistCompletedCount} of ${checklistTotalItems} items completed ·
    ${checklistExceptions.length} unchecked
  </div>
  <div>${rows}${overflowNote}</div>`
}

// ── Weather ───────────────────────────────────────────────────────────────────
function buildWeather(data: ReportData): string {
  const { weather } = data
  if (!weather) {
    return `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:10px 12px;
      font-size:10px;color:#9ca3af;">No weather data recorded for this Sunday.</div>`
  }
  const cells = [
    { l: 'Condition',    v: weather.condition ?? '—' },
    { l: 'Temperature',  v: weather.temp_f != null ? `${weather.temp_f}°F` : '—' },
    { l: 'Wind',         v: weather.wind_mph != null ? `${weather.wind_mph} mph` : '—' },
    { l: 'Humidity',     v: weather.humidity != null ? `${weather.humidity}%` : '—' },
  ]
  return `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">
    ${cells.map(c => `
      <div style="border:1px solid #e5e7eb;border-radius:6px;padding:9px 10px;">
        <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;">${esc(c.l)}</div>
        <div style="font-size:13px;font-weight:700;color:#111827;margin-top:3px;">${esc(c.v)}</div>
      </div>`).join('')}
  </div>`
}

// ── Evaluations ───────────────────────────────────────────────────────────────
function buildEvaluations(data: ReportData): string {
  const { evaluations } = data
  if (evaluations.length === 0) {
    return `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:10px 12px;
      font-size:10px;color:#9ca3af;">No evaluations submitted for this Sunday.</div>`
  }

  // Feel tally
  const counts: Record<string, number> = {}
  evaluations.forEach(e => {
    if (e.service_feel) counts[e.service_feel] = (counts[e.service_feel] || 0) + 1
  })
  const FEEL_ORDER = ['excellent', 'solid', 'rough_spots', 'significant_issues']
  const tallyPills = FEEL_ORDER
    .filter(f => counts[f])
    .map(f => `${feelPill(f)} <span style="font-size:10px;color:#6b7280;margin-right:6px;">×${counts[f]}</span>`)
    .join('')

  const tally = `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:14px;">
    <span style="font-size:10px;font-weight:600;color:#6b7280;margin-right:4px;">How did the service feel?</span>
    ${tallyPills}
  </div>`

  // Individual response cards
  const cards = evaluations.map((e, i) => {
    const brokenBlock = e.broken_moment
      ? `<div style="display:flex;align-items:flex-start;gap:7px;background:#fef2f2;
          border:1px solid #fca5a5;border-radius:5px;padding:7px 10px;margin-bottom:9px;">
          <span style="font-size:11px;flex-shrink:0;margin-top:1px;">⚠</span>
          <div style="font-size:10px;color:#991b1b;line-height:1.5;">
            <strong>A moment broke the experience.</strong>
            ${e.broken_moment_detail ? ' ' + esc(e.broken_moment_detail) : ''}
          </div>
        </div>`
      : `<div style="font-size:10px;color:#059669;font-weight:500;margin-bottom:9px;">✓ No moment broke the experience</div>`

    const fields = [
      { label: 'What worked really well',  value: e.went_well         },
      { label: 'What needed attention',     value: e.needed_attention  },
      { label: 'Anything specific to area', value: e.area_notes        },
    ].filter(f => f.value)

    const fieldBlocks = fields.map(f => `
      <div style="margin-bottom:9px;">
        <div style="font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:.09em;
          color:#9ca3af;margin-bottom:3px;">${esc(f.label)}</div>
        <div style="font-size:10.5px;color:#374151;line-height:1.55;">${esc(f.value!)}</div>
      </div>`).join('')

    return `
      <div style="border:1px solid #e5e7eb;border-radius:8px;margin-bottom:10px;overflow:hidden;">
        <div style="background:#f9fafb;border-bottom:1px solid #e5e7eb;padding:7px 12px;
          display:flex;align-items:center;justify-content:space-between;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;
              color:#9ca3af;">Response ${i + 1}</span>
            ${feelPill(e.service_feel)}
          </div>
          <span style="font-size:9px;color:#9ca3af;">Submitted ${formatTime(e.submitted_at)}</span>
        </div>
        <div style="padding:11px 12px;">
          ${brokenBlock}
          ${fieldBlocks}
        </div>
      </div>`
  }).join('')

  return tally + cards
}

// ── Table style helpers ───────────────────────────────────────────────────────
function thStyle(): string {
  return `background:#f9fafb;font-size:9px;font-weight:700;text-transform:uppercase;
    letter-spacing:.08em;color:#9ca3af;text-align:left;padding:6px 10px;border:1px solid #e5e7eb;`
}
function tdStyle(even = false): string {
  return `padding:7px 10px;border:1px solid #f3f4f6;color:#374151;${even ? 'background:#fafafa;' : ''}`
}
function totalTdExtra(): string {
  return `font-weight:700;color:#111827;background:#f3f4f6 !important;`
}

// ── KPI cards ─────────────────────────────────────────────────────────────────
function kpiCard(value: string | number, label: string): string {
  return `<div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;text-align:center;">
    <div style="font-size:24px;font-weight:800;color:#111827;letter-spacing:-.02em;line-height:1;">${value}</div>
    <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;
      color:#9ca3af;margin-top:5px;">${label}</div>
  </div>`
}

// ── Main export ───────────────────────────────────────────────────────────────
export function generateReportHtml(data: ReportData): string {
  const dateLabel = data.sundayDate
    ? new Date(data.sundayDate + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      })
    : formatDate(new Date().toISOString())

  const totalAttendance =
    (data.attendance?.service_1_count ?? 0) + (data.attendance?.service_2_count ?? 0)
  const attendanceDisplay = totalAttendance > 0 ? totalAttendance.toString() : '—'

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>BFC Sunday Service Report — ${esc(data.sundayDate)}</title>
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
    .section { margin-bottom: 22px; }
    @media print {
      body { background: #fff; padding: 0; }
      .page { box-shadow: none; margin: 0; width: 100%; }
      .page-break { page-break-before: always; break-before: page; }
    }
  </style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div style="background:#1a1a1a;padding:28px 40px 22px;display:flex;align-items:flex-start;justify-content:space-between;">
    <div>
      <div style="color:#fff;font-size:17px;font-weight:700;letter-spacing:.02em;">BFC Production</div>
      <div style="color:#9ca3af;font-size:10px;margin-top:3px;">Bethany First Church · Sunday Ops Hub</div>
    </div>
    <div style="text-align:right;">
      <div style="color:#fff;font-size:20px;font-weight:800;letter-spacing:-.01em;">Sunday Service Report</div>
      <div style="color:#9ca3af;font-size:10px;margin-top:4px;">${esc(dateLabel)} · Generated ${formatGeneratedAt()}</div>
    </div>
  </div>
  <div style="height:4px;background:linear-gradient(90deg,#2563eb 0%,#10b981 100%);"></div>

  <!-- Page 1 body -->
  <div style="padding:28px 40px;">

    <!-- KPI row -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:26px;">
      ${kpiCard(attendanceDisplay, 'Total Attendance')}
      ${kpiCard(data.issues.length, 'Issues Logged')}
      ${kpiCard(data.checklistExceptions.length, 'Checklist Exceptions')}
      ${kpiCard(data.evaluations.length, 'Eval Responses')}
    </div>

    <!-- Attendance -->
    <div class="section">
      ${sectionTitle('Attendance')}
      ${buildAttendance(data)}
    </div>

    <!-- Runtimes -->
    <div class="section">
      ${sectionTitle('Service Runtimes')}
      ${buildRuntimes(data)}
    </div>

    <!-- Issues -->
    <div class="section">
      ${sectionTitle('Issues Logged')}
      ${buildIssues(data)}
    </div>

    <!-- Checklist Exceptions -->
    <div class="section">
      ${sectionTitle('Checklist Exceptions — Unchecked Items')}
      ${buildChecklistExceptions(data)}
    </div>

    <!-- Weather -->
    <div class="section">
      ${sectionTitle('Weather Conditions')}
      ${buildWeather(data)}
    </div>

  </div><!-- /page 1 body -->

  <!-- Footer page 1 -->
  <div style="border-top:1px solid #e5e7eb;padding:12px 40px;display:flex;
    align-items:center;justify-content:space-between;">
    <span style="font-size:8.5px;color:#9ca3af;">BFC Sunday Ops Hub · bethanynaz.org · Confidential — internal use only</span>
    <span style="font-size:8.5px;color:#9ca3af;">Page 1 of 2</span>
  </div>

  <!-- Page 2 -->
  <div class="page-break"></div>

  <div style="background:#f9fafb;border-bottom:1px solid #e5e7eb;padding:10px 40px;
    display:flex;align-items:center;justify-content:space-between;">
    <span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#9ca3af;">
      Sunday Service Report — Continued
    </span>
    <span style="font-size:9px;color:#9ca3af;">${esc(dateLabel)}</span>
  </div>

  <!-- Page 2 body: evaluations -->
  <div style="padding:28px 40px;">
    <div class="section">
      ${sectionTitle(`Service Evaluations · ${data.evaluations.length} Response${data.evaluations.length !== 1 ? 's' : ''}`)}
      ${buildEvaluations(data)}
    </div>
  </div>

  <!-- Footer page 2 -->
  <div style="border-top:1px solid #e5e7eb;padding:12px 40px;display:flex;
    align-items:center;justify-content:space-between;">
    <span style="font-size:8.5px;color:#9ca3af;">BFC Sunday Ops Hub · bethanynaz.org · Confidential — internal use only</span>
    <span style="font-size:8.5px;color:#9ca3af;">Page 2 of 2</span>
  </div>

</div><!-- /page -->
</body>
</html>`
}
