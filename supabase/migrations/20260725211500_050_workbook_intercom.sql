-- 050_workbook_intercom.sql
--
-- Workbook Intercom Grid:
--   * account-level wired/wireless pack capacities
--   * reusable master channel list
--   * per-role starting defaults (pack type + momentary/latch per channel)
--   * event-scoped channel columns and crew assignments
--
-- A crew assignment stores a stable logical crew_key instead of a direct crew
-- row FK because the same PCO person can have multiple workbook_crew rows for
-- one event. Open/TBD positions remain distinct by using their crew row id.
-- A future equipment system can add a specific asset_id to the assignment while
-- keeping pack_type as the useful high-level classification.

create table if not exists public.intercom_pack_types (
  key             text        primary key check (key in ('wired', 'wireless')),
  label           text        not null,
  available_count integer     not null default 0 check (available_count >= 0),
  sort_order      integer     not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

insert into public.intercom_pack_types (key, label, available_count, sort_order)
values
  ('wired', 'Wired', 0, 0),
  ('wireless', 'Wireless', 0, 1)
on conflict (key) do nothing;

create table if not exists public.intercom_channels (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  sort_order integer     not null default 0,
  is_active  boolean     not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists intercom_channels_name_unique
  on public.intercom_channels (lower(name));

insert into public.intercom_channels (name, sort_order)
values
  ('Production', 0),
  ('FOH', 1),
  ('Video', 2),
  ('Cameras', 3),
  ('Band', 4),
  ('Program', 5)
on conflict do nothing;

create table if not exists public.role_intercom_defaults (
  role_id    uuid        primary key references public.roles(id) on delete cascade,
  pack_type  text        references public.intercom_pack_types(key) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.role_intercom_default_channels (
  role_id     uuid        not null references public.roles(id) on delete cascade,
  channel_id  uuid        not null references public.intercom_channels(id) on delete cascade,
  button_mode text        not null check (button_mode in ('momentary', 'latch')),
  created_at  timestamptz not null default now(),
  primary key (role_id, channel_id)
);

create table if not exists public.workbook_intercom_channels (
  id                uuid        primary key default gen_random_uuid(),
  workbook_id       uuid        not null references public.workbooks(id) on delete cascade,
  event_id          uuid        not null references public.events(id) on delete cascade,
  master_channel_id uuid        references public.intercom_channels(id) on delete set null,
  name              text        not null,
  sort_order        integer     not null default 0,
  created_at        timestamptz not null default now()
);

create unique index if not exists workbook_intercom_master_channel_unique
  on public.workbook_intercom_channels(event_id, master_channel_id)
  where master_channel_id is not null;
create unique index if not exists workbook_intercom_channel_name_unique
  on public.workbook_intercom_channels(event_id, lower(name));
create index if not exists workbook_intercom_channels_workbook_event_idx
  on public.workbook_intercom_channels(workbook_id, event_id, sort_order);

create table if not exists public.workbook_intercom_assignments (
  id          uuid        primary key default gen_random_uuid(),
  workbook_id uuid        not null references public.workbooks(id) on delete cascade,
  event_id    uuid        not null references public.events(id) on delete cascade,
  crew_key    text        not null,
  role_id     uuid        references public.roles(id) on delete set null,
  pack_type   text        references public.intercom_pack_types(key) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (event_id, crew_key)
);

create index if not exists workbook_intercom_assignments_workbook_event_idx
  on public.workbook_intercom_assignments(workbook_id, event_id);

create table if not exists public.workbook_intercom_channel_assignments (
  assignment_id   uuid        not null references public.workbook_intercom_assignments(id) on delete cascade,
  event_channel_id uuid       not null references public.workbook_intercom_channels(id) on delete cascade,
  button_mode     text        not null check (button_mode in ('momentary', 'latch')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (assignment_id, event_channel_id)
);

-- Keep workbook/event pairs honest for event-scoped Intercom rows.
create or replace function public.validate_workbook_intercom_event()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
      from public.events event_row
     where event_row.id = new.event_id
       and event_row.workbook_id = new.workbook_id
  ) then
    raise exception 'Intercom event must belong to its workbook';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_workbook_intercom_channel_event
  on public.workbook_intercom_channels;
create trigger validate_workbook_intercom_channel_event
before insert or update of workbook_id, event_id
on public.workbook_intercom_channels
for each row execute function public.validate_workbook_intercom_event();

drop trigger if exists validate_workbook_intercom_assignment_event
  on public.workbook_intercom_assignments;
create trigger validate_workbook_intercom_assignment_event
before insert or update of workbook_id, event_id
on public.workbook_intercom_assignments
for each row execute function public.validate_workbook_intercom_event();

create or replace function public.validate_intercom_channel_assignment()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
      from public.workbook_intercom_assignments assignment_row
      join public.workbook_intercom_channels channel_row
        on channel_row.event_id = assignment_row.event_id
       and channel_row.workbook_id = assignment_row.workbook_id
     where assignment_row.id = new.assignment_id
       and channel_row.id = new.event_channel_id
  ) then
    raise exception 'Intercom channel must belong to the assignment event';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_intercom_channel_assignment_trigger
  on public.workbook_intercom_channel_assignments;
create trigger validate_intercom_channel_assignment_trigger
before insert or update of assignment_id, event_channel_id
on public.workbook_intercom_channel_assignments
for each row execute function public.validate_intercom_channel_assignment();

-- Match the current client-managed Workbook pattern. These writes remain
-- admin-gated in the UI until the broader PCO-session/RLS hardening pass.
alter table public.intercom_pack_types                      enable row level security;
alter table public.intercom_channels                        enable row level security;
alter table public.role_intercom_defaults                   enable row level security;
alter table public.role_intercom_default_channels           enable row level security;
alter table public.workbook_intercom_channels               enable row level security;
alter table public.workbook_intercom_assignments            enable row level security;
alter table public.workbook_intercom_channel_assignments    enable row level security;

create policy "public_all" on public.intercom_pack_types
  for all using (true) with check (true);
create policy "public_all" on public.intercom_channels
  for all using (true) with check (true);
create policy "public_all" on public.role_intercom_defaults
  for all using (true) with check (true);
create policy "public_all" on public.role_intercom_default_channels
  for all using (true) with check (true);
create policy "public_all" on public.workbook_intercom_channels
  for all using (true) with check (true);
create policy "public_all" on public.workbook_intercom_assignments
  for all using (true) with check (true);
create policy "public_all" on public.workbook_intercom_channel_assignments
  for all using (true) with check (true);

grant select, insert, update, delete on public.intercom_pack_types                   to anon, authenticated;
grant select, insert, update, delete on public.intercom_channels                     to anon, authenticated;
grant select, insert, update, delete on public.role_intercom_defaults                to anon, authenticated;
grant select, insert, update, delete on public.role_intercom_default_channels        to anon, authenticated;
grant select, insert, update, delete on public.workbook_intercom_channels            to anon, authenticated;
grant select, insert, update, delete on public.workbook_intercom_assignments         to anon, authenticated;
grant select, insert, update, delete on public.workbook_intercom_channel_assignments to anon, authenticated;

grant all on public.intercom_pack_types                   to service_role;
grant all on public.intercom_channels                     to service_role;
grant all on public.role_intercom_defaults                to service_role;
grant all on public.role_intercom_default_channels        to service_role;
grant all on public.workbook_intercom_channels            to service_role;
grant all on public.workbook_intercom_assignments         to service_role;
grant all on public.workbook_intercom_channel_assignments to service_role;
