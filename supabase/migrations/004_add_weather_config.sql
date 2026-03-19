create table if not exists weather_config (
  key text primary key default 'default',
  location_label text,
  zip_code text not null,
  pull_day integer not null default 0 check (pull_day between 0 and 6),
  pull_time time not null default '07:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table weather_config enable row level security;

drop policy if exists "public_all" on weather_config;
create policy "public_all" on weather_config for all using (true) with check (true);
