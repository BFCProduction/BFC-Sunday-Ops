-- Preserve a public roster display name on linked workbook crew rows. Operators
-- can read workbook_crew but do not receive access to the protected users table.

update public.workbook_crew as crew
set person_name = app_user.name,
    updated_at = now()
from public.users as app_user
where crew.user_id = app_user.id
  and (crew.person_name is null or btrim(crew.person_name) = '');

comment on column public.workbook_crew.person_name is
  'Roster display name retained for manual guests and linked users so non-admin workbook readers do not need users-table access.';
