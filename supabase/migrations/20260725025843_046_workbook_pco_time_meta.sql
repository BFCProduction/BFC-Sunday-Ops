-- 046_workbook_pco_time_meta.sql
--
-- PCO plan times are pulled into the workbook schedule read-only (PCO owns the
-- time). But which room and which departments a plan time belongs to is a
-- workbook-local decision. This overlay table stores just that annotation,
-- keyed by the stable PCO plan-time id, so the time itself is never stored and
-- stays in sync with PCO.

create table if not exists public.workbook_pco_time_meta (
  id           uuid        primary key default gen_random_uuid(),
  workbook_id  uuid        not null references public.workbooks(id) on delete cascade,
  event_id     uuid        not null references public.events(id) on delete cascade,
  pco_time_id  text        not null,
  location_id  uuid        references public.locations(id) on delete set null,
  departments  text[]      not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (event_id, pco_time_id)
);

create index if not exists workbook_pco_time_meta_event_idx on public.workbook_pco_time_meta(event_id);
create index if not exists workbook_pco_time_meta_workbook_idx on public.workbook_pco_time_meta(workbook_id);

alter table public.workbook_pco_time_meta enable row level security;

create policy "public_all" on public.workbook_pco_time_meta for all using (true) with check (true);

grant select, insert, update, delete on public.workbook_pco_time_meta to anon, authenticated;
grant all on public.workbook_pco_time_meta to service_role;
