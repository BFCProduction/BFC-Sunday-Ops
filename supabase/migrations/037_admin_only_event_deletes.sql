-- Only the admin edge function should delete unified Sunday Ops events.
-- Public clients can still read, create, and update events through the app,
-- but event deletion now requires the service role after admin session checks.

drop policy if exists "public_all_events" on public.events;

create policy "public_read_events" on public.events
  for select using (true);

create policy "public_insert_events" on public.events
  for insert with check (true);

create policy "public_update_events" on public.events
  for update using (true) with check (true);

revoke delete on table public.events from anon, authenticated;
grant select, insert, update on public.events to anon, authenticated;
grant all on public.events to service_role;
