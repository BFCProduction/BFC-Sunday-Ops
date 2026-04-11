-- 014_add_special_events.sql
-- Adds special event support: templates, events, event checklists, and
-- event_id columns on all operational tables so events get the same
-- data coverage as regular Sundays.

-- ── Event Templates ──────────────────────────────────────────────────────────
-- A named, reusable blueprint for an event's checklist.

create table event_templates (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  notes      text,
  created_at timestamptz not null default now()
);

-- Items that belong to a template. source_checklist_item_id links to an
-- existing Sunday checklist_items row (promoted items); null means the
-- item is custom and only exists on this template.

create table event_template_items (
  id                       uuid    primary key default gen_random_uuid(),
  template_id              uuid    not null references event_templates(id) on delete cascade,
  source_checklist_item_id integer references checklist_items(id) on delete set null,
  label                    text    not null,
  section                  text    not null,
  subsection               text,
  item_notes               text,
  sort_order               integer not null default 0,
  created_at               timestamptz not null default now()
);

create index event_template_items_template_idx on event_template_items(template_id, sort_order);

-- ── Special Events ───────────────────────────────────────────────────────────

create table special_events (
  id          uuid    primary key default gen_random_uuid(),
  name        text    not null,
  event_date  date    not null,
  event_time  time,                            -- optional; used for display only
  template_id uuid    references event_templates(id) on delete set null,
  notes       text,
  created_at  timestamptz not null default now()
);

create index special_events_date_idx on special_events(event_date desc);

-- ── Per-event Checklist ───────────────────────────────────────────────────────
-- Items are snapshotted from the template at event creation time so later
-- template changes don't affect already-created events.

create table event_checklist_items (
  id                       uuid    primary key default gen_random_uuid(),
  event_id                 uuid    not null references special_events(id) on delete cascade,
  source_template_item_id  uuid    references event_template_items(id) on delete set null,
  source_checklist_item_id integer references checklist_items(id) on delete set null,
  label                    text    not null,
  section                  text    not null,
  subsection               text,
  item_notes               text,
  sort_order               integer not null default 0,
  created_at               timestamptz not null default now()
);

create index event_checklist_items_event_idx on event_checklist_items(event_id, sort_order);

-- Completions mirror the Sunday checklist_completions pattern.

create table event_checklist_completions (
  id           uuid   primary key default gen_random_uuid(),
  event_id     uuid   not null references special_events(id) on delete cascade,
  item_id      uuid   not null references event_checklist_items(id) on delete cascade,
  initials     text   not null,
  completed_at timestamptz not null default now(),
  unique(event_id, item_id)
);

create index event_checklist_completions_event_idx on event_checklist_completions(event_id);

-- ── RLS on new tables ────────────────────────────────────────────────────────

alter table event_templates              enable row level security;
alter table event_template_items         enable row level security;
alter table special_events               enable row level security;
alter table event_checklist_items        enable row level security;
alter table event_checklist_completions  enable row level security;

create policy "public_all" on event_templates             for all using (true) with check (true);
create policy "public_all" on event_template_items        for all using (true) with check (true);
create policy "public_all" on special_events              for all using (true) with check (true);
create policy "public_all" on event_checklist_items       for all using (true) with check (true);
create policy "public_all" on event_checklist_completions for all using (true) with check (true);

-- ── Add event_id to operational tables ───────────────────────────────────────
-- All existing rows keep their sunday_id; event_id stays null for them.
-- New event rows will have event_id set and sunday_id null.

-- issues ─────────────────────────────────────────────────────────────────────
alter table issues
  alter column sunday_id drop not null;

alter table issues
  add column event_id uuid references special_events(id) on delete cascade;

alter table issues
  add constraint issues_has_session
  check (sunday_id is not null or event_id is not null);

-- attendance ──────────────────────────────────────────────────────────────────
alter table attendance
  alter column sunday_id drop not null;

alter table attendance
  drop constraint if exists attendance_sunday_id_key;

alter table attendance
  add column event_id uuid references special_events(id) on delete cascade;

alter table attendance
  add constraint attendance_has_session
  check (sunday_id is not null or event_id is not null);

-- One attendance row per Sunday (when no event_id).
create unique index attendance_sunday_unique
  on attendance(sunday_id) where event_id is null;

-- One attendance row per event (when no sunday_id).
create unique index attendance_event_unique
  on attendance(event_id) where sunday_id is null;

-- loudness ────────────────────────────────────────────────────────────────────
alter table loudness
  alter column sunday_id drop not null;

alter table loudness
  drop constraint if exists loudness_sunday_id_key;

alter table loudness
  add column event_id uuid references special_events(id) on delete cascade;

alter table loudness
  add constraint loudness_has_session
  check (sunday_id is not null or event_id is not null);

create unique index loudness_sunday_unique
  on loudness(sunday_id) where event_id is null;

create unique index loudness_event_unique
  on loudness(event_id) where sunday_id is null;

-- weather ─────────────────────────────────────────────────────────────────────
alter table weather
  alter column sunday_id drop not null;

alter table weather
  drop constraint if exists weather_sunday_id_key;

alter table weather
  add column event_id uuid references special_events(id) on delete cascade;

alter table weather
  add constraint weather_has_session
  check (sunday_id is not null or event_id is not null);

create unique index weather_sunday_unique
  on weather(sunday_id) where event_id is null;

create unique index weather_event_unique
  on weather(event_id) where sunday_id is null;

-- evaluations ─────────────────────────────────────────────────────────────────
-- NOTE: evaluations was redesigned (see README); sunday_id is text not null,
-- no unique constraint, no FK. Multiple submissions per session are allowed.

alter table evaluations
  alter column sunday_id drop not null;

alter table evaluations
  add column event_id uuid references special_events(id) on delete cascade;

-- runtime_values ──────────────────────────────────────────────────────────────
alter table runtime_values
  alter column sunday_id drop not null;

alter table runtime_values
  drop constraint if exists runtime_values_sunday_id_field_id_key;

alter table runtime_values
  add column event_id uuid references special_events(id) on delete cascade;

alter table runtime_values
  add constraint runtime_values_has_session
  check (sunday_id is not null or event_id is not null);

-- One value per (sunday, field) and one value per (event, field).
create unique index runtime_values_sunday_unique
  on runtime_values(sunday_id, field_id) where event_id is null;

create unique index runtime_values_event_unique
  on runtime_values(event_id, field_id) where sunday_id is null;

-- service_records ─────────────────────────────────────────────────────────────
alter table service_records
  add column event_id uuid references special_events(id) on delete set null;

create index service_records_event_idx on service_records(event_id);
