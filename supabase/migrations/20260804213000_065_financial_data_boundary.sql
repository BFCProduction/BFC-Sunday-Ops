-- 065_financial_data_boundary.sql
--
-- Remove raw rates, paid/volunteer assignments, and supply prices from tables
-- exposed to the browser/realtime channel. The original columns remain as
-- zero-value compatibility fields, while authoritative financial values live
-- in service-role-only tables accessed through verified Edge Functions.

create table if not exists public.role_financials (
  role_id      uuid        primary key references public.roles(id) on delete cascade,
  hourly_rate numeric(8,2) not null default 0 check (hourly_rate >= 0),
  updated_at  timestamptz not null default now()
);

create table if not exists public.workbook_crew_financials (
  crew_id    uuid        primary key references public.workbook_crew(id) on delete cascade,
  is_paid    boolean     not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.workbook_supply_financials (
  supply_id  uuid          primary key references public.workbook_supplies(id) on delete cascade,
  unit_price numeric(12,2) not null default 0 check (unit_price >= 0),
  updated_at timestamptz   not null default now()
);

insert into public.role_financials (role_id, hourly_rate)
select id, hourly_rate from public.roles
on conflict (role_id) do update set
  hourly_rate = excluded.hourly_rate,
  updated_at = now();

insert into public.workbook_crew_financials (crew_id, is_paid)
select id, is_paid from public.workbook_crew
on conflict (crew_id) do update set
  is_paid = excluded.is_paid,
  updated_at = now();

insert into public.workbook_supply_financials (supply_id, unit_price)
select id, unit_price from public.workbook_supplies
on conflict (supply_id) do update set
  unit_price = excluded.unit_price,
  updated_at = now();

update public.roles set hourly_rate = 0 where hourly_rate <> 0;
update public.workbook_crew set is_paid = false where is_paid;
update public.workbook_supplies set unit_price = 0 where unit_price <> 0;

alter table public.roles
  drop constraint if exists roles_public_hourly_rate_zero,
  add constraint roles_public_hourly_rate_zero check (hourly_rate = 0);
alter table public.workbook_crew
  drop constraint if exists workbook_crew_public_is_paid_false,
  add constraint workbook_crew_public_is_paid_false check (is_paid = false);
alter table public.workbook_supplies
  drop constraint if exists workbook_supplies_public_unit_price_zero,
  add constraint workbook_supplies_public_unit_price_zero check (unit_price = 0);

comment on column public.roles.hourly_rate is
  'Compatibility field fixed at zero. Authoritative rates are in role_financials.';
comment on column public.workbook_crew.is_paid is
  'Compatibility field fixed at false. Authoritative paid status is in workbook_crew_financials.';
comment on column public.workbook_supplies.unit_price is
  'Compatibility field fixed at zero. Authoritative prices are in workbook_supply_financials.';

alter table public.role_financials enable row level security;
alter table public.workbook_crew_financials enable row level security;
alter table public.workbook_supply_financials enable row level security;

revoke all on public.role_financials from public, anon, authenticated;
revoke all on public.workbook_crew_financials from public, anon, authenticated;
revoke all on public.workbook_supply_financials from public, anon, authenticated;

grant all on public.role_financials to service_role;
grant all on public.workbook_crew_financials to service_role;
grant all on public.workbook_supply_financials to service_role;

create or replace function public.admin_save_role(
  target_role_id uuid,
  role_name text,
  role_hourly_rate numeric,
  role_department_id uuid,
  role_sort_order integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_role_id uuid;
begin
  if btrim(coalesce(role_name, '')) = '' then
    raise exception 'Role name is required';
  end if;
  if coalesce(role_hourly_rate, 0) < 0 then
    raise exception 'Hourly rate cannot be negative';
  end if;

  if target_role_id is null then
    insert into public.roles (name, hourly_rate, department_id, sort_order)
    values (btrim(role_name), 0, role_department_id, coalesce(role_sort_order, 0))
    returning id into saved_role_id;
  else
    update public.roles
       set name = btrim(role_name),
           department_id = role_department_id,
           sort_order = coalesce(role_sort_order, sort_order)
     where id = target_role_id
    returning id into saved_role_id;
    if saved_role_id is null then raise exception 'Role not found'; end if;
  end if;

  insert into public.role_financials (role_id, hourly_rate, updated_at)
  values (saved_role_id, coalesce(role_hourly_rate, 0), now())
  on conflict (role_id) do update set
    hourly_rate = excluded.hourly_rate,
    updated_at = now();

  return saved_role_id;
end;
$$;

create or replace function public.admin_reorder_roles(ordered_ids uuid[])
returns void
language sql
security definer
set search_path = public
as $$
  update public.roles as role
     set sort_order = (ordered.position - 1)::integer
    from unnest(ordered_ids) with ordinality as ordered(id, position)
   where role.id = ordered.id;
$$;

create or replace function public.admin_set_crew_paid(
  target_crew_id uuid,
  paid boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.workbook_crew where id = target_crew_id) then
    raise exception 'Crew member not found';
  end if;

  insert into public.workbook_crew_financials (crew_id, is_paid, updated_at)
  values (target_crew_id, coalesce(paid, false), now())
  on conflict (crew_id) do update set
    is_paid = excluded.is_paid,
    updated_at = now();
end;
$$;

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
begin
  if btrim(coalesce(target_item_name, '')) = '' then
    raise exception 'Supply item name is required';
  end if;
  if coalesce(target_quantity, 0) < 0 or coalesce(target_unit_price, 0) < 0 then
    raise exception 'Supply quantity and price cannot be negative';
  end if;

  if target_supply_id is null then
    select coalesce(max(sort_order), -1) + 1 into next_sort_order
      from public.workbook_supplies
     where workbook_id = target_workbook_id;

    insert into public.workbook_supplies (
      workbook_id,
      department_id,
      item_name,
      description,
      quantity,
      unit_price,
      purchase_url,
      sort_order,
      updated_at
    ) values (
      target_workbook_id,
      target_department_id,
      btrim(target_item_name),
      nullif(btrim(coalesce(target_description, '')), ''),
      coalesce(target_quantity, 0),
      0,
      nullif(btrim(coalesce(target_purchase_url, '')), ''),
      next_sort_order,
      now()
    ) returning id into saved_supply_id;
  else
    update public.workbook_supplies
       set department_id = target_department_id,
           item_name = btrim(target_item_name),
           description = nullif(btrim(coalesce(target_description, '')), ''),
           quantity = coalesce(target_quantity, 0),
           purchase_url = nullif(btrim(coalesce(target_purchase_url, '')), ''),
           updated_at = now()
     where id = target_supply_id
       and workbook_id = target_workbook_id
    returning id into saved_supply_id;
    if saved_supply_id is null then raise exception 'Supply item not found'; end if;
  end if;

  insert into public.workbook_supply_financials (supply_id, unit_price, updated_at)
  values (saved_supply_id, coalesce(target_unit_price, 0), now())
  on conflict (supply_id) do update set
    unit_price = excluded.unit_price,
    updated_at = now();

  return saved_supply_id;
end;
$$;

revoke all on function public.admin_save_role(uuid, text, numeric, uuid, integer) from public, anon, authenticated;
revoke all on function public.admin_reorder_roles(uuid[]) from public, anon, authenticated;
revoke all on function public.admin_set_crew_paid(uuid, boolean) from public, anon, authenticated;
revoke all on function public.admin_save_workbook_supply(uuid, uuid, uuid, text, text, numeric, numeric, text) from public, anon, authenticated;

grant execute on function public.admin_save_role(uuid, text, numeric, uuid, integer) to service_role;
grant execute on function public.admin_reorder_roles(uuid[]) to service_role;
grant execute on function public.admin_set_crew_paid(uuid, boolean) to service_role;
grant execute on function public.admin_save_workbook_supply(uuid, uuid, uuid, text, text, numeric, numeric, text) to service_role;
