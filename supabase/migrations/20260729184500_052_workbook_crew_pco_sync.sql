-- 052_workbook_crew_pco_sync.sql
--
-- Track the Planning Center assignment behind an event-scoped workbook crew
-- row. PCO owns whether the person is assigned to the plan; Sunday Ops owns
-- workbook-only details such as call/release times, paid status, and any local
-- role override.

alter table public.workbook_crew
  add column if not exists source text not null default 'manual',
  add column if not exists pco_plan_person_id text,
  add column if not exists pco_person_id text,
  add column if not exists pco_role_name text,
  add column if not exists pco_status text,
  add column if not exists pco_photo_url text,
  add column if not exists pco_synced_at timestamptz;

alter table public.workbook_crew
  drop constraint if exists workbook_crew_source_check;

alter table public.workbook_crew
  add constraint workbook_crew_source_check
  check (source in ('manual', 'pco'));

create unique index if not exists workbook_crew_pco_assignment_unique
  on public.workbook_crew(event_id, pco_plan_person_id)
  where event_id is not null and pco_plan_person_id is not null;

create index if not exists workbook_crew_pco_person_idx
  on public.workbook_crew(pco_person_id)
  where pco_person_id is not null;

comment on column public.workbook_crew.source is
  'manual for Sunday Ops-authored rows; pco for rows mirrored from a linked PCO plan';

comment on column public.workbook_crew.pco_plan_person_id is
  'Stable PCO PlanPerson assignment id used to update the same imported row without duplicating it';

comment on column public.workbook_crew.pco_role_name is
  'PCO team-position label; retained when it does not map to a configured Sunday Ops role';
