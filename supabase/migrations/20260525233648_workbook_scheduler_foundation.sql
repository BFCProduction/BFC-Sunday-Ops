-- Workbook scheduling foundation.
--
-- Workbooks sit above events for multi-event productions such as conferences
-- or assemblies. Events remain the source of truth for produced sessions;
-- schedule items hold calls, rehearsals, meals, transitions, and other
-- coordination activity around those events.

create table if not exists public.workbooks (
  id                uuid        primary key default gen_random_uuid(),
  name              text        not null,
  start_date        date        not null,
  end_date          date        not null,
  venue             text,
  description       text,
  status            text        not null default 'draft'
                              check (status in ('draft', 'published', 'archived')),
  published_version integer     not null default 0,
  published_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (end_date >= start_date)
);

create table if not exists public.workbook_locations (
  id          uuid        primary key default gen_random_uuid(),
  workbook_id uuid        not null references public.workbooks(id) on delete cascade,
  name        text        not null,
  sort_order  integer     not null default 0,
  created_at  timestamptz not null default now(),
  unique (workbook_id, name)
);

alter table public.events
  add column if not exists workbook_id uuid references public.workbooks(id) on delete set null,
  add column if not exists workbook_location_id uuid references public.workbook_locations(id) on delete set null,
  add column if not exists event_end_time time;

create table if not exists public.workbook_schedule_items (
  id            uuid        primary key default gen_random_uuid(),
  workbook_id   uuid        not null references public.workbooks(id) on delete cascade,
  event_id      uuid        references public.events(id) on delete set null,
  location_id   uuid        references public.workbook_locations(id) on delete set null,
  title         text        not null,
  item_type     text        not null default 'task'
                              check (item_type in (
                                'call', 'rehearsal', 'meal', 'meeting',
                                'programming', 'transition', 'load_in',
                                'strike', 'task'
                              )),
  scheduled_date date       not null,
  start_time    time        not null,
  end_time      time,
  notes         text,
  departments   text[]      not null default '{}',
  tags          text[]      not null default '{}',
  sort_order    integer     not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.workbook_schedule_assignments (
  id               uuid        primary key default gen_random_uuid(),
  schedule_item_id uuid        not null references public.workbook_schedule_items(id) on delete cascade,
  user_id          uuid        references public.users(id) on delete set null,
  person_name      text,
  role             text,
  department       text,
  is_open          boolean     not null default false,
  created_at       timestamptz not null default now(),
  check (is_open or person_name is not null)
);

create table if not exists public.workbook_schedule_versions (
  id              uuid        primary key default gen_random_uuid(),
  workbook_id     uuid        not null references public.workbooks(id) on delete cascade,
  version_number  integer     not null,
  published_by    uuid        references public.users(id) on delete set null,
  published_at    timestamptz not null default now(),
  snapshot        jsonb       not null,
  unique (workbook_id, version_number)
);

create or replace function public.validate_workbook_schedule_item_links()
returns trigger
language plpgsql
as $$
begin
  if new.location_id is not null and not exists (
    select 1
      from public.workbook_locations location
     where location.id = new.location_id
       and location.workbook_id = new.workbook_id
  ) then
    raise exception 'Schedule item location must belong to its workbook';
  end if;

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

drop trigger if exists validate_workbook_schedule_item_links_trigger
  on public.workbook_schedule_items;
create trigger validate_workbook_schedule_item_links_trigger
before insert or update of workbook_id, event_id, location_id
on public.workbook_schedule_items
for each row
execute function public.validate_workbook_schedule_item_links();

create or replace function public.validate_workbook_event_location()
returns trigger
language plpgsql
as $$
begin
  if new.workbook_location_id is not null and not exists (
    select 1
      from public.workbook_locations location
     where location.id = new.workbook_location_id
       and location.workbook_id = new.workbook_id
  ) then
    raise exception 'Event location must belong to its workbook';
  end if;

  if old.workbook_id is distinct from new.workbook_id then
    update public.workbook_schedule_items
       set event_id = null,
           updated_at = now()
     where event_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists validate_workbook_event_location_trigger on public.events;
create trigger validate_workbook_event_location_trigger
before update of workbook_id, workbook_location_id
on public.events
for each row
execute function public.validate_workbook_event_location();

create or replace function public.publish_workbook_schedule(
  p_workbook_id uuid,
  p_published_by uuid,
  p_snapshot jsonb
)
returns public.workbooks
language plpgsql
as $$
declare
  next_version integer;
  updated_workbook public.workbooks;
begin
  select published_version + 1
    into next_version
    from public.workbooks
   where id = p_workbook_id
   for update;

  if next_version is null then
    raise exception 'Workbook not found';
  end if;

  insert into public.workbook_schedule_versions
    (workbook_id, version_number, published_by, snapshot)
  values
    (p_workbook_id, next_version, p_published_by, p_snapshot);

  update public.workbooks
     set status = 'published',
         published_version = next_version,
         published_at = now(),
         updated_at = now()
   where id = p_workbook_id
   returning * into updated_workbook;

  return updated_workbook;
end;
$$;

create index if not exists events_workbook_id_idx
  on public.events(workbook_id);
create index if not exists workbook_locations_workbook_idx
  on public.workbook_locations(workbook_id, sort_order, name);
create index if not exists workbook_schedule_items_workbook_time_idx
  on public.workbook_schedule_items(workbook_id, scheduled_date, start_time);
create index if not exists workbook_schedule_items_event_idx
  on public.workbook_schedule_items(event_id)
  where event_id is not null;
create index if not exists workbook_schedule_assignments_item_idx
  on public.workbook_schedule_assignments(schedule_item_id);
create index if not exists workbook_schedule_versions_workbook_idx
  on public.workbook_schedule_versions(workbook_id, version_number desc);

alter table public.workbooks                     enable row level security;
alter table public.workbook_locations            enable row level security;
alter table public.workbook_schedule_items       enable row level security;
alter table public.workbook_schedule_assignments enable row level security;
alter table public.workbook_schedule_versions    enable row level security;

-- Match the current client-managed operational data pattern. The application
-- still gates writing controls to admins in the UI; a future auth hardening
-- pass can route these writes through protected functions.
create policy "public_all" on public.workbooks
  for all using (true) with check (true);
create policy "public_all" on public.workbook_locations
  for all using (true) with check (true);
create policy "public_all" on public.workbook_schedule_items
  for all using (true) with check (true);
create policy "public_all" on public.workbook_schedule_assignments
  for all using (true) with check (true);
create policy "public_all" on public.workbook_schedule_versions
  for all using (true) with check (true);

grant select, insert, update, delete on public.workbooks                     to anon, authenticated;
grant select, insert, update, delete on public.workbook_locations            to anon, authenticated;
grant select, insert, update, delete on public.workbook_schedule_items       to anon, authenticated;
grant select, insert, update, delete on public.workbook_schedule_assignments to anon, authenticated;
grant select, insert, update, delete on public.workbook_schedule_versions    to anon, authenticated;
grant execute on function public.publish_workbook_schedule(uuid, uuid, jsonb) to anon, authenticated;
grant all on public.workbooks                     to service_role;
grant all on public.workbook_locations            to service_role;
grant all on public.workbook_schedule_items       to service_role;
grant all on public.workbook_schedule_assignments to service_role;
grant all on public.workbook_schedule_versions    to service_role;
grant execute on function public.publish_workbook_schedule(uuid, uuid, jsonb) to service_role;
