-- ─────────────────────────────────────────────────────────────────────────────
-- 038_event_scoped_summary_email_runs.sql
--
-- Summary emails are now sent one report per event/service instead of one
-- combined report per Sunday. Multiple events can share the same sunday_id,
-- so report_email_runs must track event_id as the idempotency key.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.report_email_runs
  add column if not exists event_id uuid references public.events(id) on delete cascade;

alter table public.report_email_runs
  alter column sunday_id drop not null;

alter table public.report_email_runs
  drop constraint if exists report_email_runs_sunday_id_key;

create unique index if not exists report_email_runs_event_id_unique
  on public.report_email_runs(event_id)
  where event_id is not null;

create unique index if not exists report_email_runs_legacy_sunday_unique
  on public.report_email_runs(sunday_id)
  where event_id is null and sunday_id is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'report_email_runs_has_scope'
      and conrelid = 'public.report_email_runs'::regclass
  ) then
    alter table public.report_email_runs
      add constraint report_email_runs_has_scope
      check (event_id is not null or sunday_id is not null);
  end if;
end $$;

create index if not exists report_email_runs_event_idx
  on public.report_email_runs(event_id);

grant all on public.report_email_runs to service_role;

grant select on public.sundays                         to service_role;
grant select on public.service_types                   to service_role;
grant select on public.events                          to service_role;
grant select on public.checklist_items                 to service_role;
grant select on public.checklist_completions           to service_role;
grant select on public.event_checklist_items           to service_role;
grant select on public.event_checklist_completions     to service_role;
grant select on public.issues                          to service_role;
grant select on public.attendance                      to service_role;
grant select on public.runtime_fields                  to service_role;
grant select on public.runtime_values                  to service_role;
grant select on public.loudness                        to service_role;
grant select on public.weather                         to service_role;
grant select on public.evaluations                     to service_role;
grant select on public.stream_analytics                to service_role;

insert into public.report_email_settings (
  key,
  enabled,
  send_day,
  send_time,
  timezone,
  sender_name,
  reply_to_email
) values (
  'default',
  true,
  0,
  '15:00',
  'America/Chicago',
  'BFC Sunday Ops',
  'production@bethanynaz.org'
) on conflict (key) do nothing;
