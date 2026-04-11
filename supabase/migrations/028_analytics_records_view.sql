-- ─────────────────────────────────────────────────────────────────────────────
-- 028_analytics_records_view.sql
--
-- Creates analytics_records: a thin view over service_records that remaps
-- the legacy service_type enum values to the new slug format used by the
-- service_types table.  Analytics screens query this view instead of
-- service_records directly, so they speak the same language as the rest of
-- the new events model.
--
-- service_type values exposed by this view:
--   'sunday-9am'   (was 'regular_9am' in service_records)
--   'sunday-11am'  (was 'regular_11am' in service_records)
--   'special'      (unchanged)
--
-- service_records remains the authoritative analytics store.  ServiceData
-- screens (LoudnessLog, etc.) continue to sync new entries there as they
-- always have, so data flows into Analytics automatically.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.analytics_records AS
  SELECT
    id::text  AS id,
    service_date,
    CASE service_type
      WHEN 'regular_9am'  THEN 'sunday-9am'
      WHEN 'regular_11am' THEN 'sunday-11am'
      ELSE service_type   -- 'special' is unchanged
    END       AS service_type,
    service_label,
    in_person_attendance,
    church_online_views,
    church_online_unique_viewers,
    church_online_avg_watch_time_secs,
    youtube_unique_viewers,
    service_run_time_secs,
    message_run_time_secs,
    stage_flip_time_secs,
    weather_temp_f,
    weather_condition,
    max_db_a_slow,
    la_eq_15,
    max_db_c_slow,
    lc_eq_15
  FROM public.service_records;

-- ── Grant read access ─────────────────────────────────────────────────────────
GRANT SELECT ON public.analytics_records TO anon, authenticated, service_role;
