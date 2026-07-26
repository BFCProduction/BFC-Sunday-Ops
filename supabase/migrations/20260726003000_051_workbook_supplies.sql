-- 051_workbook_supplies.sql
--
-- Workbook-wide shopping list for event supplies. Departments are optional
-- account-level references; quantity and price remain numeric so the workbook
-- can show an estimated line total and grand total without storing derived data.

create table if not exists public.workbook_supplies (
  id             uuid          primary key default gen_random_uuid(),
  workbook_id    uuid          not null references public.workbooks(id) on delete cascade,
  department_id  uuid          references public.departments(id) on delete set null,
  item_name      text          not null check (btrim(item_name) <> ''),
  description    text,
  quantity       numeric(12,2) not null default 1 check (quantity >= 0),
  unit_price     numeric(12,2) not null default 0 check (unit_price >= 0),
  purchase_url   text,
  sort_order     integer       not null default 0,
  created_at     timestamptz   not null default now(),
  updated_at     timestamptz   not null default now()
);

create index if not exists workbook_supplies_workbook_sort_idx
  on public.workbook_supplies(workbook_id, sort_order, created_at);
create index if not exists workbook_supplies_department_idx
  on public.workbook_supplies(department_id);

-- Match the current admin-gated Workbook client pattern. These writes move
-- behind verified server-side authorization in the broader RLS hardening pass.
alter table public.workbook_supplies enable row level security;

create policy "public_all" on public.workbook_supplies
  for all using (true) with check (true);

grant select, insert, update, delete on public.workbook_supplies to anon, authenticated;
grant all on public.workbook_supplies to service_role;
