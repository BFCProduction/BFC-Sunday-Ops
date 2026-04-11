-- ─────────────────────────────────────────────────────────────────────────────
-- 018_events_unique_constraint.sql
--
-- Adds a unique constraint on (service_type_id, event_date) in the events
-- table, required for the upsert in getOrCreateTodayEvents to use
-- onConflict: 'service_type_id,event_date'.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.events
  add constraint events_service_type_date_unique
  unique (service_type_id, event_date);
