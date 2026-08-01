-- 060_monday_sync_legacy_insert_compat.sql
--
-- The frontend deployed before migration 059 explicitly inserts
-- `pushed_to_monday: false` for every new issue. Preserve that narrow legacy
-- write until the automatic-mirroring frontend is deployed. The authoritative
-- sync status, item id, attempt token, error, and timestamps remain unavailable
-- to browser roles.

grant insert (pushed_to_monday)
  on table public.issues
  to anon, authenticated;
