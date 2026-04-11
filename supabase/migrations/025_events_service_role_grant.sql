-- ─────────────────────────────────────────────────────────────────────────────
-- 025_events_service_role_grant.sql
--
-- Migration 017 granted events to anon/authenticated but not service_role.
-- pco-sync upserts into events as service_role and needs explicit access.
-- ─────────────────────────────────────────────────────────────────────────────

grant all on public.events to service_role;
