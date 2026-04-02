import { createClient } from '@supabase/supabase-js'
import { getOperationalSundayDateString, CHURCH_TIME_ZONE } from './churchTime'
import type { Session, SpecialEvent } from '../types'

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

// ── Special event helpers ─────────────────────────────────────────────────────

export async function getSpecialEventByDate(date: string): Promise<SpecialEvent | null> {
  const { data } = await supabase
    .from('special_events')
    .select('*')
    .eq('event_date', date)
    .maybeSingle()
  return data
}

/**
 * Load all sessions (Sundays + special events) sorted chronologically.
 * Used by the sidebar navigation to step through all sessions in order.
 */
export async function loadAllSessions(): Promise<Session[]> {
  const [sundaysResult, eventsResult] = await Promise.all([
    supabase.from('sundays').select('id, date').order('date', { ascending: true }),
    supabase.from('special_events').select('id, event_date, name, event_time').order('event_date', { ascending: true }),
  ])

  const sundays: Session[] = (sundaysResult.data || []).map(s => ({
    type: 'sunday' as const,
    id: s.id,
    date: s.date,
  }))

  const events: Session[] = (eventsResult.data || []).map(e => ({
    type: 'event' as const,
    id: e.id,
    date: e.event_date,
    name: e.name,
    eventTime: e.event_time,
  }))

  return [...sundays, ...events].sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Given the operational Sunday date string (from the focus-flip logic),
 * determine if there is a special event on that date or coming up sooner
 * than the computed Sunday. Returns the session that should be focused.
 */
export async function getOperationalSession(
  sundayDate: string,
): Promise<{ session: Session; sundayRow: { id: string; date: string } | null }> {
  // Check if there is an event on the computed Sunday date itself
  const eventOnSundayDate = await getSpecialEventByDate(sundayDate)
  const sundayRow = await getSundayByDate(sundayDate)

  if (eventOnSundayDate) {
    return {
      session: {
        type: 'event',
        id: eventOnSundayDate.id,
        date: eventOnSundayDate.event_date,
        name: eventOnSundayDate.name,
        eventTime: eventOnSundayDate.event_time,
      },
      sundayRow,
    }
  }

  // Load all upcoming events between now and the computed Sunday to see if
  // one falls between today and the Sunday focus
  const today = new Date().toISOString().slice(0, 10)
  const { data: upcomingEvents } = await supabase
    .from('special_events')
    .select('*')
    .gte('event_date', today)
    .lt('event_date', sundayDate)
    .order('event_date', { ascending: true })
    .limit(1)

  if (upcomingEvents && upcomingEvents.length > 0) {
    const e = upcomingEvents[0]
    return {
      session: {
        type: 'event',
        id: e.id,
        date: e.event_date,
        name: e.name,
        eventTime: e.event_time,
      },
      sundayRow,
    }
  }

  // Default: use the computed Sunday
  const sunday = sundayRow ?? await (async () => {
    const { data: created, error } = await supabase
      .from('sundays')
      .insert({ date: sundayDate })
      .select()
      .single()
    if (error) throw error
    return created
  })()

  return {
    session: { type: 'sunday', id: sunday.id, date: sunday.date },
    sundayRow: sunday,
  }
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
