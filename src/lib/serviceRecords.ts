import { supabase } from './supabase'

type Fields = Partial<{
  in_person_attendance: number | null
  service_run_time_secs: number | null
  message_run_time_secs: number | null
  stage_flip_time_secs: number | null
  max_db_a_slow: number | null
  la_eq_15: number | null
  max_db_c_slow: number | null
  lc_eq_15: number | null
}>

/**
 * Upsert a partial service_records row.
 *
 * Handles regular Sunday services (sunday-9am / sunday-11am) and special events
 * (serviceTypeSlug === 'special') in one place. Event identity is authoritative:
 * if an event_id is available we update that row first. Date/type matching is
 * kept only to attach pre-migration service_records rows during the transition.
 *
 * Silently returns without writing if the slug is unrecognised or if a
 * special event is missing its label.
 */
export async function syncToServiceRecords({
  eventId,
  serviceTypeSlug,
  sundayId,
  sessionDate,
  eventName,
  fields,
}: {
  eventId?: string | null
  serviceTypeSlug: string
  sundayId: string | null
  sessionDate: string
  eventName: string | null
  fields: Fields
}): Promise<void> {
  const isSpecial = serviceTypeSlug === 'special'

  const serviceType =
    serviceTypeSlug === 'sunday-9am'  ? 'regular_9am'  :
    serviceTypeSlug === 'sunday-11am' ? 'regular_11am' :
    isSpecial                          ? 'special'      : null

  if (!serviceType) return
  if (isSpecial && !eventName) return  // label is required for specials

  const baseRow = {
    service_date: sessionDate,
    service_type: serviceType,
    sunday_id:    isSpecial ? null : (sundayId || null),
    service_label: isSpecial ? eventName : null,
  }

  const linkFields = eventId ? { event_id: eventId } : {}

  if (eventId) {
    const { data: existingByEvent, error: eventFindError } = await supabase
      .from('service_records')
      .select('id')
      .eq('event_id', eventId)
      .maybeSingle()
    if (eventFindError) throw eventFindError

    if (existingByEvent) {
      const { error } = await supabase
        .from('service_records')
        .update({ ...baseRow, ...fields, ...linkFields })
        .eq('id', existingByEvent.id)
      if (error) throw error
      return
    }
  }

  // Temporary legacy attach path: if the old date/type row exists, claim it for
  // this event instead of inserting a duplicate analytics record.
  let q = supabase
    .from('service_records')
    .select('id')
    .eq('service_date', sessionDate)
    .eq('service_type', serviceType)
    .is('event_id', null)
  if (isSpecial) q = q.eq('service_label', eventName!)

  const { data: legacyMatches, error: findError } = await q.limit(1)
  if (findError) throw findError

  const existing = legacyMatches?.[0] ?? null

  if (existing) {
    const { error } = await supabase
      .from('service_records')
      .update({ ...baseRow, ...fields, ...linkFields })
      .eq('id', existing.id)
    if (error) throw error
  } else {
    const { error } = await supabase.from('service_records').insert({
      ...baseRow,
      ...linkFields,
      ...fields,
    })
    if (error) throw error
  }
}
