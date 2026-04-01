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

export async function loadFlipConfig(): Promise<{ flipDay: number; flipHour: number }> {
  const { data } = await supabase
    .from('app_config')
    .select('key, value')
    .in('key', ['sunday_flip_day', 'sunday_flip_hour'])
  const map: Record<string, string> = {}
  ;(data || []).forEach((r: { key: string; value: string }) => { map[r.key] = r.value })
  return {
    flipDay:  parseInt(map['sunday_flip_day']  ?? '1',  10),
    flipHour: parseInt(map['sunday_flip_hour'] ?? '12', 10),
  }
}

export async function getSundayByDate(date: string): Promise<{ id: string; date: string } | null> {
  const { data } = await supabase
    .from('sundays')
    .select('id, date')
    .eq('date', date)
    .maybeSingle()
  return data
}

export async function getOrCreateSunday(timezone = CHURCH_TIME_ZONE, flipDay = 1, flipHour = 12) {
  const today = getOperationalSundayDateString(new Date(), timezone, flipDay, flipHour)
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
