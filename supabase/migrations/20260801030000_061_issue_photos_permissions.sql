-- Make the permissions explicit for the issue photo table.
--
-- The browser uses the anon/authenticated roles for photo management, while
-- server-side integrations use service_role to read photo paths. The table's
-- existing public_all RLS policy remains the row-level authorization rule.
grant select, insert, update, delete on table public.issue_photos to anon, authenticated;
grant all on table public.issue_photos to service_role;
