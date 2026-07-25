-- 045_production_config.sql
--
-- Phase 0 of the Workbook v2 plan: account-level reference data ("Production
-- Config") managed in Settings. Workbooks and their future sub-tools reference
-- these by id:
--   Places  → locations
--   Config  → departments, roles (+ hourly rate), schedule_item_types
-- (Assets / "Things" come in a later phase.)
--
-- This migration also:
--   * makes the schedule item `type` a managed, extensible list instead of a
--     fixed CHECK-constrained enum, and
--   * unifies location references onto the account-level `locations` table,
--     replacing the per-workbook `workbook_locations` table.

-- ── Locations (Places) ────────────────────────────────────────────────────────
create table if not exists public.locations (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  sort_order  integer     not null default 0,
  created_at  timestamptz not null default now(),
  unique (name)
);

-- ── Departments ───────────────────────────────────────────────────────────────
create table if not exists public.departments (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  sort_order  integer     not null default 0,
  created_at  timestamptz not null default now(),
  unique (name)
);

-- ── Roles (+ hourly rate + paid/volunteer default) ────────────────────────────
-- NOTE: hourly_rate is financial data. It currently sits under the same
-- permissive client RLS as the rest of the app. Before real crew pay is
-- computed or exposed, roles must move behind the Phase 3 security hardening
-- (route reads/writes through an Edge Function that verifies the PCO session).
create table if not exists public.roles (
  id              uuid         primary key default gen_random_uuid(),
  name            text         not null,
  hourly_rate     numeric(8,2) not null default 0,
  is_paid_default boolean      not null default false,
  sort_order      integer      not null default 0,
  created_at      timestamptz  not null default now(),
  unique (name)
);

-- ── Schedule item types (managed / extensible) ────────────────────────────────
create table if not exists public.schedule_item_types (
  id          uuid        primary key default gen_random_uuid(),
  key         text        not null,
  label       text        not null,
  icon        text,
  color       text,
  sort_order  integer     not null default 0,
  created_at  timestamptz not null default now(),
  unique (key)
);

-- ── Seed data ─────────────────────────────────────────────────────────────────
insert into public.locations (name, sort_order) values
  ('Sanctuary', 0),
  ('Atrium', 1),
  ('Chapel', 2),
  ('FLC Worship Room', 3),
  ('Floyd Center Great Room', 4)
on conflict (name) do nothing;

insert into public.departments (name, sort_order) values
  ('Audio', 0),
  ('Video', 1),
  ('Lighting', 2),
  ('Staging', 3),
  ('Broadcast / Stream', 4),
  ('Production', 5)
on conflict (name) do nothing;

insert into public.roles (name, hourly_rate, is_paid_default, sort_order) values
  ('A1', 0, false, 0),
  ('A2', 0, false, 1),
  ('Video TD', 0, false, 2),
  ('Camera', 0, false, 3),
  ('Lighting', 0, false, 4),
  ('Stage Manager', 0, false, 5),
  ('Utility', 0, false, 6)
on conflict (name) do nothing;

insert into public.schedule_item_types (key, label, icon, color, sort_order) values
  ('call',        'Call time',          'bell',             'gray',  0),
  ('rehearsal',   'Rehearsal',          'music',            'blue',  1),
  ('meal',        'Crew meal',          'tools-kitchen-2',  'amber', 2),
  ('meeting',     'Production meeting',  'users',            'gray',  3),
  ('programming', 'Programming',         'adjustments',      'teal',  4),
  ('transition',  'Stage transition',    'arrows-exchange',  'teal',  5),
  ('load_in',     'Load-in',             'arrow-up-circle',  'teal',  6),
  ('strike',      'Strike',              'arrow-down-circle','teal',  7),
  ('task',        'Task',                'checkbox',         'gray',  8)
on conflict (key) do nothing;

-- ── Make the schedule item type extensible ────────────────────────────────────
alter table public.workbook_schedule_items
  drop constraint if exists workbook_schedule_items_item_type_check;

-- ── Unify locations onto the account-level table ──────────────────────────────
-- Null the nascent per-workbook location references before repointing the
-- foreign keys off `workbook_locations`.
update public.workbook_schedule_items set location_id = null where location_id is not null;
update public.events set workbook_location_id = null where workbook_location_id is not null;

alter table public.workbook_schedule_items
  drop constraint if exists workbook_schedule_items_location_id_fkey;
alter table public.workbook_schedule_items
  add constraint workbook_schedule_items_location_id_fkey
    foreign key (location_id) references public.locations(id) on delete set null;

alter table public.events
  drop constraint if exists events_workbook_location_id_fkey;
alter table public.events
  add constraint events_workbook_location_id_fkey
    foreign key (workbook_location_id) references public.locations(id) on delete set null;

-- Link-validation triggers no longer check locations against a workbook
-- (account locations are global). Keep the event-belongs-to-workbook checks.
create or replace function public.validate_workbook_schedule_item_links()
returns trigger
language plpgsql
as $$
begin
  if new.event_id is not null and not exists (
    select 1
      from public.events event_row
     where event_row.id = new.event_id
       and event_row.workbook_id = new.workbook_id
  ) then
    raise exception 'Schedule item event must belong to its workbook';
  end if;
  return new;
end;
$$;

create or replace function public.validate_workbook_event_location()
returns trigger
language plpgsql
as $$
begin
  if old.workbook_id is distinct from new.workbook_id then
    update public.workbook_schedule_items
       set event_id = null,
           updated_at = now()
     where event_id = new.id;
  end if;
  return new;
end;
$$;

-- The per-workbook locations table is replaced by account-level locations.
drop table if exists public.workbook_locations cascade;

-- ── Indexes ───────────────────────────────────────────────────────────────────
create index if not exists locations_sort_idx           on public.locations(sort_order, name);
create index if not exists departments_sort_idx          on public.departments(sort_order, name);
create index if not exists roles_sort_idx                on public.roles(sort_order, name);
create index if not exists schedule_item_types_sort_idx  on public.schedule_item_types(sort_order, label);

-- ── RLS + grants (matches the current client-managed pattern; will move behind
--    the Phase 3 security hardening) ─────────────────────────────────────────
alter table public.locations           enable row level security;
alter table public.departments         enable row level security;
alter table public.roles               enable row level security;
alter table public.schedule_item_types enable row level security;

create policy "public_all" on public.locations           for all using (true) with check (true);
create policy "public_all" on public.departments         for all using (true) with check (true);
create policy "public_all" on public.roles               for all using (true) with check (true);
create policy "public_all" on public.schedule_item_types for all using (true) with check (true);

grant select, insert, update, delete on public.locations           to anon, authenticated;
grant select, insert, update, delete on public.departments         to anon, authenticated;
grant select, insert, update, delete on public.roles               to anon, authenticated;
grant select, insert, update, delete on public.schedule_item_types to anon, authenticated;
grant all on public.locations           to service_role;
grant all on public.departments         to service_role;
grant all on public.roles               to service_role;
grant all on public.schedule_item_types to service_role;
