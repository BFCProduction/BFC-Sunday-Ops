-- ─────────────────────────────────────────────────────────────────────────────
-- 027_fix_events_unique_constraint.sql
--
-- The broad unique constraint (service_type_id, event_date) correctly prevents
-- duplicate Sunday 9am/11am events, but also prevents multiple special events
-- on the same date (e.g. a funeral and a wedding both on a Saturday).
--
-- Fix: drop the broad constraint and replace it with two partial unique indexes
-- scoped to each Sunday service type only.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.events
  drop constraint if exists events_service_type_date_unique;

-- Create partial unique indexes for Sunday services only.
-- We use dynamic SQL because the service_type UUIDs are not known until runtime.
do $$
declare
  st_9am_id  uuid;
  st_11am_id uuid;
begin
  select id into st_9am_id  from public.service_types where slug = 'sunday-9am';
  select id into st_11am_id from public.service_types where slug = 'sunday-11am';

  execute format(
    'create unique index if not exists events_9am_date_unique
       on public.events (event_date)
       where service_type_id = %L',
    st_9am_id
  );

  execute format(
    'create unique index if not exists events_11am_date_unique
       on public.events (event_date)
       where service_type_id = %L',
    st_11am_id
  );
end $$;
