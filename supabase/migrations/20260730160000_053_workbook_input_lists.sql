-- 053_workbook_input_lists.sql
--
-- Room-aware workbook input lists. Settings owns reusable room configuration:
-- ordered sections, ordered columns, and ordered room connection rows. Columns
-- are either room-defined (read-only in a workbook) or workbook-entered.
-- Workbook values only store the production-specific cells.

create table if not exists public.input_list_sections (
  id          uuid        primary key default gen_random_uuid(),
  location_id uuid        not null references public.locations(id) on delete cascade,
  name        text        not null check (btrim(name) <> ''),
  sort_order  integer     not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (location_id, name)
);

create table if not exists public.input_list_columns (
  id           uuid        primary key default gen_random_uuid(),
  section_id   uuid        not null references public.input_list_sections(id) on delete cascade,
  name         text        not null check (btrim(name) <> ''),
  value_source text        not null default 'workbook'
                              check (value_source in ('room', 'workbook')),
  sort_order   integer     not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (section_id, name)
);

create table if not exists public.input_list_rows (
  id              uuid        primary key default gen_random_uuid(),
  section_id      uuid        not null references public.input_list_sections(id) on delete cascade,
  connection_type text        not null default 'audio_input'
                                  check (connection_type in (
                                    'audio_input',
                                    'audio_output',
                                    'monitor_output',
                                    'network',
                                    'fiber',
                                    'bnc'
                                  )),
  sort_order      integer     not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.input_list_room_values (
  row_id      uuid        not null references public.input_list_rows(id) on delete cascade,
  column_id   uuid        not null references public.input_list_columns(id) on delete cascade,
  value       text        not null default '',
  updated_at  timestamptz not null default now(),
  primary key (row_id, column_id)
);

create table if not exists public.workbook_input_list_values (
  workbook_id uuid        not null references public.workbooks(id) on delete cascade,
  row_id      uuid        not null references public.input_list_rows(id) on delete cascade,
  column_id   uuid        not null references public.input_list_columns(id) on delete cascade,
  value       text        not null default '',
  updated_at  timestamptz not null default now(),
  primary key (workbook_id, row_id, column_id)
);

create or replace function public.validate_input_list_room_value()
returns trigger
language plpgsql
as $$
declare
  row_section uuid;
  column_section uuid;
  column_source text;
begin
  select section_id into row_section
    from public.input_list_rows
   where id = new.row_id;

  select section_id, value_source into column_section, column_source
    from public.input_list_columns
   where id = new.column_id;

  if row_section is null or column_section is null or row_section <> column_section then
    raise exception 'Input-list room values must use a row and column from the same section';
  end if;

  if column_source <> 'room' then
    raise exception 'Input-list room values can only be written to room-defined columns';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_input_list_room_value_trigger
  on public.input_list_room_values;
create trigger validate_input_list_room_value_trigger
before insert or update of row_id, column_id
on public.input_list_room_values
for each row
execute function public.validate_input_list_room_value();

create or replace function public.validate_workbook_input_list_value()
returns trigger
language plpgsql
as $$
declare
  row_section uuid;
  column_section uuid;
  column_source text;
begin
  select section_id into row_section
    from public.input_list_rows
   where id = new.row_id;

  select section_id, value_source into column_section, column_source
    from public.input_list_columns
   where id = new.column_id;

  if row_section is null or column_section is null or row_section <> column_section then
    raise exception 'Workbook input-list values must use a row and column from the same section';
  end if;

  if column_source <> 'workbook' then
    raise exception 'Workbook input-list values can only be written to workbook-entry columns';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_workbook_input_list_value_trigger
  on public.workbook_input_list_values;
create trigger validate_workbook_input_list_value_trigger
before insert or update of row_id, column_id
on public.workbook_input_list_values
for each row
execute function public.validate_workbook_input_list_value();

create or replace function public.reconcile_input_list_column_source()
returns trigger
language plpgsql
as $$
begin
  if old.value_source is distinct from new.value_source then
    if new.value_source = 'room' then
      delete from public.workbook_input_list_values where column_id = new.id;
    else
      delete from public.input_list_room_values where column_id = new.id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists reconcile_input_list_column_source_trigger
  on public.input_list_columns;
create trigger reconcile_input_list_column_source_trigger
before update of value_source
on public.input_list_columns
for each row
execute function public.reconcile_input_list_column_source();

create index if not exists input_list_sections_location_sort_idx
  on public.input_list_sections(location_id, sort_order, name);
create index if not exists input_list_columns_section_sort_idx
  on public.input_list_columns(section_id, sort_order, name);
create index if not exists input_list_rows_section_sort_idx
  on public.input_list_rows(section_id, sort_order, created_at);
create index if not exists workbook_input_list_values_workbook_idx
  on public.workbook_input_list_values(workbook_id);

-- Keep drag-and-drop ordering atomic and avoid one browser request per row.
create or replace function public.reorder_input_list_sections(ordered_ids uuid[])
returns void
language sql
set search_path = public
as $$
  update public.input_list_sections as item
     set sort_order = (ordered.position - 1)::integer,
         updated_at = now()
    from unnest(ordered_ids) with ordinality as ordered(id, position)
   where item.id = ordered.id;
$$;

create or replace function public.reorder_input_list_columns(ordered_ids uuid[])
returns void
language sql
set search_path = public
as $$
  update public.input_list_columns as item
     set sort_order = (ordered.position - 1)::integer,
         updated_at = now()
    from unnest(ordered_ids) with ordinality as ordered(id, position)
   where item.id = ordered.id;
$$;

create or replace function public.reorder_input_list_rows(ordered_ids uuid[])
returns void
language sql
set search_path = public
as $$
  update public.input_list_rows as item
     set sort_order = (ordered.position - 1)::integer,
         updated_at = now()
    from unnest(ordered_ids) with ordinality as ordered(id, position)
   where item.id = ordered.id;
$$;

alter table public.input_list_sections         enable row level security;
alter table public.input_list_columns          enable row level security;
alter table public.input_list_rows             enable row level security;
alter table public.input_list_room_values      enable row level security;
alter table public.workbook_input_list_values  enable row level security;

-- Match the current client-managed Workbook pattern. Settings and workbook
-- editing remain admin-gated in the app until the broader RLS hardening pass.
create policy "public_all" on public.input_list_sections
  for all using (true) with check (true);
create policy "public_all" on public.input_list_columns
  for all using (true) with check (true);
create policy "public_all" on public.input_list_rows
  for all using (true) with check (true);
create policy "public_all" on public.input_list_room_values
  for all using (true) with check (true);
create policy "public_all" on public.workbook_input_list_values
  for all using (true) with check (true);

grant select, insert, update, delete on public.input_list_sections        to anon, authenticated;
grant select, insert, update, delete on public.input_list_columns         to anon, authenticated;
grant select, insert, update, delete on public.input_list_rows            to anon, authenticated;
grant select, insert, update, delete on public.input_list_room_values     to anon, authenticated;
grant select, insert, update, delete on public.workbook_input_list_values to anon, authenticated;
grant all on public.input_list_sections        to service_role;
grant all on public.input_list_columns         to service_role;
grant all on public.input_list_rows            to service_role;
grant all on public.input_list_room_values     to service_role;
grant all on public.workbook_input_list_values to service_role;
grant execute on function public.reorder_input_list_sections(uuid[]) to anon, authenticated, service_role;
grant execute on function public.reorder_input_list_columns(uuid[])  to anon, authenticated, service_role;
grant execute on function public.reorder_input_list_rows(uuid[])     to anon, authenticated, service_role;

-- Seed a Sanctuary starter configuration from the current Sunday-morning I/O
-- workbook. Event-specific assignments intentionally remain blank.
do $$
declare
  sanctuary_id uuid;
  floor_section uuid;
  monitor_section uuid;
  wing_section uuid;
  drum_section uuid;
  transport_section uuid;
  wireless_section uuid;
  floor_box_column uuid;
  floor_connection_column uuid;
  monitor_bus_column uuid;
  wing_input_column uuid;
  drum_connection_column uuid;
  transport_location_column uuid;
  transport_connection_column uuid;
  transport_type_column uuid;
  wireless_connection_column uuid;
  row_id uuid;
  connection_number integer;
  box_name text;
  transport record;
begin
  select id into sanctuary_id
    from public.locations
   where name = 'Sanctuary'
   limit 1;

  if sanctuary_id is null then
    return;
  end if;

  insert into public.input_list_sections (location_id, name, sort_order)
  values (sanctuary_id, 'Floor Boxes', 0)
  returning id into floor_section;
  insert into public.input_list_sections (location_id, name, sort_order)
  values (sanctuary_id, 'Monitor Mixes', 1)
  returning id into monitor_section;
  insert into public.input_list_sections (location_id, name, sort_order)
  values (sanctuary_id, 'WING Channels', 2)
  returning id into wing_section;
  insert into public.input_list_sections (location_id, name, sort_order)
  values (sanctuary_id, 'Drum Stage Box', 3)
  returning id into drum_section;
  insert into public.input_list_sections (location_id, name, sort_order)
  values (sanctuary_id, 'Network / Fiber / BNC', 4)
  returning id into transport_section;
  insert into public.input_list_sections (location_id, name, sort_order)
  values (sanctuary_id, 'Wireless', 5)
  returning id into wireless_section;

  insert into public.input_list_columns (section_id, name, value_source, sort_order)
  values (floor_section, 'Floor Box', 'room', 0)
  returning id into floor_box_column;
  insert into public.input_list_columns (section_id, name, value_source, sort_order)
  values (floor_section, 'Connection', 'room', 1)
  returning id into floor_connection_column;
  insert into public.input_list_columns (section_id, name, value_source, sort_order) values
    (floor_section, 'Source', 'workbook', 2),
    (floor_section, 'Microphone / DI', 'workbook', 3),
    (floor_section, 'Person', 'workbook', 4);

  insert into public.input_list_columns (section_id, name, value_source, sort_order)
  values (monitor_section, 'Bus Mix', 'room', 0)
  returning id into monitor_bus_column;
  insert into public.input_list_columns (section_id, name, value_source, sort_order) values
    (monitor_section, 'What', 'workbook', 1),
    (monitor_section, 'Label in App', 'workbook', 2),
    (monitor_section, 'Patch on ADR 1', 'workbook', 3);

  insert into public.input_list_columns (section_id, name, value_source, sort_order)
  values (wing_section, 'Input', 'room', 0)
  returning id into wing_input_column;
  insert into public.input_list_columns (section_id, name, value_source, sort_order) values
    (wing_section, 'Source', 'workbook', 1),
    (wing_section, 'DiGiCo Output', 'workbook', 2),
    (wing_section, 'WING Input', 'workbook', 3);

  insert into public.input_list_columns (section_id, name, value_source, sort_order)
  values (drum_section, 'Connection', 'room', 0)
  returning id into drum_connection_column;
  insert into public.input_list_columns (section_id, name, value_source, sort_order) values
    (drum_section, 'Source', 'workbook', 1),
    (drum_section, 'Microphone / DI', 'workbook', 2),
    (drum_section, 'Person', 'workbook', 3);

  insert into public.input_list_columns (section_id, name, value_source, sort_order)
  values (transport_section, 'Location', 'room', 0)
  returning id into transport_location_column;
  insert into public.input_list_columns (section_id, name, value_source, sort_order)
  values (transport_section, 'Connection', 'room', 1)
  returning id into transport_connection_column;
  insert into public.input_list_columns (section_id, name, value_source, sort_order)
  values (transport_section, 'Type', 'room', 2)
  returning id into transport_type_column;
  insert into public.input_list_columns (section_id, name, value_source, sort_order) values
    (transport_section, 'Use', 'workbook', 3),
    (transport_section, 'Destination / Person', 'workbook', 4);

  insert into public.input_list_columns (section_id, name, value_source, sort_order)
  values (wireless_section, 'Connection', 'room', 0)
  returning id into wireless_connection_column;
  insert into public.input_list_columns (section_id, name, value_source, sort_order) values
    (wireless_section, 'Source', 'workbook', 1),
    (wireless_section, 'Equipment', 'workbook', 2),
    (wireless_section, 'Person', 'workbook', 3);

  -- Sanctuary analog floor-box microphone inputs.
  for connection_number in 1..80 loop
    box_name := case
      when connection_number <= 12 then 'AFB 1001'
      when connection_number <= 28 then 'AFB 1004'
      when connection_number <= 44 then 'AFB 1005'
      when connection_number <= 52 then 'AFB 1006'
      when connection_number <= 64 then 'AFB 1007'
      when connection_number <= 68 then 'AFB 1008'
      when connection_number <= 72 then 'AFB 1009'
      when connection_number <= 76 then 'AFB 1010'
      else 'AFB 1011'
    end;

    insert into public.input_list_rows (section_id, connection_type, sort_order)
    values (floor_section, 'audio_input', connection_number - 1)
    returning id into row_id;

    insert into public.input_list_room_values (row_id, column_id, value) values
      (row_id, floor_box_column, box_name),
      (row_id, floor_connection_column, 'MIC ' || connection_number);
  end loop;

  -- Sanctuary floor-box returns used for monitor and other stage outputs.
  for connection_number in 1..44 loop
    box_name := case
      when connection_number <= 8 then 'AFB 1001'
      when connection_number <= 16 then 'AFB 1004'
      when connection_number <= 20 then 'AFB 1005'
      when connection_number <= 24 then 'AFB 1006'
      when connection_number <= 28 then 'AFB 1007'
      when connection_number <= 32 then 'AFB 1008'
      when connection_number <= 36 then 'AFB 1009'
      when connection_number <= 40 then 'AFB 1010'
      else 'AFB 1011'
    end;

    insert into public.input_list_rows (section_id, connection_type, sort_order)
    values (floor_section, 'monitor_output', 79 + connection_number)
    returning id into row_id;

    insert into public.input_list_room_values (row_id, column_id, value) values
      (row_id, floor_box_column, box_name),
      (row_id, floor_connection_column, 'RET ' || connection_number);
  end loop;

  insert into public.input_list_rows (section_id, connection_type, sort_order)
  values (monitor_section, 'monitor_output', 0)
  returning id into row_id;
  insert into public.input_list_room_values (row_id, column_id, value)
  values (row_id, monitor_bus_column, 'DANTE');

  for connection_number in 1..16 loop
    insert into public.input_list_rows (section_id, connection_type, sort_order)
    values (monitor_section, 'monitor_output', connection_number)
    returning id into row_id;
    insert into public.input_list_room_values (row_id, column_id, value)
    values (row_id, monitor_bus_column, 'Mix ' || connection_number);
  end loop;

  for connection_number in 1..40 loop
    insert into public.input_list_rows (section_id, connection_type, sort_order)
    values (wing_section, 'audio_input', connection_number - 1)
    returning id into row_id;
    insert into public.input_list_room_values (row_id, column_id, value)
    values (row_id, wing_input_column, 'WING ' || connection_number);
  end loop;

  for connection_number in 1..16 loop
    insert into public.input_list_rows (section_id, connection_type, sort_order)
    values (drum_section, 'audio_input', connection_number - 1)
    returning id into row_id;
    insert into public.input_list_room_values (row_id, column_id, value)
    values (row_id, drum_connection_column, 'MIC ' || connection_number);
  end loop;

  for connection_number in 1..8 loop
    insert into public.input_list_rows (section_id, connection_type, sort_order)
    values (drum_section, 'monitor_output', 15 + connection_number)
    returning id into row_id;
    insert into public.input_list_room_values (row_id, column_id, value)
    values (row_id, drum_connection_column, 'OUT ' || connection_number);
  end loop;

  for transport in
    select *
      from (values
        ('LFB 1001', 'FIBER 10', 'fiber',   0),
        ('AFB 1001', 'NET 1',    'network', 1),
        ('AFB 1001', 'NET 2',    'network', 2),
        ('AFB 1002', 'FIBER 11', 'fiber',   3),
        ('AFB 1002', 'NET 3',    'network', 4),
        ('AFB 1002', 'NET 4',    'network', 5),
        ('AFB 1003', 'FIBER 12', 'fiber',   6),
        ('AFB 1003', 'NET 5',    'network', 7),
        ('AFB 1003', 'NET 6',    'network', 8),
        ('LFB 1002', 'FIBER 13', 'fiber',   9),
        ('AFB 1005', 'NET 9',    'network', 10),
        ('AFB 1005', 'NET 10',   'network', 11),
        ('AFB 1006', 'NET 11',   'network', 12),
        ('AFB 1006', 'NET 12',   'network', 13),
        ('AFB 1007', 'NET 13',   'network', 14),
        ('AFB 1007', 'NET 14',   'network', 15),
        ('AFB 1008', 'FIBER 14', 'fiber',   16),
        ('AFB 1008', 'NET 15',   'network', 17),
        ('AFB 1008', 'NET 16',   'network', 18),
        ('AFB 1009', 'NET 17',   'network', 19),
        ('AFB 1009', 'NET 18',   'network', 20),
        ('AFB 1010', 'NET 19',   'network', 21),
        ('AFB 1010', 'NET 20',   'network', 22),
        ('AFB 1011', 'FIBER 15', 'fiber',   23),
        ('AFB 1011', 'NET 21',   'network', 24),
        ('AFB 1011', 'NET 22',   'network', 25)
      ) as seeded(location_name, connection_name, connection_kind, row_order)
  loop
    insert into public.input_list_rows (section_id, connection_type, sort_order)
    values (transport_section, transport.connection_kind, transport.row_order)
    returning id into row_id;

    insert into public.input_list_room_values (row_id, column_id, value) values
      (row_id, transport_location_column, transport.location_name),
      (row_id, transport_connection_column, transport.connection_name),
      (row_id, transport_type_column, initcap(transport.connection_kind));
  end loop;

  for connection_number in 1..16 loop
    insert into public.input_list_rows (section_id, connection_type, sort_order)
    values (wireless_section, 'audio_input', connection_number - 1)
    returning id into row_id;
    insert into public.input_list_room_values (row_id, column_id, value)
    values (row_id, wireless_connection_column, 'Wireless ' || connection_number);
  end loop;

  for connection_number in 1..8 loop
    insert into public.input_list_rows (section_id, connection_type, sort_order)
    values (wireless_section, 'monitor_output', 15 + connection_number)
    returning id into row_id;
    insert into public.input_list_room_values (row_id, column_id, value)
    values (row_id, wireless_connection_column, 'Wireless IEM ' || connection_number);
  end loop;
end;
$$;
