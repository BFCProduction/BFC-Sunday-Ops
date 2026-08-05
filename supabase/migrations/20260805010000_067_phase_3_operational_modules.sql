-- 067_phase_3_operational_modules.sql
--
-- Move Crew, Supplies, and Intercom content onto canonical Event/Workbook
-- module ownership. Existing ownership meaning is preserved:
--   * Event-scoped Crew and Intercom rows become Event module content.
--   * Whole-production Crew and all current Supplies remain Workbook content.
-- Historical schedule snapshots remain available to the service role, but the
-- obsolete public publish boundary is retired.

-- ── Canonical module instances for existing content ─────────────────────────

insert into public.module_instances (module_key, event_id, location_id, sort_order)
select distinct
  'crew',
  crew.event_id,
  event_row.workbook_location_id,
  2
from public.workbook_crew as crew
join public.events as event_row on event_row.id = crew.event_id
where crew.event_id is not null
  and not exists (
    select 1 from public.module_instances as existing
     where existing.event_id = crew.event_id
       and existing.module_key = 'crew'
  );

insert into public.module_instances (module_key, workbook_id, sort_order)
select distinct
  'crew',
  crew.workbook_id,
  2
from public.workbook_crew as crew
where crew.event_id is null
  and crew.workbook_id is not null
  and not exists (
    select 1 from public.module_instances as existing
     where existing.workbook_id = crew.workbook_id
       and existing.module_key = 'crew'
  );

insert into public.module_instances (module_key, workbook_id, sort_order)
select distinct
  'supplies',
  supply.workbook_id,
  3
from public.workbook_supplies as supply
where supply.workbook_id is not null
  and not exists (
    select 1 from public.module_instances as existing
     where existing.workbook_id = supply.workbook_id
       and existing.module_key = 'supplies'
  );

insert into public.module_instances (module_key, event_id, location_id, sort_order)
select distinct
  'intercom',
  content_owner.event_id,
  event_row.workbook_location_id,
  4
from (
  select event_id from public.workbook_intercom_channels
  union
  select event_id from public.workbook_intercom_assignments
) as content_owner
join public.events as event_row on event_row.id = content_owner.event_id
where content_owner.event_id is not null
  and not exists (
    select 1 from public.module_instances as existing
     where existing.event_id = content_owner.event_id
       and existing.module_key = 'intercom'
  );

-- ── Crew ownership ───────────────────────────────────────────────────────────

alter table public.workbook_crew
  add column if not exists module_instance_id uuid
    references public.module_instances(id) on delete cascade;

with canonical as (
  select distinct on (event_id)
         event_id,
         id
    from public.module_instances
   where module_key = 'crew'
     and event_id is not null
   order by event_id,
            case when status = 'active' then 0 else 1 end,
            sort_order,
            created_at,
            id
)
update public.workbook_crew as crew
   set module_instance_id = canonical.id
  from canonical
 where crew.event_id = canonical.event_id
   and crew.module_instance_id is null;

with canonical as (
  select distinct on (workbook_id)
         workbook_id,
         id
    from public.module_instances
   where module_key = 'crew'
     and workbook_id is not null
   order by workbook_id,
            case when status = 'active' then 0 else 1 end,
            sort_order,
            created_at,
            id
)
update public.workbook_crew as crew
   set module_instance_id = canonical.id
  from canonical
 where crew.event_id is null
   and crew.workbook_id = canonical.workbook_id
   and crew.module_instance_id is null;

alter table public.workbook_crew
  alter column workbook_id drop not null,
  alter column module_instance_id set not null;

create index if not exists workbook_crew_module_idx
  on public.workbook_crew(module_instance_id, scheduled_date, sort_order, created_at);

create or replace function public.validate_module_crew_owner()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  owner_key text;
  owner_event_id uuid;
  owner_workbook_id uuid;
begin
  -- Compatibility for the PCO sync while its deployment rolls forward.
  if new.module_instance_id is null then
    if new.event_id is not null then
      select id into new.module_instance_id
        from public.module_instances
       where event_id = new.event_id
         and module_key = 'crew'
       order by case when status = 'active' then 0 else 1 end,
                sort_order,
                created_at,
                id
       limit 1;
    elsif new.workbook_id is not null then
      select id into new.module_instance_id
        from public.module_instances
       where workbook_id = new.workbook_id
         and module_key = 'crew'
       order by case when status = 'active' then 0 else 1 end,
                sort_order,
                created_at,
                id
       limit 1;
    end if;
  end if;

  select module_key, event_id, workbook_id
    into owner_key, owner_event_id, owner_workbook_id
    from public.module_instances
   where id = new.module_instance_id;

  if owner_key is distinct from 'crew' then
    raise exception 'Crew content requires a Crew module';
  end if;

  if owner_event_id is not null then
    new.event_id := owner_event_id;
    select workbook_id into new.workbook_id
      from public.events
     where id = owner_event_id;
  else
    new.event_id := null;
    new.workbook_id := owner_workbook_id;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists validate_module_crew_owner_trigger on public.workbook_crew;
create trigger validate_module_crew_owner_trigger
before insert or update of module_instance_id, workbook_id, event_id
on public.workbook_crew
for each row execute function public.validate_module_crew_owner();

-- ── Supplies ownership ───────────────────────────────────────────────────────

alter table public.workbook_supplies
  add column if not exists module_instance_id uuid
    references public.module_instances(id) on delete cascade;

with canonical as (
  select distinct on (workbook_id)
         workbook_id,
         id
    from public.module_instances
   where module_key = 'supplies'
     and workbook_id is not null
   order by workbook_id,
            case when status = 'active' then 0 else 1 end,
            sort_order,
            created_at,
            id
)
update public.workbook_supplies as supply
   set module_instance_id = canonical.id
  from canonical
 where supply.workbook_id = canonical.workbook_id
   and supply.module_instance_id is null;

alter table public.workbook_supplies
  alter column workbook_id drop not null,
  alter column module_instance_id set not null;

create index if not exists workbook_supplies_module_idx
  on public.workbook_supplies(module_instance_id, sort_order, created_at);

create or replace function public.validate_module_supply_owner()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  owner_key text;
  owner_event_id uuid;
  owner_workbook_id uuid;
begin
  if new.module_instance_id is null and new.workbook_id is not null then
    select id into new.module_instance_id
      from public.module_instances
     where workbook_id = new.workbook_id
       and module_key = 'supplies'
     order by case when status = 'active' then 0 else 1 end,
              sort_order,
              created_at,
              id
     limit 1;
  end if;

  select module_key, event_id, workbook_id
    into owner_key, owner_event_id, owner_workbook_id
    from public.module_instances
   where id = new.module_instance_id;

  if owner_key is distinct from 'supplies' then
    raise exception 'Supply content requires a Supplies module';
  end if;

  if owner_event_id is not null then
    select workbook_id into new.workbook_id
      from public.events
     where id = owner_event_id;
  else
    new.workbook_id := owner_workbook_id;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists validate_module_supply_owner_trigger on public.workbook_supplies;
create trigger validate_module_supply_owner_trigger
before insert or update of module_instance_id, workbook_id
on public.workbook_supplies
for each row execute function public.validate_module_supply_owner();

-- The legacy Admin supply RPC remains compatible for Workbook-owned modules.
create or replace function public.admin_save_workbook_supply(
  target_supply_id uuid,
  target_workbook_id uuid,
  target_department_id uuid,
  target_item_name text,
  target_description text,
  target_quantity numeric,
  target_unit_price numeric,
  target_purchase_url text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_supply_id uuid;
  next_sort_order integer;
  target_module_id uuid;
begin
  if btrim(coalesce(target_item_name, '')) = '' then
    raise exception 'Supply item name is required';
  end if;
  if coalesce(target_quantity, 0) < 0 or coalesce(target_unit_price, 0) < 0 then
    raise exception 'Supply quantity and price cannot be negative';
  end if;

  select id into target_module_id
    from public.module_instances
   where workbook_id = target_workbook_id
     and module_key = 'supplies'
   order by case when status = 'active' then 0 else 1 end,
            sort_order,
            created_at,
            id
   limit 1;
  if target_module_id is null then raise exception 'Workbook Supplies module not found'; end if;

  if target_supply_id is null then
    select coalesce(max(sort_order), -1) + 1 into next_sort_order
      from public.workbook_supplies
     where module_instance_id = target_module_id;

    insert into public.workbook_supplies (
      module_instance_id,
      workbook_id,
      department_id,
      item_name,
      description,
      quantity,
      unit_price,
      purchase_url,
      sort_order
    ) values (
      target_module_id,
      target_workbook_id,
      target_department_id,
      btrim(target_item_name),
      nullif(btrim(coalesce(target_description, '')), ''),
      target_quantity,
      0,
      nullif(btrim(coalesce(target_purchase_url, '')), ''),
      next_sort_order
    ) returning id into saved_supply_id;
  else
    update public.workbook_supplies
       set department_id = target_department_id,
           item_name = btrim(target_item_name),
           description = nullif(btrim(coalesce(target_description, '')), ''),
           quantity = target_quantity,
           purchase_url = nullif(btrim(coalesce(target_purchase_url, '')), ''),
           updated_at = now()
     where id = target_supply_id
       and module_instance_id = target_module_id
    returning id into saved_supply_id;
    if saved_supply_id is null then raise exception 'Supply item not found'; end if;
  end if;

  insert into public.workbook_supply_financials (supply_id, unit_price, updated_at)
  values (saved_supply_id, target_unit_price, now())
  on conflict (supply_id) do update set
    unit_price = excluded.unit_price,
    updated_at = now();

  return saved_supply_id;
end;
$$;

-- ── Intercom ownership ───────────────────────────────────────────────────────

alter table public.workbook_intercom_channels
  add column if not exists module_instance_id uuid
    references public.module_instances(id) on delete cascade;
alter table public.workbook_intercom_channels
  add column if not exists updated_at timestamptz not null default now();
alter table public.workbook_intercom_assignments
  add column if not exists module_instance_id uuid
    references public.module_instances(id) on delete cascade;

with canonical as (
  select distinct on (event_id)
         event_id,
         id
    from public.module_instances
   where module_key = 'intercom'
     and event_id is not null
   order by event_id,
            case when status = 'active' then 0 else 1 end,
            sort_order,
            created_at,
            id
)
update public.workbook_intercom_channels as channel
   set module_instance_id = canonical.id
  from canonical
 where channel.event_id = canonical.event_id
   and channel.module_instance_id is null;

with canonical as (
  select distinct on (event_id)
         event_id,
         id
    from public.module_instances
   where module_key = 'intercom'
     and event_id is not null
   order by event_id,
            case when status = 'active' then 0 else 1 end,
            sort_order,
            created_at,
            id
)
update public.workbook_intercom_assignments as assignment
   set module_instance_id = canonical.id
  from canonical
 where assignment.event_id = canonical.event_id
   and assignment.module_instance_id is null;

alter table public.workbook_intercom_channels
  alter column workbook_id drop not null,
  alter column event_id drop not null,
  alter column module_instance_id set not null;
alter table public.workbook_intercom_assignments
  alter column workbook_id drop not null,
  alter column event_id drop not null,
  alter column module_instance_id set not null;

drop index if exists public.workbook_intercom_master_channel_unique;
drop index if exists public.workbook_intercom_channel_name_unique;
alter table public.workbook_intercom_assignments
  drop constraint if exists workbook_intercom_assignments_event_id_crew_key_key;

create unique index if not exists workbook_intercom_master_module_unique
  on public.workbook_intercom_channels(module_instance_id, master_channel_id)
  where master_channel_id is not null;
create unique index if not exists workbook_intercom_channel_module_name_unique
  on public.workbook_intercom_channels(module_instance_id, lower(name));
create unique index if not exists workbook_intercom_assignment_module_crew_unique
  on public.workbook_intercom_assignments(module_instance_id, crew_key);
create index if not exists workbook_intercom_channels_module_idx
  on public.workbook_intercom_channels(module_instance_id, sort_order);
create index if not exists workbook_intercom_assignments_module_idx
  on public.workbook_intercom_assignments(module_instance_id);

create or replace function public.validate_module_intercom_owner()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  owner_key text;
  owner_event_id uuid;
  owner_workbook_id uuid;
begin
  -- Compatibility for old Event/Workbook payloads during rollout.
  if new.module_instance_id is null then
    if new.event_id is not null then
      select id into new.module_instance_id
        from public.module_instances
       where event_id = new.event_id
         and module_key = 'intercom'
       order by case when status = 'active' then 0 else 1 end,
                sort_order,
                created_at,
                id
       limit 1;
    elsif new.workbook_id is not null then
      select id into new.module_instance_id
        from public.module_instances
       where workbook_id = new.workbook_id
         and module_key = 'intercom'
       order by case when status = 'active' then 0 else 1 end,
                sort_order,
                created_at,
                id
       limit 1;
    end if;
  end if;

  select module_key, event_id, workbook_id
    into owner_key, owner_event_id, owner_workbook_id
    from public.module_instances
   where id = new.module_instance_id;

  if owner_key is distinct from 'intercom' then
    raise exception 'Intercom content requires an Intercom module';
  end if;

  if owner_event_id is not null then
    new.event_id := owner_event_id;
    select workbook_id into new.workbook_id
      from public.events
     where id = owner_event_id;
  else
    new.event_id := null;
    new.workbook_id := owner_workbook_id;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists validate_workbook_intercom_channel_event on public.workbook_intercom_channels;
drop trigger if exists validate_workbook_intercom_assignment_event on public.workbook_intercom_assignments;
drop trigger if exists validate_module_intercom_channel_owner_trigger on public.workbook_intercom_channels;
drop trigger if exists validate_module_intercom_assignment_owner_trigger on public.workbook_intercom_assignments;

create trigger validate_module_intercom_channel_owner_trigger
before insert or update of module_instance_id, workbook_id, event_id
on public.workbook_intercom_channels
for each row execute function public.validate_module_intercom_owner();

create trigger validate_module_intercom_assignment_owner_trigger
before insert or update of module_instance_id, workbook_id, event_id
on public.workbook_intercom_assignments
for each row execute function public.validate_module_intercom_owner();

create or replace function public.validate_intercom_channel_assignment()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
      from public.workbook_intercom_assignments as assignment_row
      join public.workbook_intercom_channels as channel_row
        on channel_row.module_instance_id = assignment_row.module_instance_id
     where assignment_row.id = new.assignment_id
       and channel_row.id = new.event_channel_id
  ) then
    raise exception 'Intercom channel must belong to the assignment module';
  end if;
  return new;
end;
$$;

-- ── Protected content boundary and retired publishing boundary ───────────────

drop policy if exists public_all on public.workbook_crew;
drop policy if exists public_all on public.workbook_supplies;
drop policy if exists public_all on public.workbook_intercom_channels;
drop policy if exists public_all on public.workbook_intercom_assignments;
drop policy if exists public_all on public.workbook_intercom_channel_assignments;

revoke all on public.workbook_crew from public, anon, authenticated;
revoke all on public.workbook_supplies from public, anon, authenticated;
revoke all on public.workbook_intercom_channels from public, anon, authenticated;
revoke all on public.workbook_intercom_assignments from public, anon, authenticated;
revoke all on public.workbook_intercom_channel_assignments from public, anon, authenticated;

grant all on public.workbook_crew to service_role;
grant all on public.workbook_supplies to service_role;
grant all on public.workbook_intercom_channels to service_role;
grant all on public.workbook_intercom_assignments to service_role;
grant all on public.workbook_intercom_channel_assignments to service_role;

drop policy if exists public_all on public.workbook_schedule_versions;
revoke all on public.workbook_schedule_versions from public, anon, authenticated;
revoke all on function public.publish_workbook_schedule(uuid, uuid, jsonb)
  from public, anon, authenticated;

-- Seed conservative defaults for new Sunday services without overwriting any
-- choices already made in Settings. Special Events remain intentionally lean.
insert into public.module_folder_defaults (pco_folder_id, module_key, sort_order)
select folder.pco_folder_id, requested.module_key, requested.sort_order
from public.pco_folders as folder
join (
  values
    ('9:00 Service', 'input_list', 0),
    ('9:00 Service', 'production_documents', 1),
    ('9:00 Service', 'crew', 2),
    ('9:00 Service', 'intercom', 3),
    ('11:00 Service', 'input_list', 0),
    ('11:00 Service', 'production_documents', 1),
    ('11:00 Service', 'crew', 2),
    ('11:00 Service', 'intercom', 3),
    ('Special Events', 'production_documents', 0),
    ('Special Events', 'crew', 1)
) as requested(folder_name, module_key, sort_order)
  on requested.folder_name = folder.name
on conflict (pco_folder_id, module_key) do nothing;

comment on column public.workbook_crew.module_instance_id is
  'Canonical Event/Workbook Crew module owner; workbook_id/event_id are compatibility and integration fields.';
comment on column public.workbook_supplies.module_instance_id is
  'Canonical Event/Workbook Supplies module owner; workbook_id is a compatibility field.';
comment on column public.workbook_intercom_channels.module_instance_id is
  'Canonical Event/Workbook Intercom module owner.';
comment on column public.workbook_intercom_assignments.module_instance_id is
  'Canonical Event/Workbook Intercom module owner.';
