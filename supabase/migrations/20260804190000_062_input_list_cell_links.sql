-- 062_input_list_cell_links.sql
--
-- Location-scoped spreadsheet-style links for workbook input lists. A link
-- describes reusable room structure (target cell follows source cell); the
-- resolved value still comes from the workbook currently being viewed.

create table if not exists public.input_list_cell_links (
  location_id      uuid        not null references public.locations(id) on delete cascade,
  target_row_id    uuid        not null references public.input_list_rows(id) on delete cascade,
  target_column_id uuid        not null references public.input_list_columns(id) on delete cascade,
  source_row_id    uuid        not null references public.input_list_rows(id) on delete cascade,
  source_column_id uuid        not null references public.input_list_columns(id) on delete cascade,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (location_id, target_row_id, target_column_id),
  check (
    target_row_id <> source_row_id
    or target_column_id <> source_column_id
  )
);

create or replace function public.validate_input_list_cell_link()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  target_row_section uuid;
  target_column_section uuid;
  target_column_source text;
  target_location uuid;
  source_row_section uuid;
  source_column_section uuid;
  source_location uuid;
  would_cycle boolean;
begin
  select section_id
    into target_row_section
    from public.input_list_rows
   where id = new.target_row_id;

  select section_id, value_source
    into target_column_section, target_column_source
    from public.input_list_columns
   where id = new.target_column_id;

  select location_id
    into target_location
    from public.input_list_sections
   where id = target_row_section;

  select section_id
    into source_row_section
    from public.input_list_rows
   where id = new.source_row_id;

  select section_id
    into source_column_section
    from public.input_list_columns
   where id = new.source_column_id;

  select location_id
    into source_location
    from public.input_list_sections
   where id = source_row_section;

  if target_row_section is null
    or target_column_section is null
    or target_row_section <> target_column_section then
    raise exception 'Input-list link target must use a row and column from the same section';
  end if;

  if source_row_section is null
    or source_column_section is null
    or source_row_section <> source_column_section then
    raise exception 'Input-list link source must use a row and column from the same section';
  end if;

  if target_column_source <> 'workbook' then
    raise exception 'Only workbook-entry cells can be link targets';
  end if;

  if target_location <> new.location_id or source_location <> new.location_id then
    raise exception 'Input-list links must stay within one location';
  end if;

  with recursive dependencies(row_id, column_id) as (
    values (new.source_row_id, new.source_column_id)
    union
    select link.source_row_id, link.source_column_id
      from dependencies
      join public.input_list_cell_links as link
        on link.location_id = new.location_id
       and link.target_row_id = dependencies.row_id
       and link.target_column_id = dependencies.column_id
     where not (
       link.target_row_id = new.target_row_id
       and link.target_column_id = new.target_column_id
     )
  )
  select exists (
    select 1
      from dependencies
     where row_id = new.target_row_id
       and column_id = new.target_column_id
  ) into would_cycle;

  if would_cycle then
    raise exception 'Input-list links cannot contain circular references';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_input_list_cell_link_trigger
  on public.input_list_cell_links;
create trigger validate_input_list_cell_link_trigger
before insert or update of location_id, target_row_id, target_column_id, source_row_id, source_column_id
on public.input_list_cell_links
for each row
execute function public.validate_input_list_cell_link();

create index if not exists input_list_cell_links_source_idx
  on public.input_list_cell_links(location_id, source_row_id, source_column_id);

-- Replace, create, or remove several location links atomically. A null source
-- removes the link for that target, which is also used by the UI's Undo action.
create or replace function public.save_input_list_cell_links_bulk(
  target_location_id uuid,
  cells jsonb
)
returns void
language plpgsql
set search_path = public
as $$
begin
  delete from public.input_list_cell_links as link
   using jsonb_to_recordset(coalesce(cells, '[]'::jsonb)) as cell(
     target_row_id uuid,
     target_column_id uuid,
     source_row_id uuid,
     source_column_id uuid
   )
   where link.location_id = target_location_id
     and link.target_row_id = cell.target_row_id
     and link.target_column_id = cell.target_column_id;

  insert into public.input_list_cell_links (
    location_id,
    target_row_id,
    target_column_id,
    source_row_id,
    source_column_id
  )
  select
    target_location_id,
    cell.target_row_id,
    cell.target_column_id,
    cell.source_row_id,
    cell.source_column_id
  from jsonb_to_recordset(coalesce(cells, '[]'::jsonb)) as cell(
    target_row_id uuid,
    target_column_id uuid,
    source_row_id uuid,
    source_column_id uuid
  )
  where cell.source_row_id is not null
    and cell.source_column_id is not null;
end;
$$;

-- Save a drag-filled range in one transaction. Blank values remove existing
-- workbook cells, allowing the same operation to power Undo.
create or replace function public.save_workbook_input_list_values_bulk(
  target_workbook_id uuid,
  cells jsonb
)
returns void
language plpgsql
set search_path = public
as $$
begin
  delete from public.workbook_input_list_values as workbook_value
   using jsonb_to_recordset(coalesce(cells, '[]'::jsonb)) as cell(
     row_id uuid,
     column_id uuid,
     value text
   )
   where workbook_value.workbook_id = target_workbook_id
     and workbook_value.row_id = cell.row_id
     and workbook_value.column_id = cell.column_id;

  insert into public.workbook_input_list_values (
    workbook_id,
    row_id,
    column_id,
    value,
    updated_at
  )
  select
    target_workbook_id,
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

alter table public.input_list_cell_links enable row level security;

create policy "public_all" on public.input_list_cell_links
  for all using (true) with check (true);

grant select, insert, update, delete on public.input_list_cell_links to anon, authenticated;
grant all on public.input_list_cell_links to service_role;
grant execute on function public.save_input_list_cell_links_bulk(uuid, jsonb) to anon, authenticated, service_role;
grant execute on function public.save_workbook_input_list_values_bulk(uuid, jsonb) to anon, authenticated, service_role;
