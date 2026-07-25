-- 047_workbook_crew.sql
--
-- Phase 2: the crew roster for a workbook. Each row is a person (real PCO user,
-- a manually-entered guest, or an open/TBD slot) working a given day, with a
-- role, call time, and release time. is_paid is stored now (defaulting from the
-- role) but pay math and financial visibility come later, behind the Phase 3
-- security hardening.

create table if not exists public.workbook_crew (
  id             uuid        primary key default gen_random_uuid(),
  workbook_id    uuid        not null references public.workbooks(id) on delete cascade,
  event_id       uuid        references public.events(id) on delete set null,
  scheduled_date date        not null,
  user_id        uuid        references public.users(id) on delete set null,
  person_name    text,
  is_open        boolean     not null default false,
  role_id        uuid        references public.roles(id) on delete set null,
  call_time      time,
  release_time   time,
  is_paid        boolean     not null default false,
  sort_order     integer     not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (is_open or user_id is not null or person_name is not null)
);

create index if not exists workbook_crew_workbook_idx on public.workbook_crew(workbook_id, scheduled_date);
create index if not exists workbook_crew_event_idx on public.workbook_crew(event_id);

alter table public.workbook_crew enable row level security;

create policy "public_all" on public.workbook_crew for all using (true) with check (true);

grant select, insert, update, delete on public.workbook_crew to anon, authenticated;
grant all on public.workbook_crew to service_role;
