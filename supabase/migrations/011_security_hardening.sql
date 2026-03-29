-- 011_security_hardening.sql
-- Security hardening: tighten storage delete policy and document email table access.

-- ── Storage: drop public delete on issue-photos ──────────────────────────────
-- The original setup (README) granted any anonymous user the ability to delete
-- any file in the issue-photos bucket. Only the service role (edge functions /
-- server-side scripts) should be able to delete storage objects.

drop policy if exists "allow public deletes" on storage.objects;

-- ── Email config tables: explicit no-public-access policies ──────────────────
-- These tables already have RLS enabled (migration 006). With RLS on and no
-- policies, Supabase denies all anon/authenticated access by default. The
-- policies below make that intent explicit and guard against accidental future
-- policy additions that could open access.

-- report_email_settings
create policy "deny anon access to email settings"
  on report_email_settings
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- report_email_recipients
create policy "deny anon access to email recipients"
  on report_email_recipients
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- report_email_runs
create policy "deny anon access to email runs"
  on report_email_runs
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);
