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
