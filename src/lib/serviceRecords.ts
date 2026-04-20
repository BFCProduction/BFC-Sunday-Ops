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
 * Handles regular Sunday services (sunday-9am / sunday-11am) and special
 * events (serviceTypeSlug === 'special') in one place.  Special rows are
 * matched by (service_date, service_label) per the unique index in migration
 * 012; regular rows are matched by (service_date, service_type).
 *
 * Silently returns without writing if the slug is unrecognised or if a
 * special event is missing its label.
 */
export async function syncToServiceRecords({
  serviceTypeSlug,
  sundayId,
  sessionDate,
  eventName,
  fields,
}: {
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

  // Find existing row
  let q = supabase
    .from('service_records')
    .select('id')
    .eq('service_date', sessionDate)
    .eq('service_type', serviceType)
  if (isSpecial) q = q.eq('service_label', eventName!)

  const { data: existing } = await q.maybeSingle()

  if (existing) {
    await supabase.from('service_records').update(fields).eq('id', existing.id)
  } else {
    await supabase.from('service_records').insert({
      service_date: sessionDate,
      service_type: serviceType,
      sunday_id:    isSpecial ? null : (sundayId || null),
      service_label: isSpecial ? eventName : null,
      ...fields,
    })
  }
}
