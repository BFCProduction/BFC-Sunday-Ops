-- App-level key/value config (timezone, etc.)
create table if not exists app_config (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

alter table app_config enable row level security;
drop policy if exists "public_all" on app_config;
create policy "public_all" on app_config for all using (true) with check (true);

-- Seed default timezone; skip if already set.
insert into app_config (key, value)
  values ('church_timezone', 'America/Chicago')
  on conflict (key) do nothing;
