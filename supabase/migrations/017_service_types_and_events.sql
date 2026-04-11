-- ─────────────────────────────────────────────────────────────────────────────
-- 017_service_types_and_events.sql
--
-- Introduces the unified event model:
--   service_types  — defines the kinds of services (9am, 11am, special, etc.)
--   events         — every service instance, replacing the split between
--                    `sundays` (two services per date) and `special_events`.
--
-- Migration strategy: non-destructive.
--   • sundays and special_events tables stay in place.
--   • All existing operational tables (attendance, issues, etc.) keep their
--     current sunday_id / event_id columns — data screens keep working.
--   • events.legacy_sunday_id and events.legacy_special_event_id are the
--     bridge: the app derives the correct legacy ID from the active event and
--     passes it to data queries unchanged.
--   • Destructive cleanup (dropping sundays, removing legacy columns) comes
--     in a later migration once all screens are event-native.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── service_types ─────────────────────────────────────────────────────────────

create table if not exists public.service_types (
  id                   uuid        primary key default gen_random_uuid(),
  name                 text        not null,
  slug                 text        unique not null,
  pco_service_type_id  text,                        -- set when linked to PCO
  color                text        not null default '#3b82f6',
  sort_order           int         not null default 0,
  created_at           timestamptz not null default now()
);

comment on table  public.service_types              is 'Defines the kinds of services (9am, 11am, special, etc.)';
comment on column public.service_types.slug         is 'URL-safe identifier, e.g. sunday-9am';
comment on column public.service_types.pco_service_type_id is 'Planning Center service type ID for sync';

-- Seed the three initial service types
insert into public.service_types (name, slug, color, sort_order) values
  ('Sunday 9:00 AM',  'sunday-9am',  '#3b82f6', 0),
  ('Sunday 11:00 AM', 'sunday-11am', '#8b5cf6', 1),
  ('Special Events',  'special',     '#f59e0b', 2)
on conflict (slug) do nothing;

-- ── events ────────────────────────────────────────────────────────────────────

create table if not exists public.events (
  id                      uuid        primary key default gen_random_uuid(),
  service_type_id         uuid        not null references public.service_types(id),
  pco_plan_id             text,                        -- set when synced from PCO
  name                    text        not null,
  event_date              date        not null,
  event_time              time,
  notes                   text,

  -- ── Backward-compat bridges (kept until data tables are event-native) ───────
  -- For sunday-9am and sunday-11am events: points to the sundays row
  legacy_sunday_id        uuid        references public.sundays(id) on delete set null,
  -- For special events: points to the original special_events row
  legacy_special_event_id uuid        references public.special_events(id) on delete set null,

  created_at              timestamptz not null default now()
);

comment on table  public.events                          is 'Every service instance — replaces sundays + special_events in the nav layer';
comment on column public.events.legacy_sunday_id         is 'Temporary: links 9am/11am events back to sundays.id for data queries';
comment on column public.events.legacy_special_event_id  is 'Temporary: links special events back to special_events.id for data queries';

create index if not exists events_date_idx            on public.events(event_date desc);
create index if not exists events_service_type_idx    on public.events(service_type_id, event_date desc);
create index if not exists events_legacy_sunday_idx   on public.events(legacy_sunday_id) where legacy_sunday_id is not null;

-- RLS: same open-access pattern as other operational tables
alter table public.service_types enable row level security;
alter table public.events         enable row level security;

create policy "public_read_service_types" on public.service_types
  for select using (true);

create policy "public_all_events" on public.events
  for all using (true) with check (true);

-- Grants: anon/authenticated need DML access (RLS alone is not enough)
grant select                          on public.service_types to anon, authenticated;
grant select, insert, update, delete  on public.events         to anon, authenticated;

-- ── Populate events from sundays (9am + 11am per Sunday) ─────────────────────

do $$
declare
  st_9am  uuid;
  st_11am uuid;
begin
  select id into st_9am  from public.service_types where slug = 'sunday-9am';
  select id into st_11am from public.service_types where slug = 'sunday-11am';

  -- 9:00 AM services
  insert into public.events
    (service_type_id, name, event_date, event_time, legacy_sunday_id)
  select
    st_9am,
    'Sunday 9:00 AM · '
      || trim(to_char(s.date, 'Month')) || ' '
      || extract(day  from s.date)::int || ', '
      || extract(year from s.date)::int,
    s.date,
    '09:00'::time,
    s.id
  from public.sundays s
  on conflict do nothing;

  -- 11:00 AM services
  insert into public.events
    (service_type_id, name, event_date, event_time, legacy_sunday_id)
  select
    st_11am,
    'Sunday 11:00 AM · '
      || trim(to_char(s.date, 'Month')) || ' '
      || extract(day  from s.date)::int || ', '
      || extract(year from s.date)::int,
    s.date,
    '11:00'::time,
    s.id
  from public.sundays s
  on conflict do nothing;
end $$;

-- ── Populate events from special_events ──────────────────────────────────────

do $$
declare
  st_special uuid;
begin
  select id into st_special from public.service_types where slug = 'special';

  insert into public.events
    (service_type_id, name, event_date, event_time, notes, legacy_special_event_id)
  select
    st_special,
    se.name,
    se.event_date,
    se.event_time,
    se.notes,
    se.id
  from public.special_events se
  on conflict do nothing;
end $$;
