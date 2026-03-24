import { createClient } from '@supabase/supabase-js'
import { getOperationalSundayDateString, CHURCH_TIME_ZONE } from './churchTime'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function loadChurchTimezone(): Promise<string> {
  const { data } = await supabase
    .from('app_config')
    .select('value')
    .eq('key', 'church_timezone')
    .maybeSingle()
  return data?.value || CHURCH_TIME_ZONE
}

export async function getOrCreateSunday(timezone = CHURCH_TIME_ZONE) {
  const today = getOperationalSundayDateString(new Date(), timezone)
  const { data: existing } = await supabase
    .from('sundays')
    .select('*')
    .eq('date', today)
    .single()
  if (existing) return existing
  const { data: created, error } = await supabase
    .from('sundays')
    .insert({ date: today })
    .select()
    .single()
  if (error) throw error
  return created
}
