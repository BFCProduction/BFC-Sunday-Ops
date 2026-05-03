-- ─────────────────────────────────────────────────────────────────────────────
-- 043_include_in_analytics.sql
--
-- Adds include_in_analytics to events so individual events can opt in to the
-- Data Explorer and analytics screens.  Sunday services default to true;
-- everything else defaults to false and gets opted in at creation time.
--
-- Also rebuilds analytics_records to filter to opted-in events (plus legacy
-- service_records rows with no event_id, which predate the events model and
-- should remain visible for historical continuity).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS include_in_analytics boolean NOT NULL DEFAULT false;

-- Existing Sunday services are analytics events.
UPDATE public.events e
SET include_in_analytics = true
FROM public.service_types st
WHERE e.service_type_id = st.id
  AND st.slug IN ('sunday-9am', 'sunday-11am');

-- Rebuild analytics_records: only include opted-in events plus orphaned legacy rows.
CREATE OR REPLACE VIEW public.analytics_records AS
  SELECT
    sr.id::text AS id,
    sr.service_date,
    CASE sr.service_type
      WHEN 'regular_9am'  THEN 'sunday-9am'
      WHEN 'regular_11am' THEN 'sunday-11am'
      ELSE sr.service_type
    END AS service_type,
    sr.service_label,
    sr.in_person_attendance,
    sr.church_online_views,
    sr.church_online_unique_viewers,
    sr.church_online_avg_watch_time_secs,
    sr.youtube_unique_viewers,
    sr.service_run_time_secs,
    sr.message_run_time_secs,
    sr.stage_flip_time_secs,
    sr.weather_temp_f,
    sr.weather_condition,
    sr.max_db_a_slow,
    sr.la_eq_15,
    sr.max_db_c_slow,
    sr.lc_eq_15,
    sr.event_id::text AS event_id,
    e.name AS event_name,
    e.event_time,
    COALESCE(st.name, sr.service_label) AS service_type_label,
    sr.service_type AS service_record_type
  FROM public.service_records sr
  LEFT JOIN public.events e ON e.id = sr.event_id
  LEFT JOIN public.service_types st ON st.id = e.service_type_id
  WHERE sr.event_id IS NULL
     OR e.include_in_analytics = true;

GRANT SELECT ON public.analytics_records TO anon, authenticated, service_role;
