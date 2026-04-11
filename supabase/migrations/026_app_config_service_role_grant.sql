-- ─────────────────────────────────────────────────────────────────────────────
-- 026_app_config_service_role_grant.sql
--
-- app_config has no explicit service_role grant. pco-sync writes the
-- pco_last_synced timestamp there and needs DML access.
-- ─────────────────────────────────────────────────────────────────────────────

grant all on public.app_config to service_role;
