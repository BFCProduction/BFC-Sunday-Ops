-- ─────────────────────────────────────────────────────────────────────────────
-- 041_event_native_weather_config.sql
--
-- Weather configuration is now event-level. Legacy rows keyed as `default`,
-- `sunday-9am`, and `sunday-11am` remain only as templates for seeding new
-- event-owned config rows.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.weather_config
  add column if not exists event_id uuid references public.events(id) on delete cascade;

create unique index if not exists weather_config_event_id_unique
  on public.weather_config(event_id)
  where event_id is not null;

create index if not exists weather_config_event_idx
  on public.weather_config(event_id);

-- Seed every existing event from the most specific legacy template available:
-- service-type key first, then `default`.
insert into public.weather_config (
  key,
  event_id,
  location_label,
  zip_code,
  pull_day,
  pull_time,
  created_at,
  updated_at
)
select
  'event:' || e.id::text,
  e.id,
  cfg.location_label,
  cfg.zip_code,
  cfg.pull_day,
  cfg.pull_time,
  now(),
  now()
from public.events e
join public.service_types st
  on st.id = e.service_type_id
join lateral (
  select wc.*
  from public.weather_config wc
  where wc.event_id is null
    and wc.key in (st.slug, 'default')
  order by case when wc.key = st.slug then 0 else 1 end
  limit 1
) cfg on true
where not exists (
  select 1
  from public.weather_config existing
  where existing.event_id = e.id
)
on conflict (key) do nothing;

create or replace function public.seed_event_weather_config()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  service_slug text;
  source_config public.weather_config%rowtype;
begin
  select slug into service_slug
  from public.service_types
  where id = new.service_type_id;

  select wc.* into source_config
  from public.weather_config wc
  where wc.event_id is null
    and wc.key in (service_slug, 'default')
  order by case when wc.key = service_slug then 0 else 1 end
  limit 1;

  if source_config.key is null then
    return new;
  end if;

  insert into public.weather_config (
    key,
    event_id,
    location_label,
    zip_code,
    pull_day,
    pull_time,
    created_at,
    updated_at
  )
  values (
    'event:' || new.id::text,
    new.id,
    source_config.location_label,
    source_config.zip_code,
    source_config.pull_day,
    source_config.pull_time,
    now(),
    now()
  )
  on conflict (key) do nothing;

  return new;
end;
$$;

drop trigger if exists seed_event_weather_config_after_insert on public.events;

create trigger seed_event_weather_config_after_insert
after insert on public.events
for each row
execute function public.seed_event_weather_config();
