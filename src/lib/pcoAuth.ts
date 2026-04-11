// ─────────────────────────────────────────────────────────────────────────────
// pcoAuth.ts — Planning Center OAuth utilities
//
// Handles the frontend side of the PCO OAuth2 Authorization Code flow.
//
// Required env vars:
//   VITE_PCO_CLIENT_ID   — your PCO app's client ID (safe to expose in frontend)
//
// The client secret lives only in the pco-auth edge function.
// ─────────────────────────────────────────────────────────────────────────────

const PCO_AUTHORIZE_URL = 'https://api.planningcenteronline.com/oauth/authorize'

// people  → name, email, avatar
// services → Plans API (used later for event sync)
const PCO_SCOPES = 'people services'

const SESSION_KEY   = 'bfc_ops_session'
const OAUTH_STATE_KEY = 'pco_oauth_state'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PCOUser {
  id:         string
  pco_id:     string
  name:       string
  email:      string | null
  avatar_url: string | null
  is_admin:   boolean
}

export interface StoredSession {
  user:       PCOUser
  token:      string
  expires_at: string
}

// ── Redirect URI ──────────────────────────────────────────────────────────────
// Must match exactly what is registered in your PCO developer app.
// For GitHub Pages: https://bfcproduction.github.io/BFC-Sunday-Ops/
// For local dev:    http://localhost:5173/BFC-Sunday-Ops/
export function getRedirectUri(): string {
  const base = `${window.location.origin}${import.meta.env.BASE_URL}`
  // Ensure trailing slash (PCO requires an exact match)
  return base.endsWith('/') ? base : base + '/'
}

// ── Initiate login ────────────────────────────────────────────────────────────
export function initiatePCOLogin(): void {
  const clientId = import.meta.env.VITE_PCO_CLIENT_ID as string
  if (!clientId) {
    console.error('VITE_PCO_CLIENT_ID is not set')
    return
  }

  // Store random state for CSRF protection
  const state = crypto.randomUUID()
  sessionStorage.setItem(OAUTH_STATE_KEY, state)

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  getRedirectUri(),
    response_type: 'code',
    scope:         PCO_SCOPES,
    state,
  })

  window.location.href = `${PCO_AUTHORIZE_URL}?${params}`
}

// ── OAuth callback detection ──────────────────────────────────────────────────
// Call this on every page load. Returns the code if this load is a PCO callback,
// null otherwise. Also cleans the code/state params from the URL.
export function extractOAuthCode(): string | null {
  const params = new URLSearchParams(window.location.search)
  const code  = params.get('code')
  const state = params.get('state')

  if (!code || !state) return null

  // Verify state to prevent CSRF
  const savedState = sessionStorage.getItem(OAUTH_STATE_KEY)
  sessionStorage.removeItem(OAUTH_STATE_KEY)

  if (state !== savedState) {
    console.error('OAuth state mismatch — ignoring callback')
    return null
  }

  // Remove code/state from URL without a page reload
  const clean = window.location.pathname + window.location.hash
  window.history.replaceState({}, '', clean)

  return code
}

// ── Token exchange (calls pco-auth edge function) ─────────────────────────────
export async function exchangeCodeForSession(code: string): Promise<StoredSession> {
  const supabaseUrl    = import.meta.env.VITE_SUPABASE_URL    as string
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

  const res = await fetch(`${supabaseUrl}/functions/v1/pco-auth`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${supabaseAnonKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ code, redirect_uri: getRedirectUri() }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(err.error ?? 'Authentication failed')
  }

  return res.json() as Promise<StoredSession>
}

// ── Session persistence ───────────────────────────────────────────────────────
export function getStoredSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const session = JSON.parse(raw) as StoredSession
    if (new Date(session.expires_at) <= new Date()) {
      localStorage.removeItem(SESSION_KEY)
      return null
    }
    return session
  } catch {
    return null
  }
}

export function storeSession(session: StoredSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY)
}
