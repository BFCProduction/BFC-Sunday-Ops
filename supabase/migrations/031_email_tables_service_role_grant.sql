-- Migration 031: Grant service_role access to email config tables.
--
-- report_email_settings, report_email_recipients, and report_email_runs have
-- RLS enabled with restrictive deny-all policies for anon/authenticated users,
-- but were never explicitly granted to service_role. The send-sunday-summary.js
-- script runs with the service key and needs full access to these tables.
-- Same pattern as migrations 024–026.

grant all on public.report_email_settings   to service_role;
grant all on public.report_email_recipients to service_role;
grant all on public.report_email_runs       to service_role;
