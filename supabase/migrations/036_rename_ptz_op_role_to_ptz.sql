-- Rename the checklist role from "PTZ Op" to "PTZ".

alter table public.checklist_items
  drop constraint if exists checklist_items_role_check;

update public.checklist_items
set role = 'PTZ'
where role = 'PTZ Op';

alter table public.checklist_items
  add constraint checklist_items_role_check
  check (role in ('A1', 'Video', 'Graphics', 'PTZ', 'Lighting', 'Stage'));
