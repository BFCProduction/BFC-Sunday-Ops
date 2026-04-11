-- ─────────────────────────────────────────────────────────────────────────────
-- 024_service_types_service_role_grant.sql
--
-- Migration 017 granted service_types to anon and authenticated but not
-- service_role. Edge functions (pco-sync, etc.) run as service_role and need
-- explicit table access — as established by the pattern in migration 015.
-- ─────────────────────────────────────────────────────────────────────────────

grant all on public.service_types to service_role;
