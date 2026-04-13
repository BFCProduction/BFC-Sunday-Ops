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
    throw new Error(
      typeof payload?.error === 'string' ? payload.error : `Sync failed with ${response.status}`
    )
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
    throw new Error(
      typeof payload?.error === 'string' ? payload.error : `Plans fetch failed with ${response.status}`
    )
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
    throw new Error(
      typeof payload?.error === 'string' ? payload.error : `Plan times fetch failed with ${response.status}`
    )
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
    throw new Error(
      typeof payload?.error === 'string' ? payload.error : `Plan items fetch failed with ${response.status}`
    )
  }

  return (payload as { items: PcoPlanItemResult[] }).items ?? []
}

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
