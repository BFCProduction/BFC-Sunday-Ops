import { createClient } from '@supabase/supabase-js'
import { getOperationalSundayDateString } from './churchTime'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function getOrCreateSunday() {
  const today = getOperationalSundayDateString()
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
