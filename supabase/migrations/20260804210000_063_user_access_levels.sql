-- 063_user_access_levels.sql
--
-- Introduce the agreed User / Manager / Admin access model without breaking
-- deployed callers that still read or write users.is_admin. access_level is the
-- durable authorization field; is_admin remains a synchronized compatibility
-- column until every older client and function has migrated.

alter table public.users
  add column if not exists access_level text;

update public.users
   set access_level = case when is_admin then 'admin' else 'user' end
 where access_level is null;

alter table public.users
  alter column access_level set default 'user',
  alter column access_level set not null;

alter table public.users
  drop constraint if exists users_access_level_check;

alter table public.users
  add constraint users_access_level_check
  check (access_level in ('user', 'manager', 'admin'));

comment on column public.users.access_level is
  'Server-enforced Sunday Ops access level: user, manager, or admin.';
comment on column public.users.is_admin is
  'Compatibility mirror of access_level = admin. New authorization must use access_level.';

create or replace function public.sync_user_access_level()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.is_admin then
      new.access_level := 'admin';
    else
      new.is_admin := new.access_level = 'admin';
    end if;
    return new;
  end if;

  if new.access_level is distinct from old.access_level then
    new.is_admin := new.access_level = 'admin';
  elsif new.is_admin is distinct from old.is_admin then
    new.access_level := case when new.is_admin then 'admin' else 'user' end;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_user_access_level_trigger on public.users;
create trigger sync_user_access_level_trigger
before insert or update of access_level, is_admin
on public.users
for each row execute function public.sync_user_access_level();

-- Re-run the mirror after installing the trigger so historical rows are
-- guaranteed to agree even if a partially applied development migration left
-- the compatibility column out of sync.
update public.users
   set is_admin = access_level = 'admin'
 where is_admin is distinct from (access_level = 'admin');
