import { createClient } from '@supabase/supabase-js'
import { getOperationalSundayDateString, CHURCH_TIME_ZONE } from './churchTime'
import type { Session } from '../types'

const supabaseUrl    = import.meta.env.VITE_SUPABASE_URL    as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ── Config helpers ────────────────────────────────────────────────────────────

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

// ── Raw DB row type for events join ──────────────────────────────────────────

interface EventRow {
  id: string
  name: string
  event_date: string
  event_time: string | null
  legacy_sunday_id: string | null
  legacy_special_event_id: string | null
  service_types: {
    slug: string
    name: string
    color: string
    sort_order: number
  }
}

function rowToSession(row: EventRow): Session {
  const slug = row.service_types.slug
  return {
    id:                    row.id,
    type:                  slug.startsWith('sunday') ? 'sunday' : 'event',
    serviceTypeSlug:       slug,
    serviceTypeName:       row.service_types.name,
    serviceTypeColor:      row.service_types.color,
    name:                  row.name,
    date:                  row.event_date,
    eventTime:             row.event_time,
    legacySundayId:        row.legacy_sunday_id,
    legacySpecialEventId:  row.legacy_special_event_id,
  }
}

// ── Session / event queries ───────────────────────────────────────────────────

/**
 * Load all events sorted chronologically, then by service type sort_order
 * within the same date (so 9am always comes before 11am).
 */
export async function loadAllSessions(): Promise<Session[]> {
  const { data, error } = await supabase
    .from('events')
    .select(`
      id, name, event_date, event_time, legacy_sunday_id, legacy_special_event_id,
      service_types ( slug, name, color, sort_order )
    `)
    .order('event_date', { ascending: true })
    .order('sort_order', { ascending: true, referencedTable: 'service_types' })

  if (error) throw error
  const slugOrder: Record<string, number> = { 'sunday-9am': 0, 'sunday-11am': 1, 'special': 2 }
  return (data as unknown as EventRow[])
    .map(rowToSession)
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date)
      return (slugOrder[a.serviceTypeSlug] ?? 3) - (slugOrder[b.serviceTypeSlug] ?? 3)
    })
}

/**
 * Get a specific event by its events.id.
 */
export async function getEventById(id: string): Promise<Session | null> {
  const { data } = await supabase
    .from('events')
    .select(`
      id, name, event_date, event_time, legacy_sunday_id, legacy_special_event_id,
      service_types ( slug, name, color, sort_order )
    `)
    .eq('id', id)
    .maybeSingle()

  return data ? rowToSession(data as unknown as EventRow) : null
}

/**
 * Get the first event on a given date (for "back to today" style navigation).
 * Returns the earliest service type (e.g. 9am before 11am).
 */
export async function getFirstEventForDate(date: string): Promise<Session | null> {
  const { data } = await supabase
    .from('events')
    .select(`
      id, name, event_date, event_time, legacy_sunday_id, legacy_special_event_id,
      service_types ( slug, name, color, sort_order )
    `)
    .eq('event_date', date)
    .order('sort_order', { ascending: true, referencedTable: 'service_types' })
    .limit(1)
    .maybeSingle()

  return data ? rowToSession(data as unknown as EventRow) : null
}

/**
 * Get all events on a given date (e.g. to show the 9am/11am pills).
 */
export async function getEventsForDate(date: string): Promise<Session[]> {
  const { data } = await supabase
    .from('events')
    .select(`
      id, name, event_date, event_time, legacy_sunday_id, legacy_special_event_id,
      service_types ( slug, name, color, sort_order )
    `)
    .eq('event_date', date)
    .order('sort_order', { ascending: true, referencedTable: 'service_types' })

  return ((data ?? []) as unknown as EventRow[]).map(rowToSession)
}

/**
 * Get or create events for the operational date.
 * For a regular Sunday, this creates both 9am and 11am events (and the
 * underlying sundays record) if they don't already exist.
 * Returns the 9am event as the default focus.
 */
export async function getOrCreateTodayEvents(
  timezone = CHURCH_TIME_ZONE,
  flipDay  = 1,
  flipHour = 12,
): Promise<{ defaultSession: Session; sundayDate: string }> {
  const today = getOperationalSundayDateString(new Date(), timezone, flipDay, flipHour)

  // Ensure the underlying sundays record exists (data tables still need it)
  let sundayId: string
  const { data: existingSunday } = await supabase
    .from('sundays')
    .select('id')
    .eq('date', today)
    .maybeSingle()

  if (existingSunday) {
    sundayId = existingSunday.id
  } else {
    const { data: newSunday, error } = await supabase
      .from('sundays')
      .insert({ date: today })
      .select('id')
      .single()
    if (error) throw error
    sundayId = newSunday.id
  }

  // Fetch service type IDs
  const { data: serviceTypes } = await supabase
    .from('service_types')
    .select('id, slug, name, color, sort_order')
    .in('slug', ['sunday-9am', 'sunday-11am'])
    .order('sort_order', { ascending: true })

  const st9am  = serviceTypes?.find(s => s.slug === 'sunday-9am')
  const st11am = serviceTypes?.find(s => s.slug === 'sunday-11am')

  if (!st9am || !st11am) throw new Error('Service types not found — run migration 017')

  const formatName = (label: string) => {
    const d = new Date(today + 'T12:00:00')
    const month = d.toLocaleDateString('en-US', { month: 'long' })
    const day   = d.getDate()
    const year  = d.getFullYear()
    return `${label} · ${month} ${day}, ${year}`
  }

  // Get-or-create 9am event (check first to avoid constraint dependency)
  const { data: existing9am } = await supabase
    .from('events').select('id').eq('service_type_id', st9am.id).eq('event_date', today).maybeSingle()

  let event9amId: string
  if (existing9am) {
    event9amId = existing9am.id
  } else {
    const { data: new9am, error } = await supabase
      .from('events')
      .insert({ service_type_id: st9am.id, name: formatName('Sunday 9:00 AM'), event_date: today, event_time: '09:00:00', legacy_sunday_id: sundayId })
      .select('id').single()
    if (error) throw error
    event9amId = new9am.id
  }

  // Get-or-create 11am event
  const { data: existing11am } = await supabase
    .from('events').select('id').eq('service_type_id', st11am.id).eq('event_date', today).maybeSingle()

  if (!existing11am) {
    await supabase
      .from('events')
      .insert({ service_type_id: st11am.id, name: formatName('Sunday 11:00 AM'), event_date: today, event_time: '11:00:00', legacy_sunday_id: sundayId })
  }

  // Return the 9am event as default session
  const defaultSession = await getEventById(event9amId)
  if (!defaultSession) throw new Error('Failed to load created event')

  return { defaultSession, sundayDate: today }
}

// ── Legacy helpers (kept for transition; used by App.tsx focus logic) ─────────

export async function getSundayByDate(date: string): Promise<{ id: string; date: string } | null> {
  const { data } = await supabase
    .from('sundays')
    .select('id, date')
    .eq('date', date)
    .maybeSingle()
  return data
}

/** @deprecated Use getFirstEventForDate instead */
export async function getSpecialEventByDate(date: string) {
  const { data } = await supabase
    .from('special_events')
    .select('*')
    .eq('event_date', date)
    .maybeSingle()
  return data
}

/**
 * Create a new special event — inserts into both special_events (for legacy
 * EventChecklist/issues compat) and events (for sidebar navigation).
 * If templateId is provided, seeds event_checklist_items from the template.
 * Returns the new events.id so the caller can navigate to it.
 */
export async function createSpecialEvent(opts: {
  name: string
  event_date: string
  event_time: string | null
  notes?: string | null
  templateId?: string | null
}): Promise<string> {
  // Look up the 'special' service type
  const { data: st, error: stErr } = await supabase
    .from('service_types')
    .select('id')
    .eq('slug', 'special')
    .single()
  if (stErr || !st) throw new Error('Special service type not found')

  // Insert into special_events (legacy — needed for EventChecklist)
  const { data: se, error: seErr } = await supabase
    .from('special_events')
    .insert({
      name:       opts.name,
      event_date: opts.event_date,
      event_time: opts.event_time,
      notes:      opts.notes ?? null,
    })
    .select('id')
    .single()
  if (seErr || !se) throw seErr ?? new Error('Failed to create special event')

  // Insert into events (unified model — required for sidebar nav)
  const { data: ev, error: evErr } = await supabase
    .from('events')
    .insert({
      service_type_id:       st.id,
      name:                  opts.name,
      event_date:            opts.event_date,
      event_time:            opts.event_time,
      legacy_special_event_id: se.id,
    })
    .select('id')
    .single()
  if (evErr || !ev) throw evErr ?? new Error('Failed to create events row')

  // If a template was selected, seed checklist items and link template
  if (opts.templateId) {
    // Update special_events.template_id
    await supabase
      .from('special_events')
      .update({ template_id: opts.templateId })
      .eq('id', se.id)

    // Load template items
    const { data: templateItems } = await supabase
      .from('event_template_items')
      .select('*')
      .eq('template_id', opts.templateId)
      .order('sort_order')

    if (templateItems && templateItems.length > 0) {
      await supabase.from('event_checklist_items').insert(
        templateItems.map((ti: {
          id: string
          source_checklist_item_id: number | null
          label: string
          section: string
          subsection: string | null
          item_notes: string | null
          sort_order: number | null
        }, idx: number) => ({
          event_id:                 se.id,
          source_template_item_id:  ti.id,
          source_checklist_item_id: ti.source_checklist_item_id,
          label:                    ti.label,
          section:                  ti.section,
          subsection:               ti.subsection,
          item_notes:               ti.item_notes,
          sort_order:               ti.sort_order ?? idx,
        }))
      )
    }
  }

  return ev.id
}

/** @deprecated Use getOrCreateTodayEvents instead */
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
