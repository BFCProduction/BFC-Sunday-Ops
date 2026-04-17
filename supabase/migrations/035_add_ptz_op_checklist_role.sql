-- Allow checklist items to be assigned to the PTZ Op role.

alter table public.checklist_items
  drop constraint if exists checklist_items_role_check;

alter table public.checklist_items
  add constraint checklist_items_role_check
  check (role in ('A1', 'Video', 'Graphics', 'PTZ Op', 'Lighting', 'Stage'));
