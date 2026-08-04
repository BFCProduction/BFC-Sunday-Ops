-- 066_phase_2_module_content.sql
--
-- Move Production Documents and Input List values onto canonical module-instance
-- ownership without copying Event data into Workbooks. Existing records are
-- assigned to one canonical module, and the legacy workbook value table is
-- emptied after a protected copy so raw module contents no longer travel over
-- the anonymous browser channel.

-- Every Event that already has Production Documents gets one canonical module
-- unless a Manager created (or intentionally archived) one during Phase 1.
insert into public.module_instances (
  module_key,
  event_id,
  location_id,
  sort_order
)
select
  'production_documents',
  document_event.event_id,
  event_row.workbook_location_id,
  0
from (
  select distinct event_id
    from public.production_docs
) as document_event
join public.events as event_row
  on event_row.id = document_event.event_id
where not exists (
  select 1
    from public.module_instances as existing
   where existing.event_id = document_event.event_id
     and existing.module_key = 'production_documents'
);

alter table public.production_docs
  add column if not exists module_instance_id uuid
    references public.module_instances(id) on delete cascade;

with canonical_modules as (
  select distinct on (event_id)
         event_id,
         id as module_instance_id
    from public.module_instances
   where event_id is not null
     and module_key = 'production_documents'
   order by event_id,
            case when status = 'active' then 0 else 1 end,
            sort_order,
            created_at,
            id
)
update public.production_docs as document
   set module_instance_id = canonical.module_instance_id
  from canonical_modules as canonical
 where canonical.event_id = document.event_id
   and document.module_instance_id is null;

alter table public.production_docs
  alter column event_id drop not null,
  alter column module_instance_id set not null;

drop index if exists public.production_docs_gdrive_event_unique;
create unique index if not exists production_docs_gdrive_module_unique
  on public.production_docs(module_instance_id, gdrive_file_id)
  where gdrive_file_id is not null;
create index if not exists production_docs_module_instance_idx
  on public.production_docs(module_instance_id, uploaded_at);

create or replace function public.validate_production_document_module()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  owner_event_id uuid;
  owner_module_key text;
  resolved_module_id uuid;
begin
  -- Compatibility for the hourly Drive sync during rollout: an Event-only
  -- payload resolves to that Event's canonical Production Documents module.
  if new.module_instance_id is null and new.event_id is not null then
    select id into resolved_module_id
      from public.module_instances
     where event_id = new.event_id
       and module_key = 'production_documents'
     order by case when status = 'active' then 0 else 1 end,
              sort_order,
              created_at,
              id
     limit 1;

    if resolved_module_id is null then
      insert into public.module_instances (module_key, event_id, location_id)
      select 'production_documents', event_row.id, event_row.workbook_location_id
        from public.events as event_row
       where event_row.id = new.event_id
      returning id into resolved_module_id;
    end if;

    new.module_instance_id := resolved_module_id;
  end if;

  select module_key, event_id
    into owner_module_key, owner_event_id
    from public.module_instances
   where id = new.module_instance_id;

  if owner_module_key is distinct from 'production_documents' then
    raise exception 'Production Documents require a production_documents module';
  end if;

  -- Event-owned documents retain event_id for older integrations. Workbook-
  -- owned documents correctly keep it null; module_instance_id is canonical.
  new.event_id := owner_event_id;
  return new;
end;
$$;

drop trigger if exists validate_production_document_module_trigger
  on public.production_docs;
create trigger validate_production_document_module_trigger
before insert or update of module_instance_id, event_id
on public.production_docs
for each row execute function public.validate_production_document_module();

-- Workbook Input List values become module-owned content. The reusable room
-- configuration and location-scoped links stay independent of any Workbook or
-- Event, exactly as confirmed in Phase 1.
insert into public.module_instances (
  module_key,
  workbook_id,
  sort_order
)
select
  'input_list',
  workbook_value.workbook_id,
  0
from (
  select distinct workbook_id
    from public.workbook_input_list_values
) as workbook_value
where not exists (
  select 1
    from public.module_instances as existing
   where existing.workbook_id = workbook_value.workbook_id
     and existing.module_key = 'input_list'
     and existing.location_id is null
);

create table if not exists public.module_input_list_values (
  module_instance_id uuid        not null references public.module_instances(id) on delete cascade,
  row_id             uuid        not null references public.input_list_rows(id) on delete cascade,
  column_id          uuid        not null references public.input_list_columns(id) on delete cascade,
  value              text        not null default '',
  updated_at         timestamptz not null default now(),
  primary key (module_instance_id, row_id, column_id)
);

with canonical_modules as (
  select distinct on (workbook_id)
         workbook_id,
         id as module_instance_id
    from public.module_instances
   where workbook_id is not null
     and module_key = 'input_list'
     and location_id is null
   order by workbook_id,
            case when status = 'active' then 0 else 1 end,
            sort_order,
            created_at,
            id
)
insert into public.module_input_list_values (
  module_instance_id,
  row_id,
  column_id,
  value,
  updated_at
)
select
  canonical.module_instance_id,
  workbook_value.row_id,
  workbook_value.column_id,
  workbook_value.value,
  workbook_value.updated_at
from public.workbook_input_list_values as workbook_value
join canonical_modules as canonical
  on canonical.workbook_id = workbook_value.workbook_id
on conflict (module_instance_id, row_id, column_id) do update set
  value = excluded.value,
  updated_at = excluded.updated_at;

create index if not exists module_input_list_values_module_idx
  on public.module_input_list_values(module_instance_id);

create or replace function public.validate_module_input_list_value()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  owner_module_key text;
  owner_location_id uuid;
  row_section_id uuid;
  row_location_id uuid;
  column_section_id uuid;
  column_source text;
begin
  select module_key, location_id
    into owner_module_key, owner_location_id
    from public.module_instances
   where id = new.module_instance_id;

  if owner_module_key is distinct from 'input_list' then
    raise exception 'Input List values require an input_list module';
  end if;

  select input_row.section_id, section.location_id
    into row_section_id, row_location_id
    from public.input_list_rows as input_row
    join public.input_list_sections as section
      on section.id = input_row.section_id
   where input_row.id = new.row_id;

  select section_id, value_source
    into column_section_id, column_source
    from public.input_list_columns
   where id = new.column_id;

  if row_section_id is null
    or column_section_id is null
    or row_section_id <> column_section_id then
    raise exception 'Module Input List values must use a row and column from the same section';
  end if;

  if column_source <> 'workbook' then
    raise exception 'Module Input List values can only be written to entry columns';
  end if;

  if owner_location_id is not null and row_location_id <> owner_location_id then
    raise exception 'Input List values must use the module location';
  end if;

  new.value := btrim(coalesce(new.value, ''));
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists validate_module_input_list_value_trigger
  on public.module_input_list_values;
create trigger validate_module_input_list_value_trigger
before insert or update of module_instance_id, row_id, column_id, value
on public.module_input_list_values
for each row execute function public.validate_module_input_list_value();

create or replace function public.save_module_input_list_values_bulk(
  target_module_instance_id uuid,
  cells jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_status text;
  target_module_key text;
begin
  select status, module_key
    into target_status, target_module_key
    from public.module_instances
   where id = target_module_instance_id;

  if target_module_key is distinct from 'input_list' then
    raise exception 'Input List module not found';
  end if;
  if target_status <> 'active' then
    raise exception 'Archived Input List modules are read-only';
  end if;

  delete from public.module_input_list_values as module_value
   using jsonb_to_recordset(coalesce(cells, '[]'::jsonb)) as cell(
     row_id uuid,
     column_id uuid,
     value text
   )
   where module_value.module_instance_id = target_module_instance_id
     and module_value.row_id = cell.row_id
     and module_value.column_id = cell.column_id;

  insert into public.module_input_list_values (
    module_instance_id,
    row_id,
    column_id,
    value,
    updated_at
  )
  select
    target_module_instance_id,
    cell.row_id,
    cell.column_id,
    btrim(cell.value),
    now()
  from jsonb_to_recordset(coalesce(cells, '[]'::jsonb)) as cell(
    row_id uuid,
    column_id uuid,
    value text
  )
  where btrim(coalesce(cell.value, '')) <> '';
end;
$$;

-- The protected copy is authoritative from this point forward.
delete from public.workbook_input_list_values;

drop policy if exists public_all on public.workbook_input_list_values;
revoke all on public.workbook_input_list_values from public, anon, authenticated;
revoke all on function public.save_workbook_input_list_values_bulk(uuid, jsonb)
  from public, anon, authenticated;

-- Location-wide cell links remain reusable configuration, but writes now
-- require a verified module-content request instead of an anonymous RPC.
alter function public.save_input_list_cell_links_bulk(uuid, jsonb)
  security definer;
revoke insert, update, delete on public.input_list_cell_links
  from anon, authenticated;
revoke all on function public.save_input_list_cell_links_bulk(uuid, jsonb)
  from public, anon, authenticated;

drop policy if exists public_all on public.production_docs;
revoke all on public.production_docs from public, anon, authenticated;

alter table public.module_input_list_values enable row level security;
revoke all on public.module_input_list_values from public, anon, authenticated;

grant all on public.production_docs to service_role;
grant all on public.module_input_list_values to service_role;
grant execute on function public.save_module_input_list_values_bulk(uuid, jsonb)
  to service_role;
grant execute on function public.save_input_list_cell_links_bulk(uuid, jsonb)
  to service_role;

comment on table public.module_input_list_values is
  'Protected Input List cells owned by one Event or Workbook module instance.';
comment on column public.production_docs.module_instance_id is
  'Canonical Event/Workbook module owner; event_id remains an integration bridge.';
