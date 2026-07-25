-- 049_roles_department.sql
--
-- Attach a department to each crew role (Production Config). The is_paid_default
-- column on roles is no longer used by the UI (paid/volunteer is set per crew
-- assignment); it's left in place, unused, to avoid a destructive change.

alter table public.roles
  add column if not exists department_id uuid references public.departments(id) on delete set null;

create index if not exists roles_department_idx on public.roles(department_id);
