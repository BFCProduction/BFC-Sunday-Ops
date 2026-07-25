import { createClient } from 'npm:@supabase/supabase-js@2'

// ─────────────────────────────────────────────────────────────────────────────
// workbook-pay edge function
//
// Admin-only. Computes crew pay for a workbook and returns it only to verified
// admins (non-admins get 401), so per-person pay and totals are never exposed to
// the anon key. Pay model (see the Workbook v2 plan):
//   - The unit is a person's on-clock span PER DAY: earliest call → latest
//     release across their paid rows that day, gaps included.
//   - Hours are rounded to the nearest half hour. No minimum.
//   - Rate is the role's hourly rate; when a person fills more than one role in a
//     day the higher rate is used (deterministic; a no-op while rates are uniform).
//   - Only rows flagged is_paid count. Volunteers contribute 0.
//
// Request:  POST { workbook_id } with x-session-token: <session token>
// Response: { people: [...], total_pay, total_hours, currency }
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = [
  'https://bfcproduction.github.io',
  'http://localhost:5173',
]

function getCorsHeaders(request: Request) {
  const origin = request.headers.get('Origin') ?? ''
  return {
    'Access-Control-Allow-Origin':  ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

function jsonResponse(corsHeaders: Record<string, string>, status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// deno-lint-ignore no-explicit-any
async function verifyAdminSession(supabase: any, token: string | null): Promise<{ id: string } | null> {
  if (!token) return null
  const now = new Date().toISOString()
  const { data: session } = await supabase
    .from('user_sessions')
    .select('user_id, expires_at')
    .eq('token', token)
    .gt('expires_at', now)
    .maybeSingle()
  if (!session) return null
  const { data: user } = await supabase
    .from('users')
    .select('id, is_admin')
    .eq('id', session.user_id)
    .eq('is_admin', true)
    .maybeSingle()
  return user ?? null
}

function toMinutes(time: string | null): number | null {
  if (!time) return null
  const [hour, minute] = time.slice(0, 5).split(':').map(Number)
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null
  return hour * 60 + minute
}

function minutesToStr(total: number): string {
  const hour = Math.floor(total / 60)
  const minute = total % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

const round2 = (value: number) => Math.round(value * 100) / 100

interface CrewRow {
  scheduled_date: string
  user_id: string | null
  person_name: string | null
  is_open: boolean
  role_id: string | null
  call_time: string | null
  release_time: string | null
  is_paid: boolean
}

Deno.serve(async request => {
  const corsHeaders = getCorsHeaders(request)
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse(corsHeaders, 405, { error: 'Method not allowed' })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_KEY')
    if (!supabaseUrl || !serviceKey) throw new Error('Missing Supabase function secrets')

    const supabase = createClient(supabaseUrl, serviceKey)

    const adminUser = await verifyAdminSession(supabase, request.headers.get('x-session-token'))
    if (!adminUser) return jsonResponse(corsHeaders, 401, { error: 'Unauthorized' })

    const body = await request.json().catch(() => ({}))
    const workbookId = typeof body?.workbook_id === 'string' ? body.workbook_id : ''
    if (!workbookId) return jsonResponse(corsHeaders, 400, { error: 'workbook_id is required' })

    const [{ data: crew }, { data: roles }] = await Promise.all([
      supabase.from('workbook_crew').select('scheduled_date, user_id, person_name, is_open, role_id, call_time, release_time, is_paid').eq('workbook_id', workbookId),
      supabase.from('roles').select('id, hourly_rate'),
    ])

    const rateByRole = new Map<string, number>((roles ?? []).map((r: { id: string; hourly_rate: number }) => [r.id, Number(r.hourly_rate) || 0]))

    const crewRows = (crew ?? []) as CrewRow[]
    const userIds = [...new Set(crewRows.filter(row => row.user_id).map(row => row.user_id as string))]
    const userNameById = new Map<string, string>()
    if (userIds.length > 0) {
      const { data: users } = await supabase.from('users').select('id, name').in('id', userIds)
      for (const user of (users ?? []) as Array<{ id: string; name: string }>) userNameById.set(user.id, user.name)
    }

    const personName = (row: CrewRow) =>
      row.user_id ? (userNameById.get(row.user_id) ?? 'Unknown') : (row.person_name ?? 'Unknown')

    interface DayAcc { minCall: number; maxRelease: number; rate: number }
    const people = new Map<string, { name: string; days: Map<string, DayAcc> }>()

    for (const row of crewRows) {
      if (!row.is_paid || row.is_open) continue
      const call = toMinutes(row.call_time)
      const release = toMinutes(row.release_time)
      if (call === null || release === null || release <= call) continue
      const key = row.user_id ?? `name:${row.person_name}`
      const rate = row.role_id ? (rateByRole.get(row.role_id) ?? 0) : 0
      const person = people.get(key) ?? { name: personName(row), days: new Map<string, DayAcc>() }
      const day = person.days.get(row.scheduled_date) ?? { minCall: call, maxRelease: release, rate }
      day.minCall = Math.min(day.minCall, call)
      day.maxRelease = Math.max(day.maxRelease, release)
      day.rate = Math.max(day.rate, rate)
      person.days.set(row.scheduled_date, day)
      people.set(key, person)
    }

    let totalPay = 0
    let totalHours = 0
    const result = [...people.values()].map(person => {
      const days = [...person.days.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, day]) => {
        const hours = Math.round(((day.maxRelease - day.minCall) / 60) * 2) / 2
        const pay = round2(hours * day.rate)
        return { date, call: minutesToStr(day.minCall), release: minutesToStr(day.maxRelease), hours, rate: day.rate, pay }
      })
      const personHours = days.reduce((sum, d) => sum + d.hours, 0)
      const personPay = round2(days.reduce((sum, d) => sum + d.pay, 0))
      totalHours += personHours
      totalPay += personPay
      return { name: person.name, hours: personHours, pay: personPay, days }
    }).sort((a, b) => a.name.localeCompare(b.name))

    return jsonResponse(corsHeaders, 200, {
      people: result,
      total_pay: round2(totalPay),
      total_hours: Math.round(totalHours * 2) / 2,
      currency: 'USD',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return jsonResponse(corsHeaders, 500, { error: message })
  }
})
