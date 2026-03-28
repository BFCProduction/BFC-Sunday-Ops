-- service_records: one row per service per Sunday.
-- This is the single source of truth for analytics. It replaces the
-- standalone attendance, loudness, stream_analytics, weather, and
-- resi_events tables for reporting purposes. Those tables remain
-- intact during the transition period.
--
-- service_type values:
--   'regular_9am'  -- standard 9:00 AM service
--   'regular_11am' -- standard 11:00 AM service
--   'special'      -- Easter, Christmas Eve, year-end single service, etc.
--
-- For special services, service_label is required and describes the
-- service (e.g. 'Easter · 8:00 AM', 'Christmas Eve · 6:00 PM').
-- For regular services, service_label is null.
--
-- Combined Attendance (computed, never stored) =
--   in_person_attendance + church_online_unique_viewers + youtube_unique_viewers
--
-- All durations are stored in seconds for easy arithmetic.
-- stage_flip_time_seconds is stored on the regular_9am row for a given Sunday.

create table if not exists service_records (
  id                                uuid        primary key default gen_random_uuid(),

  -- Identity
  service_date                      date        not null,
  service_type                      text        not null
    check (service_type in ('regular_9am', 'regular_11am', 'special')),
  service_label                     text,       -- required when service_type = 'special'
  sunday_id                         uuid        references sundays(id) on delete set null,

  -- Attendance
  in_person_attendance              integer,

  -- Church Online / RESI (same platform)
  church_online_views               integer,
  church_online_unique_viewers      integer,
  church_online_avg_watch_time_secs integer,    -- seconds

  -- YouTube
  youtube_unique_viewers            integer,

  -- Runtimes (seconds)
  service_run_time_secs             integer,
  message_run_time_secs             integer,
  stage_flip_time_secs              integer,    -- 9am row only; null on 11am and special rows

  -- Weather (Sunday-level; same value on both service rows for a given day)
  weather_temp_f                    numeric(4,1),
  weather_condition                 text,

  -- Loudness — A-weighted (existing columns)
  max_db_a_slow                     numeric(5,1),
  la_eq_15                          numeric(5,1),

  -- Loudness — C-weighted (new columns; null for historical rows)
  max_db_c_slow                     numeric(5,1),
  lc_eq_15                          numeric(5,1),

  -- Bookkeeping
  created_at                        timestamptz not null default now(),
  updated_at                        timestamptz not null default now()
);

-- Regular services: one 9am and one 11am row per date.
create unique index service_records_regular_unique
  on service_records (service_date, service_type)
  where service_type in ('regular_9am', 'regular_11am');

-- Special services: unique per date + label (allows multiple specials on one day,
-- e.g. Easter 8:00 AM and Easter 9:30 AM, or three Christmas Eve services).
create unique index service_records_special_unique
  on service_records (service_date, service_label)
  where service_type = 'special';

-- Enforce that special rows always carry a label.
alter table service_records
  add constraint service_records_special_requires_label
  check (service_type != 'special' or service_label is not null);

-- Index for the most common analytics query pattern (date range scans).
create index service_records_date_idx on service_records (service_date desc);
create index service_records_type_date_idx on service_records (service_type, service_date desc);
create index service_records_sunday_idx on service_records (sunday_id);

-- Keep updated_at current automatically.
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger service_records_updated_at
  before update on service_records
  for each row execute function set_updated_at();

-- RLS
alter table service_records enable row level security;

-- Operators and analytics screens read freely (anon key).
create policy "public_read" on service_records
  for select using (true);

-- Writes go through the app (anon key) — same pattern as other operational tables.
-- Tighten to service-role-only once admin session edge function is extended to cover writes.
create policy "public_write" on service_records
  for insert with check (true);

create policy "public_update" on service_records
  for update using (true) with check (true);
