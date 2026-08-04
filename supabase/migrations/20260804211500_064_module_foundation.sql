-- 064_module_foundation.sql
--
-- A module is a live operational document owned by exactly one Event or one
-- Workbook. Workbooks discover modules from their attached Events at read time;
-- event data is never copied into a workbook rollup.

create table if not exists public.module_definitions (
  key               text        primary key,
  label             text        not null check (btrim(label) <> ''),
  description       text,
  supports_event    boolean     not null default true,
  supports_workbook boolean     not null default true,
  sort_order        integer     not null default 0,
  is_active         boolean     not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

insert into public.module_definitions
  (key, label, description, supports_event, supports_workbook, sort_order)
values
  ('input_list', 'Input List', 'Room-aware production inputs, outputs, people, and destinations.', true, true, 0),
  ('production_documents', 'Production Documents', 'Stage plots, run sheets, Google Drive links, and uploaded files.', true, true, 1),
  ('crew', 'Crew', 'Planning Center assignments, local roles, and call/release details.', true, true, 2),
  ('supplies', 'Supplies', 'Consumables, purchases, quantities, and department needs.', true, true, 3),
  ('intercom', 'Intercom', 'Crew packs, channels, talk modes, and listen modes.', true, true, 4)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  supports_event = excluded.supports_event,
  supports_workbook = excluded.supports_workbook,
  sort_order = excluded.sort_order,
  updated_at = now();

-- Stable Planning Center IDs, rather than folder display names, own defaults.
-- parent_pco_folder_id preserves PCO's nested-folder hierarchy.
create table if not exists public.pco_folders (
  pco_folder_id        text        primary key,
  name                 text        not null check (btrim(name) <> ''),
  parent_pco_folder_id text        references public.pco_folders(pco_folder_id) on delete set null,
  is_active            boolean     not null default true,
  sort_order           integer     not null default 0,
  synced_at            timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.service_types
  add column if not exists pco_folder_id text references public.pco_folders(pco_folder_id) on delete set null;

create index if not exists service_types_pco_folder_idx
  on public.service_types(pco_folder_id, sort_order, name);

create table if not exists public.module_folder_defaults (
  pco_folder_id  text        not null references public.pco_folders(pco_folder_id) on delete cascade,
  module_key     text        not null references public.module_definitions(key) on delete cascade,
  title          text,
  sort_order     integer     not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (pco_folder_id, module_key),
  check (title is null or btrim(title) <> '')
);

create table if not exists public.module_instances (
  id             uuid        primary key default gen_random_uuid(),
  module_key     text        not null references public.module_definitions(key),
  title          text,
  event_id       uuid        references public.events(id) on delete cascade,
  workbook_id    uuid        references public.workbooks(id) on delete cascade,
  location_id    uuid        references public.locations(id) on delete set null,
  status         text        not null default 'active' check (status in ('active', 'archived')),
  sort_order     integer     not null default 0,
  created_by     uuid        references public.users(id) on delete set null,
  archived_by    uuid        references public.users(id) on delete set null,
  archived_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (num_nonnulls(event_id, workbook_id) = 1),
  check (title is null or btrim(title) <> ''),
  check (
    (status = 'active' and archived_at is null and archived_by is null)
    or
    (status = 'archived' and archived_at is not null)
  )
);

create index if not exists module_instances_event_idx
  on public.module_instances(event_id, status, sort_order, created_at)
  where event_id is not null;
create index if not exists module_instances_workbook_idx
  on public.module_instances(workbook_id, status, sort_order, created_at)
  where workbook_id is not null;
create index if not exists module_instances_location_idx
  on public.module_instances(location_id, module_key)
  where location_id is not null;

create or replace function public.validate_module_instance()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  definition public.module_definitions;
  event_location_id uuid;
begin
  select * into definition
    from public.module_definitions
   where key = new.module_key
     and is_active = true;

  if definition.key is null then
    raise exception 'Unknown or inactive module type: %', new.module_key;
  end if;

  if new.event_id is not null and not definition.supports_event then
    raise exception 'Module type % cannot belong to an event', new.module_key;
  end if;

  if new.workbook_id is not null and not definition.supports_workbook then
    raise exception 'Module type % cannot belong to a workbook', new.module_key;
  end if;

  if new.event_id is not null and new.location_id is null then
    select workbook_location_id into event_location_id
      from public.events
     where id = new.event_id;
    new.location_id := event_location_id;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists validate_module_instance_trigger on public.module_instances;
create trigger validate_module_instance_trigger
before insert or update of module_key, event_id, workbook_id, location_id, title, status, sort_order
on public.module_instances
for each row execute function public.validate_module_instance();

-- Applying folder defaults is idempotent. Defaults add one instance of each
-- configured type only when the event has never had that type. Archived modules
-- therefore remain an intentional opt-out until a Manager restores them. The
-- general instance table still permits intentionally adding multiple modules.
create or replace function public.apply_event_module_defaults(
  target_event_id uuid,
  actor_user_id uuid default null
)
returns setof public.module_instances
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  insert into public.module_instances (
    module_key,
    title,
    event_id,
    location_id,
    sort_order,
    created_by
  )
  select
    folder_default.module_key,
    folder_default.title,
    event_row.id,
    event_row.workbook_location_id,
    folder_default.sort_order,
    actor_user_id
  from public.events as event_row
  join public.service_types as service_type
    on service_type.id = event_row.service_type_id
  join public.module_folder_defaults as folder_default
    on folder_default.pco_folder_id = service_type.pco_folder_id
  where event_row.id = target_event_id
    and not exists (
      select 1
        from public.module_instances as existing
       where existing.event_id = event_row.id
         and existing.module_key = folder_default.module_key
    )
  order by folder_default.sort_order, folder_default.module_key
  returning *;
end;
$$;

create or replace function public.set_module_folder_defaults(
  target_pco_folder_id text,
  defaults jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.pco_folders where pco_folder_id = target_pco_folder_id
  ) then
    raise exception 'PCO folder not found';
  end if;

  delete from public.module_folder_defaults
   where pco_folder_id = target_pco_folder_id;

  insert into public.module_folder_defaults (
    pco_folder_id,
    module_key,
    title,
    sort_order
  )
  select
    target_pco_folder_id,
    requested.module_key,
    nullif(btrim(requested.title), ''),
    requested.sort_order
  from jsonb_to_recordset(coalesce(defaults, '[]'::jsonb)) as requested(
    module_key text,
    title text,
    sort_order integer
  )
  join public.module_definitions as definition
    on definition.key = requested.module_key
   and definition.is_active = true
   and definition.supports_event = true;
end;
$$;

create or replace function public.reorder_module_instances(ordered_ids uuid[])
returns void
language sql
security definer
set search_path = public
as $$
  update public.module_instances as instance
     set sort_order = (ordered.position - 1)::integer,
         updated_at = now()
    from unnest(ordered_ids) with ordinality as ordered(id, position)
   where instance.id = ordered.id;
$$;

-- Module metadata is only available through server-verified Edge Functions.
-- This avoids repeating the current permissive-anon trust problem in the new
-- architecture.
alter table public.module_definitions     enable row level security;
alter table public.pco_folders            enable row level security;
alter table public.module_folder_defaults enable row level security;
alter table public.module_instances       enable row level security;

revoke all on public.module_definitions from anon, authenticated;
revoke all on public.pco_folders from anon, authenticated;
revoke all on public.module_folder_defaults from anon, authenticated;
revoke all on public.module_instances from anon, authenticated;
revoke all on function public.apply_event_module_defaults(uuid, uuid) from public, anon, authenticated;
revoke all on function public.set_module_folder_defaults(text, jsonb) from public, anon, authenticated;
revoke all on function public.reorder_module_instances(uuid[]) from public, anon, authenticated;

grant all on public.module_definitions to service_role;
grant all on public.pco_folders to service_role;
grant all on public.module_folder_defaults to service_role;
grant all on public.module_instances to service_role;
grant execute on function public.apply_event_module_defaults(uuid, uuid) to service_role;
grant execute on function public.set_module_folder_defaults(text, jsonb) to service_role;
grant execute on function public.reorder_module_instances(uuid[]) to service_role;
