-- ─────────────────────────────────────────────────────────────────────────────
-- 019_grant_events_permissions.sql
--
-- Grants DML permissions to anon and authenticated roles for the tables
-- created in migration 017. Without these, the Supabase JS client (which
-- uses the anon key) cannot read service_types or events even with permissive
-- RLS policies in place.
-- ─────────────────────────────────────────────────────────────────────────────

grant select                           on public.service_types to anon, authenticated;
grant select, insert, update, delete   on public.events         to anon, authenticated;
