#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js'
import { createSign } from 'crypto'
import { existsSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

try {
  const envPath = join(__dirname, '..', '.env.local')
  if (existsSync(envPath)) {
    readFileSync(envPath, 'utf8').split('\n').forEach(line => {
      const [key, ...rest] = line.split('=')
      if (key && rest.length) process.env[key.trim()] = rest.join('=').trim()
    })
  }
} catch {}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n')
const GMAIL_DELEGATED_USER = process.env.GMAIL_DELEGATED_USER || 'jerry@bethanynaz.org'
const REPORT_EMAIL_FROM_NAME = process.env.REPORT_EMAIL_FROM_NAME || 'BFC Sunday Ops'
const REPORT_EMAIL_FROM_ADDRESS = process.env.REPORT_EMAIL_FROM_ADDRESS || GMAIL_DELEGATED_USER
const REPORT_EMAIL_REPLY_TO = process.env.REPORT_EMAIL_REPLY_TO || 'production@bethanynaz.org'

const CHURCH_TIME_ZONE = 'America/Chicago'
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const SEVERITY_ORDER = { Critical: 0, High: 1, Medium: 2, Low: 3 }
const runNow = process.argv.includes('--now')
const forceSend = process.argv.includes('--force')

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_KEY required')
  process.exit(1)
}

if (!GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY) {
  console.error('Error: GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY required')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

function getZonedParts(date = new Date(), timeZone = CHURCH_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const year = Number(parts.find(part => part.type === 'year')?.value)
  const month = Number(parts.find(part => part.type === 'month')?.value)
  const day = Number(parts.find(part => part.type === 'day')?.value)
  const weekday = parts.find(part => part.type === 'weekday')?.value || ''
  const hour = Number(parts.find(part => part.type === 'hour')?.value)
  const minute = Number(parts.find(part => part.type === 'minute')?.value)

  if (!year || !month || !day || !weekday || Number.isNaN(hour) || Number.isNaN(minute)) {
    throw new Error('Unable to compute zoned date parts')
  }

  return {
    year,
    month,
    day,
    hour,
    minute,
    weekday,
    weekdayIndex: DAY_NAMES.indexOf(weekday),
  }
}

function getDateString(date = new Date(), timeZone = CHURCH_TIME_ZONE) {
  const { year, month, day } = getZonedParts(date, timeZone)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function addDaysToDateString(dateString, daysToAdd) {
  const [year, month, day] = dateString.split('-').map(Number)
  const base = new Date(Date.UTC(year, month - 1, day))
  base.setUTCDate(base.getUTCDate() + daysToAdd)
  return base.toISOString().slice(0, 10)
}

function getMostRecentSundayDateString(date = new Date(), timeZone = CHURCH_TIME_ZONE) {
  const parts = getZonedParts(date, timeZone)
  return addDaysToDateString(getDateString(date, timeZone), -parts.weekdayIndex)
}

function parseTimeToMinutes(timeString) {
  const [hours, minutes] = String(timeString).split(':').map(Number)
  return (hours * 60) + minutes
}

function formatSundayLabel(dateString, timeZone = CHURCH_TIME_ZONE) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${dateString}T12:00:00Z`))
}

function formatClock(timestamp, timeZone = CHURCH_TIME_ZONE) {
  if (!timestamp) return '—'
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function encodeHeader(value) {
  return String(value).replaceAll('\n', ' ').replaceAll('\r', ' ').trim()
}

function formatRating(value) {
  return value == null ? '—' : `${value}/5`
}

function buildChecklistGroups(items, completions) {
  const completedIds = new Set((completions || []).map(entry => entry.item_id))
  return items.filter(item => !completedIds.has(item.id))
}

function summarizeEvaluation(evaluation) {
  if (!evaluation) {
    return 'No post-service evaluation was submitted.'
  }

  const ratings = [
    evaluation.audio_rating,
    evaluation.video_rating,
    evaluation.lighting_rating,
    evaluation.stage_rating,
    evaluation.stream_rating,
    evaluation.overall_rating,
  ].filter(value => typeof value === 'number')

  const average = ratings.length
    ? (ratings.reduce((sum, value) => sum + value, 0) / ratings.length).toFixed(1)
    : null

  return average
    ? `Average evaluation score ${average}/5.`
    : 'Evaluation submitted without numeric ratings.'
}

function buildTextBody(data) {
  const {
    sundayLabel,
    uncheckedItems,
    issues,
    attendance,
    runtimeRows,
    loudness,
    weather,
    analytics,
    evaluation,
  } = data

  const lines = [
    `BFC Sunday Ops Summary`,
    sundayLabel,
    '',
    'TOPLINE',
    `- Checklist: ${data.checklistDone}/${data.checklistTotal} complete`,
    `- Issues logged: ${issues.length}`,
    `- Attendance: ${attendance ? `${attendance.service_1_count ?? '—'} / ${attendance.service_2_count ?? '—'}` : 'No attendance submitted'}`,
    `- Evaluation: ${summarizeEvaluation(evaluation)}`,
    '',
    'UNCHECKED ITEMS',
  ]

  if (uncheckedItems.length === 0) {
    lines.push('- All checklist items were completed.')
  } else {
    uncheckedItems.forEach(item => {
      lines.push(`- [${item.role}] ${item.section}${item.subsection ? ` / ${item.subsection}` : ''}: ${item.task}`)
    })
  }

  lines.push('', 'ISSUES')
  if (issues.length === 0) {
    lines.push('- No issues logged.')
  } else {
    issues.forEach(issue => {
      lines.push(`- [${issue.severity}] ${issue.title || issue.description}`)
      lines.push(`  ${issue.description}`)
    })
  }

  lines.push('', 'SERVICE DATA')
  if (attendance) {
    lines.push(`- Attendance: 9:00 ${attendance.service_1_count ?? '—'} | 11:00 ${attendance.service_2_count ?? '—'}`)
    if (attendance.notes) lines.push(`  Notes: ${attendance.notes}`)
  } else {
    lines.push('- Attendance: not submitted')
  }

  if (runtimeRows.length > 0) {
    lines.push('- Runtimes:')
    runtimeRows.forEach(row => lines.push(`  ${row.label}: ${row.value || '—'}`))
  } else {
    lines.push('- Runtimes: no runtime values saved')
  }

  if (loudness) {
    lines.push(`- Loudness: 9:00 LAeq ${loudness.service_1_laeq ?? '—'} | 11:00 LAeq ${loudness.service_2_laeq ?? '—'}`)
  } else {
    lines.push('- Loudness: not submitted')
  }

  if (weather) {
    lines.push(`- Weather: ${weather.temp_f ?? '—'}F, ${weather.condition || 'Condition unavailable'}, wind ${weather.wind_mph ?? '—'} mph, humidity ${weather.humidity ?? '—'}%`)
  } else {
    lines.push('- Weather: not imported')
  }

  if (analytics) {
    lines.push(`- Stream analytics: YouTube peak ${analytics.youtube_peak ?? '—'}, RESI peak ${analytics.resi_peak ?? '—'}, Church Online peak ${analytics.church_online_peak ?? '—'}`)
  } else {
    lines.push('- Stream analytics: not imported')
  }

  lines.push('', 'POST-SERVICE EVALUATION')
  if (!evaluation) {
    lines.push('- No evaluation submitted.')
  } else {
    lines.push(`- Audio ${formatRating(evaluation.audio_rating)} | Video ${formatRating(evaluation.video_rating)} | Lighting ${formatRating(evaluation.lighting_rating)} | Stage ${formatRating(evaluation.stage_rating)} | Stream ${formatRating(evaluation.stream_rating)} | Overall ${formatRating(evaluation.overall_rating)}`)
    if (evaluation.went_well) lines.push(`- Went well: ${evaluation.went_well}`)
    if (evaluation.didnt_go) lines.push(`- Needs attention: ${evaluation.didnt_go}`)
  }

  return lines.join('\n')
}

function buildHtmlBody(data) {
  const {
    sundayLabel,
    uncheckedItems,
    issues,
    attendance,
    runtimeRows,
    loudness,
    weather,
    analytics,
    evaluation,
  } = data

  const issueCards = issues.length === 0
    ? `<div class="empty">No issues logged.</div>`
    : issues.map(issue => `
      <div class="row-card">
        <div class="row-top">
          <strong>${escapeHtml(issue.title || issue.description)}</strong>
          <span class="badge ${String(issue.severity).toLowerCase()}">${escapeHtml(issue.severity)}</span>
        </div>
        <div class="muted">${escapeHtml(issue.description)}</div>
        <div class="tiny">${issue.pushed_to_monday ? 'Flagged for follow-up' : 'Logged only'} · ${formatClock(issue.created_at)}</div>
      </div>
    `).join('')

  const uncheckedCards = uncheckedItems.length === 0
    ? `<div class="empty">All checklist items were completed.</div>`
    : uncheckedItems.map(item => `
      <div class="row-card">
        <div class="row-top">
          <strong>${escapeHtml(item.task)}</strong>
          <span class="badge neutral">${escapeHtml(item.role)}</span>
        </div>
        <div class="muted">${escapeHtml(item.section)}${item.subsection ? ` / ${escapeHtml(item.subsection)}` : ''}</div>
      </div>
    `).join('')

  const runtimeMarkup = runtimeRows.length === 0
    ? `<div class="empty">No runtime values saved.</div>`
    : runtimeRows.map(row => `
      <div class="metric-row">
        <span>${escapeHtml(row.label)}</span>
        <strong class="mono">${escapeHtml(row.value || '—')}</strong>
      </div>
    `).join('')

  const evaluationCards = evaluation ? `
    <div class="rating-grid">
      ${[
        ['Audio', evaluation.audio_rating],
        ['Video', evaluation.video_rating],
        ['Lighting', evaluation.lighting_rating],
        ['Stage', evaluation.stage_rating],
        ['Stream', evaluation.stream_rating],
        ['Overall', evaluation.overall_rating],
      ].map(([label, value]) => `
        <div class="rating-card">
          <div class="tiny">${escapeHtml(label)}</div>
          <div class="rating-value">${escapeHtml(formatRating(value))}</div>
        </div>
      `).join('')}
    </div>
    <div class="note good">
      <div class="note-title">What Went Well</div>
      <div>${escapeHtml(evaluation.went_well || 'No notes submitted.')}</div>
    </div>
    <div class="note alert">
      <div class="note-title">Needs Attention</div>
      <div>${escapeHtml(evaluation.didnt_go || 'No issues listed in the evaluation.')}</div>
    </div>
  ` : `<div class="empty">No post-service evaluation was submitted.</div>`

  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:Inter,'Segoe UI',sans-serif;color:#111827;">
    <div style="padding:24px 12px;">
      <div style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:24px;overflow:hidden;box-shadow:0 20px 44px rgba(17,24,39,0.08);">
        <div style="padding:28px;background:linear-gradient(135deg,#1a1a1a 0%,#111827 58%,#1f2937 100%);color:#ffffff;">
          <div style="display:inline-block;padding:7px 12px;border-radius:999px;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.18);font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;">BFC Production Team</div>
          <h1 style="margin:16px 0 10px;font-size:34px;line-height:1.02;">Sunday Ops Summary</h1>
          <p style="margin:0;color:rgba(255,255,255,0.82);font-size:15px;line-height:1.55;">${escapeHtml(sundayLabel)}. Concise Sunday close-out with checklist exceptions, issues, service data, and evaluation notes.</p>
        </div>

        <div style="padding:24px;">
          <div class="stats">
            <div class="stat-card">
              <div class="tiny">Checklist</div>
              <div class="stat-value blue">${escapeHtml(`${data.checklistDone}/${data.checklistTotal}`)}</div>
              <div class="muted">Items completed</div>
            </div>
            <div class="stat-card">
              <div class="tiny">Issues</div>
              <div class="stat-value red">${escapeHtml(String(issues.length))}</div>
              <div class="muted">Logged today</div>
            </div>
            <div class="stat-card">
              <div class="tiny">Attendance</div>
              <div class="stat-value gold">${escapeHtml(attendance ? String((attendance.service_1_count || 0) + (attendance.service_2_count || 0)) : '—')}</div>
              <div class="muted">Combined count</div>
            </div>
            <div class="stat-card">
              <div class="tiny">Evaluation</div>
              <div class="stat-value green">${escapeHtml(summarizeEvaluation(evaluation).replace('Average evaluation score ', '').replace('.', ''))}</div>
              <div class="muted">${escapeHtml(evaluation ? 'Team reflection submitted' : 'Not submitted')}</div>
            </div>
          </div>

          <div class="section">
            <div class="section-head">
              <h2>Exceptions First</h2>
              <span class="pill">Actionable Summary</span>
            </div>
            <div class="two-up">
              <div class="callout red">
                <h3>Unchecked Items</h3>
                <p class="sub">${uncheckedItems.length === 0 ? 'No loose ends remained at close-out.' : `${uncheckedItems.length} checklist item${uncheckedItems.length === 1 ? '' : 's'} still open.`}</p>
                ${uncheckedCards}
              </div>
              <div class="callout amber">
                <h3>Issues Logged</h3>
                <p class="sub">${issues.length === 0 ? 'No problems were logged during services.' : `${issues.filter(issue => issue.severity === 'High' || issue.severity === 'Critical').length} high-priority issue${issues.filter(issue => issue.severity === 'High' || issue.severity === 'Critical').length === 1 ? '' : 's'} need follow-up attention.`}</p>
                ${issueCards}
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-head">
              <h2>Service Data</h2>
              <span class="pill">Ops Data</span>
            </div>
            <div class="data-grid">
              <div class="data-card">
                <h3>Attendance</h3>
                <div class="metric-row"><span>9:00 AM Service</span><strong>${escapeHtml(attendance?.service_1_count ?? '—')}</strong></div>
                <div class="metric-row"><span>11:00 AM Service</span><strong>${escapeHtml(attendance?.service_2_count ?? '—')}</strong></div>
                <div class="metric-row"><span>Notes</span><strong>${escapeHtml(attendance?.notes || '—')}</strong></div>
              </div>
              <div class="data-card">
                <h3>Runtimes</h3>
                ${runtimeMarkup}
              </div>
              <div class="data-card">
                <h3>Loudness</h3>
                <div class="metric-row"><span>9:00 LAeq 15</span><strong>${escapeHtml(loudness?.service_1_laeq ?? '—')}</strong></div>
                <div class="metric-row"><span>9:00 Max dB A</span><strong>${escapeHtml(loudness?.service_1_max_db ?? '—')}</strong></div>
                <div class="metric-row"><span>11:00 LAeq 15</span><strong>${escapeHtml(loudness?.service_2_laeq ?? '—')}</strong></div>
                <div class="metric-row"><span>11:00 Max dB A</span><strong>${escapeHtml(loudness?.service_2_max_db ?? '—')}</strong></div>
              </div>
              <div class="data-card">
                <h3>Weather + Stream</h3>
                <div class="metric-row"><span>Weather</span><strong>${escapeHtml(weather ? `${weather.temp_f ?? '—'}F, ${weather.condition || '—'}` : 'Not imported')}</strong></div>
                <div class="metric-row"><span>Wind / Humidity</span><strong>${escapeHtml(weather ? `${weather.wind_mph ?? '—'} mph / ${weather.humidity ?? '—'}%` : '—')}</strong></div>
                <div class="metric-row"><span>YouTube Peak</span><strong>${escapeHtml(analytics?.youtube_peak ?? '—')}</strong></div>
                <div class="metric-row"><span>RESI Peak</span><strong>${escapeHtml(analytics?.resi_peak ?? '—')}</strong></div>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-head">
              <h2>Post-Service Evaluation</h2>
              <span class="pill">Team Reflection</span>
            </div>
            ${evaluationCards}
          </div>
        </div>

        <div style="padding:18px 24px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.55;">
          Sent automatically by BFC Sunday Ops at ${escapeHtml(formatClock(new Date().toISOString()))} Central. Missing data is shown honestly so the team can see what still needs attention.
        </div>
      </div>
    </div>

    <style>
      .stats { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin-bottom:16px; }
      .stat-card, .data-card { border:1px solid #e5e7eb; border-radius:18px; padding:16px; background:#ffffff; }
      .stat-value { font-size:28px; line-height:1; font-weight:800; margin:8px 0 6px; }
      .stat-value.blue { color:#2563eb; }
      .stat-value.red { color:#dc2626; }
      .stat-value.gold { color:#d97706; }
      .stat-value.green { color:#10b981; }
      .tiny { color:#6b7280; font-size:10px; font-weight:800; letter-spacing:0.08em; text-transform:uppercase; }
      .muted { color:#6b7280; font-size:12px; line-height:1.45; }
      .section { margin-top:16px; border:1px solid #e5e7eb; border-radius:22px; padding:20px; background:rgba(255,255,255,0.94); }
      .section-head { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:14px; }
      .section-head h2 { margin:0; font-size:22px; line-height:1.05; }
      .pill { display:inline-block; padding:8px 12px; border-radius:999px; background:#f9fafb; border:1px solid #e5e7eb; font-size:11px; font-weight:800; letter-spacing:0.06em; text-transform:uppercase; }
      .two-up, .data-grid, .rating-grid { display:grid; gap:12px; }
      .two-up { grid-template-columns:1fr 1fr; }
      .data-grid { grid-template-columns:1fr 1fr; }
      .rating-grid { grid-template-columns:repeat(3,minmax(0,1fr)); margin-bottom:12px; }
      .callout { border-radius:18px; padding:16px; }
      .callout.red { background:#fef2f2; border:1px solid #fecaca; }
      .callout.amber { background:#fffbeb; border:1px solid #fde68a; }
      .callout h3, .data-card h3 { margin:0 0 4px; font-size:15px; }
      .sub { margin:0 0 12px; color:#6b7280; font-size:12px; line-height:1.45; }
      .row-card { padding:12px 14px; border-radius:14px; background:rgba(255,255,255,0.82); border:1px solid #f3f4f6; margin-top:8px; }
      .row-top { display:flex; justify-content:space-between; gap:10px; align-items:center; margin-bottom:4px; }
      .badge { display:inline-block; padding:4px 8px; border-radius:999px; font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; }
      .badge.critical, .badge.high { background:#fee2e2; color:#b91c1c; }
      .badge.medium { background:#fef3c7; color:#92400e; }
      .badge.low, .badge.neutral { background:#eff6ff; color:#1d4ed8; }
      .metric-row { display:flex; justify-content:space-between; gap:12px; padding:8px 0; border-top:1px solid #f3f4f6; font-size:12px; }
      .metric-row:first-of-type { padding-top:0; border-top:0; }
      .mono { font-family:'SFMono-Regular','Menlo',monospace; }
      .rating-card { background:#eff6ff; border:1px solid #dbeafe; border-radius:16px; padding:14px; }
      .rating-value { margin-top:8px; font-size:24px; line-height:1; font-weight:800; color:#2563eb; }
      .note { border-radius:16px; padding:16px; border:1px solid #e5e7eb; margin-top:10px; font-size:13px; line-height:1.55; }
      .note.good { background:#ecfdf5; border-color:#a7f3d0; }
      .note.alert { background:#fef2f2; border-color:#fecaca; }
      .note-title { margin-bottom:8px; font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; }
      .empty { padding:12px 14px; border-radius:14px; background:#f9fafb; color:#6b7280; font-size:12px; }
      @media (max-width: 680px) {
        .stats, .two-up, .data-grid, .rating-grid { grid-template-columns:1fr !important; }
        .section-head, .row-top { display:block; }
        .pill, .badge { margin-top:8px; }
      }
    </style>
  </body>
</html>`
}

function toBase64Url(input) {
  return Buffer.from(input).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

async function getGoogleAccessToken() {
  const header = toBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const issuedAt = Math.floor(Date.now() / 1000)
  const payload = toBase64Url(JSON.stringify({
    iss: GOOGLE_CLIENT_EMAIL,
    sub: GMAIL_DELEGATED_USER,
    scope: 'https://www.googleapis.com/auth/gmail.send',
    aud: 'https://oauth2.googleapis.com/token',
    iat: issuedAt,
    exp: issuedAt + 3600,
  }))

  const signer = createSign('RSA-SHA256')
  signer.update(`${header}.${payload}`)
  signer.end()
  const signature = signer.sign(GOOGLE_PRIVATE_KEY, 'base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')

  const assertion = `${header}.${payload}.${signature}`

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })

  if (!response.ok) {
    throw new Error(`Google token request failed with ${response.status}`)
  }

  const payloadJson = await response.json()
  if (!payloadJson.access_token) {
    throw new Error('Google token response did not include an access token')
  }

  return payloadJson.access_token
}

async function sendGmailMessage({ recipients, subject, textBody, htmlBody }) {
  const boundary = `bfc-${Date.now()}`
  const mime = [
    `From: ${encodeHeader(REPORT_EMAIL_FROM_NAME)} <${encodeHeader(REPORT_EMAIL_FROM_ADDRESS)}>`,
    `To: ${encodeHeader(REPORT_EMAIL_FROM_NAME)} <${encodeHeader(REPORT_EMAIL_FROM_ADDRESS)}>`,
    `Bcc: ${recipients.map(encodeHeader).join(', ')}`,
    `Reply-To: ${encodeHeader(REPORT_EMAIL_REPLY_TO)}`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    textBody,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    htmlBody,
    '',
    `--${boundary}--`,
  ].join('\r\n')

  const accessToken = await getGoogleAccessToken()
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: toBase64Url(mime) }),
  })

  if (!response.ok) {
    throw new Error(`Gmail send failed with ${response.status}`)
  }

  return response.json()
}

async function loadSummaryData(sundayId) {
  const queries = await Promise.all([
    supabase.from('checklist_items').select('*').order('sort_order', { ascending: true }).order('id', { ascending: true }),
    supabase.from('checklist_completions').select('item_id').eq('sunday_id', sundayId),
    supabase.from('issues').select('*').eq('sunday_id', sundayId).order('created_at', { ascending: false }),
    supabase.from('attendance').select('*').eq('sunday_id', sundayId).maybeSingle(),
    supabase.from('runtime_fields').select('*').order('sort_order', { ascending: true }).order('pull_time', { ascending: true }),
    supabase.from('runtime_values').select('*').eq('sunday_id', sundayId),
    supabase.from('loudness').select('*').eq('sunday_id', sundayId).maybeSingle(),
    supabase.from('weather').select('*').eq('sunday_id', sundayId).maybeSingle(),
    supabase.from('evaluations').select('*').eq('sunday_id', sundayId).maybeSingle(),
    supabase.from('stream_analytics').select('*').eq('sunday_id', sundayId).maybeSingle(),
  ])

  for (const query of queries) {
    if (query.error) throw query.error
  }

  const checklistItems = queries[0].data || []
  const completions = queries[1].data || []
  const issues = (queries[2].data || []).sort((a, b) => {
    const severityDelta = (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99)
    return severityDelta !== 0 ? severityDelta : new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })
  const runtimeFields = queries[4].data || []
  const runtimeValues = queries[5].data || []
  const runtimeValueByField = new Map(runtimeValues.map(entry => [entry.field_id, entry]))

  return {
    checklistItems,
    completions,
    issues,
    attendance: queries[3].data || null,
    runtimeRows: runtimeFields.map(field => ({
      label: field.label,
      value: runtimeValueByField.get(field.id)?.value || null,
      captured_at: runtimeValueByField.get(field.id)?.captured_at || null,
    })),
    loudness: queries[6].data || null,
    weather: queries[7].data || null,
    evaluation: queries[8].data || null,
    analytics: queries[9].data || null,
  }
}

async function run() {
  console.log('BFC Sunday Ops — Summary Email')
  console.log('================================')

  const { data: settings, error: settingsError } = await supabase
    .from('report_email_settings')
    .select('*')
    .eq('key', 'default')
    .maybeSingle()

  if (settingsError) throw settingsError
  if (!settings) {
    console.log('No summary email settings found. Save them in the admin UI first.')
    process.exit(0)
  }

  if (!settings.enabled) {
    console.log('Summary email is disabled.')
    process.exit(0)
  }

  const { data: recipients, error: recipientsError } = await supabase
    .from('report_email_recipients')
    .select('*')
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (recipientsError) throw recipientsError
  if (!recipients || recipients.length === 0) {
    console.log('No active summary email recipients configured.')
    process.exit(0)
  }

  const timeZone = settings.timezone || CHURCH_TIME_ZONE
  const now = getZonedParts(new Date(), timeZone)
  const currentMinutes = (now.hour * 60) + now.minute
  const scheduledMinutes = parseTimeToMinutes(settings.send_time)

  if (!runNow) {
    if (now.weekdayIndex !== settings.send_day) {
      console.log(`Today is ${DAY_NAMES[now.weekdayIndex]}. Configured send day is ${DAY_NAMES[settings.send_day]}.`)
      process.exit(0)
    }

    if (currentMinutes < scheduledMinutes) {
      console.log(`Current church time is before configured send time ${settings.send_time}.`)
      process.exit(0)
    }
  }

  const targetSundayDate = getMostRecentSundayDateString(new Date(), timeZone)
  console.log(`Target Sunday: ${targetSundayDate}`)

  const { data: sunday, error: sundayError } = await supabase
    .from('sundays')
    .select('id, date')
    .eq('date', targetSundayDate)
    .maybeSingle()

  if (sundayError) throw sundayError
  if (!sunday) {
    console.log(`No Sunday row found for ${targetSundayDate}.`)
    process.exit(0)
  }

  const { data: existingRun, error: runError } = await supabase
    .from('report_email_runs')
    .select('*')
    .eq('sunday_id', sunday.id)
    .maybeSingle()

  if (runError) throw runError
  if (!forceSend && existingRun?.status === 'sent') {
    console.log(`Summary email already sent for ${targetSundayDate} at ${existingRun.sent_at}.`)
    process.exit(0)
  }

  const summaryData = await loadSummaryData(sunday.id)
  const uncheckedItems = buildChecklistGroups(summaryData.checklistItems, summaryData.completions)
  const checklistDone = summaryData.checklistItems.length - uncheckedItems.length
  const checklistTotal = summaryData.checklistItems.length
  const sundayLabel = formatSundayLabel(targetSundayDate, timeZone)

  const payload = {
    ...summaryData,
    sundayLabel,
    uncheckedItems,
    checklistDone,
    checklistTotal,
  }

  const subject = `BFC Sunday Ops Summary · ${new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${targetSundayDate}T12:00:00Z`))}`

  const recipientEmails = recipients.map(recipient => recipient.email)

  try {
    const gmailResponse = await sendGmailMessage({
      recipients: recipientEmails,
      subject,
      textBody: buildTextBody(payload),
      htmlBody: buildHtmlBody(payload),
    })

    const { error: updateError } = await supabase
      .from('report_email_runs')
      .upsert({
        sunday_id: sunday.id,
        status: 'sent',
        sent_at: new Date().toISOString(),
        recipient_count: recipientEmails.length,
        error: null,
        provider_message_id: gmailResponse.id || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'sunday_id' })

    if (updateError) throw updateError

    console.log(`Summary email sent to ${recipientEmails.length} recipient(s).`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    await supabase
      .from('report_email_runs')
      .upsert({
        sunday_id: sunday.id,
        status: 'failed',
        sent_at: null,
        recipient_count: recipientEmails.length,
        error: message,
        provider_message_id: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'sunday_id' })

    throw error
  }
}

run().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
