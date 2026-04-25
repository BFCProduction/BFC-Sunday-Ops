const PCO_TOKEN_URL = 'https://api.planningcenteronline.com/oauth/token'
const TOKEN_REFRESH_BUFFER_MS = 60_000

interface SupabaseAdminClient {
  from: (table: string) => {
    update: (values: Record<string, unknown>) => {
      eq: (column: string, value: string) => PromiseLike<{ error: { message: string } | null }>
    }
  }
}

export interface PcoSessionTokens {
  pco_access_token: string | null
  pco_refresh_token: string | null
  pco_token_expires_at: string | null
}

export class PcoReauthRequiredError extends Error {
  code = 'reauth_required' as const
}

export function pcoReauthBody(error: unknown) {
  const message = error instanceof Error
    ? error.message
    : 'Planning Center authorization expired. Sign in again with Planning Center.'

  return { error: message, code: 'reauth_required' }
}

function shouldRefreshToken(expiresAt: string | null) {
  if (!expiresAt) return false
  const expiresMs = Date.parse(expiresAt)
  return Number.isNaN(expiresMs) || expiresMs <= Date.now() + TOKEN_REFRESH_BUFFER_MS
}

async function refreshPcoToken(
  supabaseClient: unknown,
  sessionToken: string,
  refreshToken: string,
) {
  const supabase = supabaseClient as SupabaseAdminClient
  const pcoClientId     = Deno.env.get('PCO_CLIENT_ID')
  const pcoClientSecret = Deno.env.get('PCO_CLIENT_SECRET')

  if (!pcoClientId || !pcoClientSecret) {
    throw new PcoReauthRequiredError('Planning Center credentials are not configured on the server.')
  }

  const tokenRes = await fetch(PCO_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type:    'refresh_token',
      refresh_token: refreshToken,
      client_id:     pcoClientId,
      client_secret: pcoClientSecret,
    }),
  })

  if (!tokenRes.ok) {
    throw new PcoReauthRequiredError('Planning Center authorization expired. Sign in again with Planning Center.')
  }

  const tokens = await tokenRes.json() as {
    access_token:  string
    refresh_token?: string
    expires_in?:    number
  }

  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null

  const { error } = await supabase
    .from('user_sessions')
    .update({
      pco_access_token:     tokens.access_token,
      pco_refresh_token:    tokens.refresh_token ?? refreshToken,
      pco_token_expires_at: expiresAt,
    })
    .eq('token', sessionToken)

  if (error) throw new Error(`Failed to save refreshed Planning Center token: ${error.message}`)
  return tokens.access_token
}

export async function getValidPcoToken(
  supabase: unknown,
  sessionToken: string,
  session: PcoSessionTokens,
) {
  if (!session.pco_access_token) {
    throw new PcoReauthRequiredError('Planning Center authorization is missing. Sign in again with Planning Center.')
  }

  if (shouldRefreshToken(session.pco_token_expires_at)) {
    if (!session.pco_refresh_token) {
      throw new PcoReauthRequiredError('Planning Center authorization expired. Sign in again with Planning Center.')
    }
    return await refreshPcoToken(supabase, sessionToken, session.pco_refresh_token)
  }

  return session.pco_access_token
}
