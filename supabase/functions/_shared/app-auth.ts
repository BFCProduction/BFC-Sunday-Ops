// deno-lint-ignore-file no-import-prefix
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

export type AppAccessLevel = 'user' | 'manager' | 'admin'

export interface AppSessionUser {
  id: string
  pco_id: string
  name: string
  email: string | null
  avatar_url: string | null
  access_level: AppAccessLevel
  is_admin: boolean
}

const ACCESS_RANK: Record<AppAccessLevel, number> = {
  user: 0,
  manager: 1,
  admin: 2,
}

export function hasAccessLevel(
  user: Pick<AppSessionUser, 'access_level'>,
  minimum: AppAccessLevel,
) {
  return ACCESS_RANK[user.access_level] >= ACCESS_RANK[minimum]
}

export async function verifyAppSession(
  supabase: SupabaseClient,
  token: string | null,
): Promise<AppSessionUser | null> {
  if (!token) return null

  const now = new Date().toISOString()
  const { data: session, error: sessionError } = await supabase
    .from('user_sessions')
    .select('user_id')
    .eq('token', token)
    .gt('expires_at', now)
    .maybeSingle()

  if (sessionError || !session) return null

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, pco_id, name, email, avatar_url, access_level, is_admin')
    .eq('id', session.user_id)
    .maybeSingle()

  if (userError || !user) return null
  if (!['user', 'manager', 'admin'].includes(user.access_level)) return null

  void supabase
    .from('user_sessions')
    .update({ last_used_at: now })
    .eq('token', token)
    .then(() => undefined)

  return user as AppSessionUser
}

export async function verifyMinimumAccess(
  supabase: SupabaseClient,
  token: string | null,
  minimum: AppAccessLevel,
) {
  const user = await verifyAppSession(supabase, token)
  return user && hasAccessLevel(user, minimum) ? user : null
}
