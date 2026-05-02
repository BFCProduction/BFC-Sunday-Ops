-- Migration 042: Treat regular Sunday services as event-scoped checklists.
--
-- event_checklist_items / event_checklist_completions already reference
-- events(id). This migration snapshots the shared Sunday checklist blueprint
-- into every existing Sunday event and copies old checklist completions into
-- the event checklist completion table.

alter table public.event_template_items
  add column if not exists role text;

alter table public.event_checklist_items
  add column if not exists role text;

create index if not exists event_checklist_items_source_checklist_idx
  on public.event_checklist_items(event_id, source_checklist_item_id)
  where source_checklist_item_id is not null;

insert into public.event_checklist_items (
  event_id,
  source_checklist_item_id,
  label,
  role,
  section,
  subsection,
  item_notes,
  sort_order
)
select
  e.id,
  ci.id,
  ci.task,
  ci.role,
  ci.section,
  ci.subsection,
  ci.note,
  ci.sort_order
from public.events e
join public.service_types st
  on st.id = e.service_type_id
join public.checklist_items ci
  on ci.service_type_slug is null
  or ci.service_type_slug = st.slug
where st.slug in ('sunday-9am', 'sunday-11am')
  and not exists (
    select 1
    from public.event_checklist_items existing
    where existing.event_id = e.id
      and existing.source_checklist_item_id = ci.id
  );

insert into public.event_checklist_completions (
  event_id,
  item_id,
  initials,
  completed_at
)
select
  cc.event_id,
  eci.id,
  cc.initials,
  cc.completed_at
from public.checklist_completions cc
join public.event_checklist_items eci
  on eci.event_id = cc.event_id
  and eci.source_checklist_item_id = cc.item_id
where cc.event_id is not null
on conflict (event_id, item_id) do nothing;

insert into public.event_checklist_completions (
  event_id,
  item_id,
  initials,
  completed_at
)
select
  e.id,
  eci.id,
  cc.initials,
  cc.completed_at
from public.checklist_completions cc
join public.events e
  on e.legacy_sunday_id = cc.sunday_id
join public.service_types st
  on st.id = e.service_type_id
join public.event_checklist_items eci
  on eci.event_id = e.id
  and eci.source_checklist_item_id = cc.item_id
left join public.checklist_items ci
  on ci.id = cc.item_id
where cc.sunday_id is not null
  and st.slug in ('sunday-9am', 'sunday-11am')
  and (ci.service_type_slug is null or ci.service_type_slug = st.slug)
on conflict (event_id, item_id) do nothing;
