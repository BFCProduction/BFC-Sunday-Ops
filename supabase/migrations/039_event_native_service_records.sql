-- ─────────────────────────────────────────────────────────────────────────────
-- 039_event_native_service_records.sql
--
-- Moves the highest-trust operational paths toward event-native records.
--
-- The app convention for event-scoped attendance/loudness rows is:
--   one row per events.id, with the event value stored in service_1_* columns.
--
-- Legacy Sunday rows are preserved for audit/history, then copied into
-- event-scoped rows for the matching Sunday 9am / 11am events.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Split legacy attendance into event rows ──────────────────────────────────

with split_attendance as (
  select
    e.id as event_id,
    case st.slug
      when 'sunday-11am' then a.service_2_count
      else a.service_1_count
    end as service_1_count,
    a.notes,
    a.submitted_at
  from public.attendance a
  join public.events e
    on e.legacy_sunday_id = a.sunday_id
  join public.service_types st
    on st.id = e.service_type_id
  where a.event_id is null
    and a.sunday_id is not null
    and st.slug in ('sunday-9am', 'sunday-11am')
    and (
      a.notes is not null
      or (st.slug = 'sunday-9am' and a.service_1_count is not null)
      or (st.slug = 'sunday-11am' and a.service_2_count is not null)
    )
)
insert into public.attendance (event_id, service_1_count, service_2_count, notes, submitted_at)
select event_id, service_1_count, null, notes, submitted_at
from split_attendance
on conflict do nothing;

with split_attendance as (
  select
    e.id as event_id,
    case st.slug
      when 'sunday-11am' then a.service_2_count
      else a.service_1_count
    end as service_1_count,
    a.notes
  from public.attendance a
  join public.events e
    on e.legacy_sunday_id = a.sunday_id
  join public.service_types st
    on st.id = e.service_type_id
  where a.event_id is null
    and a.sunday_id is not null
    and st.slug in ('sunday-9am', 'sunday-11am')
)
update public.attendance current
set
  service_1_count = coalesce(current.service_1_count, split.service_1_count),
  notes = coalesce(current.notes, split.notes)
from split_attendance split
where current.event_id = split.event_id
  and current.sunday_id is null;

-- ── Split legacy loudness into event rows ────────────────────────────────────

with split_loudness as (
  select
    e.id as event_id,
    case st.slug when 'sunday-11am' then l.service_2_max_db   else l.service_1_max_db   end as service_1_max_db,
    case st.slug when 'sunday-11am' then l.service_2_laeq     else l.service_1_laeq     end as service_1_laeq,
    case st.slug when 'sunday-11am' then l.service_2_max_db_c else l.service_1_max_db_c end as service_1_max_db_c,
    case st.slug when 'sunday-11am' then l.service_2_lceq     else l.service_1_lceq     end as service_1_lceq,
    l.logged_at
  from public.loudness l
  join public.events e
    on e.legacy_sunday_id = l.sunday_id
  join public.service_types st
    on st.id = e.service_type_id
  where l.event_id is null
    and l.sunday_id is not null
    and st.slug in ('sunday-9am', 'sunday-11am')
    and (
      (st.slug = 'sunday-9am' and (
        l.service_1_max_db is not null or l.service_1_laeq is not null or
        l.service_1_max_db_c is not null or l.service_1_lceq is not null
      ))
      or
      (st.slug = 'sunday-11am' and (
        l.service_2_max_db is not null or l.service_2_laeq is not null or
        l.service_2_max_db_c is not null or l.service_2_lceq is not null
      ))
    )
)
insert into public.loudness (
  event_id,
  service_1_max_db, service_1_laeq, service_1_max_db_c, service_1_lceq,
  logged_at
)
select
  event_id,
  service_1_max_db, service_1_laeq, service_1_max_db_c, service_1_lceq,
  logged_at
from split_loudness
on conflict do nothing;

with split_loudness as (
  select
    e.id as event_id,
    case st.slug when 'sunday-11am' then l.service_2_max_db   else l.service_1_max_db   end as service_1_max_db,
    case st.slug when 'sunday-11am' then l.service_2_laeq     else l.service_1_laeq     end as service_1_laeq,
    case st.slug when 'sunday-11am' then l.service_2_max_db_c else l.service_1_max_db_c end as service_1_max_db_c,
    case st.slug when 'sunday-11am' then l.service_2_lceq     else l.service_1_lceq     end as service_1_lceq
  from public.loudness l
  join public.events e
    on e.legacy_sunday_id = l.sunday_id
  join public.service_types st
    on st.id = e.service_type_id
  where l.event_id is null
    and l.sunday_id is not null
    and st.slug in ('sunday-9am', 'sunday-11am')
)
update public.loudness current
set
  service_1_max_db = coalesce(current.service_1_max_db, split.service_1_max_db),
  service_1_laeq = coalesce(current.service_1_laeq, split.service_1_laeq),
  service_1_max_db_c = coalesce(current.service_1_max_db_c, split.service_1_max_db_c),
  service_1_lceq = coalesce(current.service_1_lceq, split.service_1_lceq)
from split_loudness split
where current.event_id = split.event_id
  and current.sunday_id is null;

-- ── Copy legacy Sunday weather onto each Sunday service event ────────────────

with split_weather as (
  select
    e.id as event_id,
    w.temp_f,
    w.condition,
    w.wind_mph,
    w.humidity,
    w.fetched_at
  from public.weather w
  join public.events e
    on e.legacy_sunday_id = w.sunday_id
  join public.service_types st
    on st.id = e.service_type_id
  where w.event_id is null
    and w.sunday_id is not null
    and st.slug in ('sunday-9am', 'sunday-11am')
    and (
      w.temp_f is not null or w.condition is not null or
      w.wind_mph is not null or w.humidity is not null
    )
)
insert into public.weather (event_id, temp_f, condition, wind_mph, humidity, fetched_at)
select event_id, temp_f, condition, wind_mph, humidity, fetched_at
from split_weather
on conflict do nothing;

with split_weather as (
  select
    e.id as event_id,
    w.temp_f,
    w.condition,
    w.wind_mph,
    w.humidity
  from public.weather w
  join public.events e
    on e.legacy_sunday_id = w.sunday_id
  join public.service_types st
    on st.id = e.service_type_id
  where w.event_id is null
    and w.sunday_id is not null
    and st.slug in ('sunday-9am', 'sunday-11am')
)
update public.weather current
set
  temp_f = coalesce(current.temp_f, split.temp_f),
  condition = coalesce(current.condition, split.condition),
  wind_mph = coalesce(current.wind_mph, split.wind_mph),
  humidity = coalesce(current.humidity, split.humidity)
from split_weather split
where current.event_id = split.event_id
  and current.sunday_id is null;

-- ── Copy legacy runtime/checklist values into matching event scopes ──────────

insert into public.runtime_values (event_id, field_id, value, captured_at)
select
  e.id,
  rv.field_id,
  rv.value,
  rv.captured_at
from public.runtime_values rv
join public.events e
  on e.legacy_sunday_id = rv.sunday_id
join public.service_types st
  on st.id = e.service_type_id
left join public.runtime_fields rf
  on rf.id = rv.field_id
where rv.event_id is null
  and rv.sunday_id is not null
  and st.slug in ('sunday-9am', 'sunday-11am')
  and (rf.service_type_slug is null or rf.service_type_slug = st.slug)
on conflict do nothing;

insert into public.checklist_completions (event_id, item_id, initials, completed_at)
select
  e.id,
  cc.item_id,
  cc.initials,
  cc.completed_at
from public.checklist_completions cc
join public.events e
  on e.legacy_sunday_id = cc.sunday_id
join public.service_types st
  on st.id = e.service_type_id
left join public.checklist_items ci
  on ci.id = cc.item_id
where cc.event_id is null
  and cc.sunday_id is not null
  and st.slug in ('sunday-9am', 'sunday-11am')
  and (ci.service_type_slug is null or ci.service_type_slug = st.slug)
on conflict do nothing;

-- ── Make service_records event-native ────────────────────────────────────────

alter table public.service_records
  add column if not exists event_id uuid;

-- Backfill regular service_records by legacy Sunday bridge when available.
with candidates as (
  select
    sr.id as service_record_id,
    e.id as event_id,
    (sr.sunday_id is not null and sr.sunday_id = e.legacy_sunday_id) as legacy_match,
    count(*) over (partition by sr.id) as candidate_count,
    row_number() over (
      partition by sr.id
      order by
        (sr.sunday_id is not null and sr.sunday_id = e.legacy_sunday_id) desc,
        e.event_time nulls last,
        e.created_at
    ) as rn
  from public.service_records sr
  join public.service_types st
    on (
      (sr.service_type = 'regular_9am' and st.slug = 'sunday-9am') or
      (sr.service_type = 'regular_11am' and st.slug = 'sunday-11am')
    )
  join public.events e
    on e.service_type_id = st.id
   and e.event_date = sr.service_date
  where sr.event_id is null
    and sr.service_type in ('regular_9am', 'regular_11am')
)
update public.service_records sr
set event_id = candidates.event_id
from candidates
where sr.id = candidates.service_record_id
  and candidates.rn = 1
  and (candidates.legacy_match or candidates.candidate_count = 1);

-- Backfill special service_records when the label/date unambiguously match.
with candidates as (
  select
    sr.id as service_record_id,
    e.id as event_id,
    count(*) over (partition by sr.id) as candidate_count,
    row_number() over (partition by sr.id order by e.event_time nulls last, e.created_at) as rn
  from public.service_records sr
  join public.service_types st
    on st.slug = 'special'
  join public.events e
    on e.service_type_id = st.id
   and e.event_date = sr.service_date
   and e.name = sr.service_label
  where sr.event_id is null
    and sr.service_type = 'special'
    and sr.service_label is not null
)
update public.service_records sr
set event_id = candidates.event_id
from candidates
where sr.id = candidates.service_record_id
  and candidates.rn = 1
  and candidates.candidate_count = 1;

-- The original unique indexes keyed regular services by date/type and specials
-- by date/label. Those block multiple same-type events on one date. Keep legacy
-- uniqueness only for rows that have not yet been attached to an event.
drop index if exists public.service_records_regular_unique;
drop index if exists public.service_records_special_unique;

create unique index if not exists service_records_event_id_unique
  on public.service_records(event_id)
  where event_id is not null;

create unique index if not exists service_records_legacy_regular_unique
  on public.service_records(service_date, service_type)
  where event_id is null
    and service_type in ('regular_9am', 'regular_11am');

create unique index if not exists service_records_legacy_special_unique
  on public.service_records(service_date, service_label)
  where event_id is null
    and service_type = 'special';

create index if not exists service_records_event_idx
  on public.service_records(event_id);

-- Reassert the event FK in case an environment stopped before migration 029.
alter table public.service_records
  drop constraint if exists service_records_event_id_fkey;

alter table public.service_records
  add constraint service_records_event_id_fkey
  foreign key (event_id) references public.events(id) on delete set null;

-- ── Analytics view: expose event identity and actual event labels ────────────

create or replace view public.analytics_records as
  select
    sr.id::text as id,
    sr.service_date,
    case sr.service_type
      when 'regular_9am'  then 'sunday-9am'
      when 'regular_11am' then 'sunday-11am'
      else sr.service_type
    end as service_type,
    sr.service_label,
    sr.in_person_attendance,
    sr.church_online_views,
    sr.church_online_unique_viewers,
    sr.church_online_avg_watch_time_secs,
    sr.youtube_unique_viewers,
    sr.service_run_time_secs,
    sr.message_run_time_secs,
    sr.stage_flip_time_secs,
    sr.weather_temp_f,
    sr.weather_condition,
    sr.max_db_a_slow,
    sr.la_eq_15,
    sr.max_db_c_slow,
    sr.lc_eq_15,
    sr.event_id::text as event_id,
    e.name as event_name,
    e.event_time,
    coalesce(st.name, sr.service_label) as service_type_label,
    sr.service_type as service_record_type
  from public.service_records sr
  left join public.events e
    on e.id = sr.event_id
  left join public.service_types st
    on st.id = e.service_type_id;

grant select on public.analytics_records to anon, authenticated, service_role;
