// ─────────────────────────────────────────────────────────────────────────────
// adminApi.ts — helpers for calling protected Supabase Edge Functions
//
// Auth is now session-token based (PCO OAuth). The token is passed as the
// x-session-token header. The edge function verifies it against user_sessions
// and checks is_admin before proceeding.
// ─────────────────────────────────────────────────────────────────────────────

function getFunctionUrl(name: string) {
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`
}

export class ApiError extends Error {
  code: string | null
  status: number

  constructor(message: string, options: { code?: string | null; status: number }) {
    super(message)
    this.name = 'ApiError'
    this.code = options.code ?? null
    this.status = options.status
  }
}

function errorFromResponse(payload: unknown, fallback: string, status: number) {
  const body = payload as { error?: unknown; code?: unknown }
  const message = typeof body?.error === 'string' ? body.error : fallback
  const code = typeof body?.code === 'string' ? body.code : null
  return new ApiError(message, { code, status })
}

// ── PCO Sync ──────────────────────────────────────────────────────────────────

export interface PcoSyncResult {
  synced:  number
  skipped: number
  details: Array<{
    pco_plan_id: string
    event_date:  string
    name:        string
    action:      'upserted' | 'skipped' | 'error'
    error?:      string
  }>
}

export async function triggerPcoSync(sessionToken: string): Promise<PcoSyncResult> {
  const response = await fetch(getFunctionUrl('pco-sync'), {
    method: 'POST',
    headers: {
      'Authorization':   `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type':    'application/json',
      'x-session-token': sessionToken,
    },
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw errorFromResponse(payload, `Sync failed with ${response.status}`, response.status)
  }

  return payload as PcoSyncResult
}

// ── PCO Plans ─────────────────────────────────────────────────────────────────

export interface PcoPlanResult {
  id:           string
  title:        string | null
  series_title: string | null
  event_date:   string
  display_date: string
}

export interface PcoServiceTypePlans {
  slug:  string
  name:  string
  plans: PcoPlanResult[]
}

export async function fetchPcoPlans(
  sessionToken: string,
): Promise<PcoServiceTypePlans[]> {
  const response = await fetch(getFunctionUrl('pco-plans'), {
    method: 'POST',
    headers: {
      'Authorization':   `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type':    'application/json',
      'x-session-token': sessionToken,
    },
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw errorFromResponse(payload, `Plans fetch failed with ${response.status}`, response.status)
  }

  return (payload as { service_types: PcoServiceTypePlans[] }).service_types ?? []
}

// ── PCO Plan Times ───────────────────────────────────────────────────────────

export interface PcoPlanTimeResult {
  id:        string
  name:      string | null
  starts_at: string
  ends_at:   string | null
  time_type: string | null
}

export async function fetchPcoPlanTimes(
  sessionToken: string,
  eventId: string,
): Promise<PcoPlanTimeResult[]> {
  const response = await fetch(getFunctionUrl('pco-plan-times'), {
    method: 'POST',
    headers: {
      'Authorization':   `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type':    'application/json',
      'x-session-token': sessionToken,
    },
    body: JSON.stringify({ event_id: eventId }),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw errorFromResponse(payload, `Plan times fetch failed with ${response.status}`, response.status)
  }

  return (payload as { schedule: PcoPlanTimeResult[] }).schedule ?? []
}

// ── PCO Plan Items (Run of Show) ─────────────────────────────────────────────

export interface PcoPlanItemResult {
  id:                  string
  sequence:            number
  title:               string
  item_type:           string  // 'song' | 'header' | 'item' | 'media'
  length:              number | null  // seconds
  description:         string | null
  service_position:    string | null  // 'pre_service' | 'service' | 'post_service'
  key_name:            string | null  // song key, e.g. 'G', 'A'
  computed_starts_at:  string | null  // ISO timestamp
}

export async function fetchPcoPlanItems(
  sessionToken: string,
  eventId: string,
): Promise<PcoPlanItemResult[]> {
  const response = await fetch(getFunctionUrl('pco-plan-items'), {
    method: 'POST',
    headers: {
      'Authorization':   `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type':    'application/json',
      'x-session-token': sessionToken,
    },
    body: JSON.stringify({ event_id: eventId }),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw errorFromResponse(payload, `Plan items fetch failed with ${response.status}`, response.status)
  }

  return (payload as { items: PcoPlanItemResult[] }).items ?? []
}

// ── User Admin ────────────────────────────────────────────────────────────────

export interface AppUser {
  id:         string
  pco_id:     string
  name:       string
  email:      string | null
  avatar_url: string | null
  is_admin:   boolean
  last_login: string | null
  created_at: string
}

export async function fetchAppUsers(sessionToken: string): Promise<AppUser[]> {
  const response = await fetch(getFunctionUrl('user-admin'), {
    method: 'GET',
    headers: {
      'Authorization':   `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type':    'application/json',
      'x-session-token': sessionToken,
    },
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(typeof payload?.error === 'string' ? payload.error : `Request failed with ${response.status}`)
  }

  return (payload as { users: AppUser[] }).users ?? []
}

export async function setUserAdmin(
  sessionToken: string,
  userId: string,
  isAdmin: boolean,
): Promise<AppUser> {
  const response = await fetch(getFunctionUrl('user-admin'), {
    method: 'PATCH',
    headers: {
      'Authorization':   `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type':    'application/json',
      'x-session-token': sessionToken,
    },
    body: JSON.stringify({ user_id: userId, is_admin: isAdmin }),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(typeof payload?.error === 'string' ? payload.error : `Request failed with ${response.status}`)
  }

  return (payload as { user: AppUser }).user
}

// ── Event Admin ──────────────────────────────────────────────────────────────

export async function deleteEventAsAdmin(
  sessionToken: string,
  eventId: string,
): Promise<void> {
  const response = await fetch(getFunctionUrl('event-admin'), {
    method: 'DELETE',
    headers: {
      'Authorization':   `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type':    'application/json',
      'x-session-token': sessionToken,
    },
    body: JSON.stringify({ event_id: eventId }),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(
      typeof payload?.error === 'string' ? payload.error : `Delete failed with ${response.status}`
    )
  }
}

// ── Summary Email Admin ───────────────────────────────────────────────────────

export async function requestSummaryEmailAdmin<T>(
  sessionToken: string,
  method: string,
  body?: unknown,
) {
  const response = await fetch(getFunctionUrl('summary-email-admin'), {
    method,
    headers: {
      'Authorization':   `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type':    'application/json',
      'x-session-token': sessionToken,
    },
    body: body == null ? undefined : JSON.stringify(body),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(
      typeof payload?.error === 'string' ? payload.error : `Request failed with ${response.status}`
    )
  }

  return payload as T
}
