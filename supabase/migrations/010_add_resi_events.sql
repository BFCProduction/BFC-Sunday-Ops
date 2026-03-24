-- Per-service RESI stream analytics (one row per service per Sunday)
create table if not exists resi_events (
  id                uuid        primary key default gen_random_uuid(),
  sunday_id         uuid        not null references sundays(id) on delete cascade,
  service_name      text        not null,   -- 'Traditional' | 'Contemporary'
  service_time      text,                   -- '9:00 AM' | '11:00 AM'
  unique_viewers    integer,
  total_views       integer,
  peak_concurrent   integer,
  avg_watch_seconds integer,
  pulled_at         timestamptz not null default now(),
  unique(sunday_id, service_name)
);

alter table resi_events enable row level security;
create policy "public_all" on resi_events for all using (true) with check (true);

-- Sunday-level RESI rollup column on the existing stream_analytics table
alter table stream_analytics add column if not exists resi_unique_total integer;
