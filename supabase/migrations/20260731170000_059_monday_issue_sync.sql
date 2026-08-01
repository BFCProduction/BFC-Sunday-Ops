-- 059_monday_issue_sync.sql
--
-- Add durable Monday.com delivery state to issues. New issues start pending so
-- the browser can save the Sunday Ops record before attempting the external
-- mirror. Existing issues that were never pushed remain explicitly historical
-- (`not_requested`) rather than becoming an automatic backlog.
--
-- Sync-control columns are service-role managed. Operators retain the existing
-- issue capture and resolution fields, but direct anon requests cannot forge a
-- successful sync, overwrite an external item id, or steal an active attempt.

alter table public.issues
  add column if not exists monday_sync_status text not null default 'pending',
  add column if not exists monday_sync_error text,
  add column if not exists monday_sync_attempt_id uuid,
  add column if not exists monday_sync_started_at timestamptz,
  add column if not exists monday_sync_attempted_at timestamptz,
  add column if not exists monday_synced_at timestamptz;

alter table public.issues
  drop constraint if exists issues_monday_sync_status_check;

alter table public.issues
  add constraint issues_monday_sync_status_check
  check (monday_sync_status in ('not_requested', 'pending', 'syncing', 'synced', 'failed'));

update public.issues
set monday_sync_status = case
      when pushed_to_monday = true or monday_item_id is not null then 'synced'
      else 'not_requested'
    end,
    monday_synced_at = case
      when pushed_to_monday = true or monday_item_id is not null then created_at
      else null
    end,
    monday_sync_error = null,
    monday_sync_attempt_id = null,
    monday_sync_started_at = null,
    monday_sync_attempted_at = null;

create index if not exists issues_monday_sync_queue_idx
  on public.issues(monday_sync_status, created_at)
  where monday_sync_status in ('pending', 'syncing', 'failed');

comment on column public.issues.monday_sync_status is
  'Server-managed Monday mirror state: not_requested, pending, syncing, synced, or failed.';
comment on column public.issues.monday_sync_error is
  'User-safe error from the latest failed Monday mirror attempt.';
comment on column public.issues.monday_sync_attempt_id is
  'Server-generated claim token preventing concurrent duplicate mirror attempts.';

-- Replace whole-table anon INSERT/UPDATE privileges with the exact operational
-- fields the browser currently needs. SELECT and DELETE remain unchanged for
-- this containment release and are addressed by the broader permissions plan.
revoke insert, update on table public.issues from anon, authenticated;

grant insert (
  sunday_id,
  event_id,
  title,
  description,
  severity,
  created_at,
  resolved_at
) on table public.issues to anon, authenticated;

grant update (
  sunday_id,
  event_id,
  title,
  description,
  severity,
  resolved_at
) on table public.issues to anon, authenticated;

grant all on table public.issues to service_role;
