-- ─────────────────────────────────────────────────────────────────────────────
-- 015_pco_auth.sql
-- PCO OAuth users and session tokens
-- ─────────────────────────────────────────────────────────────────────────────

-- Users authenticated via Planning Center OAuth
create table if not exists public.users (
  id          uuid        primary key default gen_random_uuid(),
  pco_id      text        unique not null,
  name        text        not null,
  email       text,
  avatar_url  text,
  is_admin    boolean     not null default false,
  created_at  timestamptz not null default now(),
  last_login  timestamptz
);

comment on table  public.users             is 'App users authenticated via PCO OAuth';
comment on column public.users.pco_id      is 'Planning Center person ID';
comment on column public.users.is_admin    is 'Grants access to admin-only features; set manually per user';

-- Session tokens (issued after successful PCO OAuth exchange)
create table if not exists public.user_sessions (
  token        text        primary key default gen_random_uuid()::text,
  user_id      uuid        not null references public.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '30 days'),
  last_used_at timestamptz not null default now()
);

comment on table public.user_sessions is 'Active session tokens for authenticated users';

create index if not exists user_sessions_user_id_idx   on public.user_sessions(user_id);
create index if not exists user_sessions_expires_at_idx on public.user_sessions(expires_at);

-- RLS: both tables are managed exclusively through edge functions via service role.
-- No direct client access.
alter table public.users         enable row level security;
alter table public.user_sessions enable row level security;

create policy "no_direct_access_users"    on public.users         using (false);
create policy "no_direct_access_sessions" on public.user_sessions using (false);

-- Edge functions run as service_role; grant table access explicitly
grant all on public.users         to service_role;
grant all on public.user_sessions to service_role;
