-- ─────────────────────────────────────────────────────────────────────────────
-- 033_drop_sunday_uniqueness.sql
--
-- The partial unique indexes added in migration 027 prevent more than one
-- 9am or 11am event per date.  That was fine when PCO created events
-- automatically (one plan → one event), but now all events are created
-- manually in Sunday Ops and multiple services of the same type can exist
-- on the same date (Easter weekend, extra traditional services, etc.).
--
-- Drop both indexes.  There is no longer any unique constraint on Sunday
-- services — event identity is the events.id UUID.
-- ─────────────────────────────────────────────────────────────────────────────

drop index if exists public.events_9am_date_unique;
drop index if exists public.events_11am_date_unique;
