-- 055_workbook_crew_manual_order.sql
--
-- PCO supplies the initial crew order for each attached event. Once an admin
-- drags that event's roster into a custom order, subsequent PCO syncs preserve
-- the local ordering while continuing to reconcile assignment membership.

alter table public.workbook_crew
  add column if not exists sort_order_overridden boolean not null default false;

comment on column public.workbook_crew.sort_order_overridden is
  'True after an admin manually reorders this crew row; PCO sync then preserves sort_order.';
