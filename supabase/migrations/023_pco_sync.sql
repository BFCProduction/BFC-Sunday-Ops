-- ─────────────────────────────────────────────────────────────────────────────
-- 023_pco_sync.sql — Planning Center Event Sync
--
-- Adds PCO OAuth token storage to user_sessions so the pco-sync edge function
-- can make authenticated calls to the PCO API on behalf of the logged-in user.
--
-- service_types.pco_service_type_id already exists from migration 017 (but the
-- values were never seeded). This migration seeds them with the known IDs.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Store PCO OAuth tokens on the session row ─────────────────────────────────
-- The pco-auth edge function exchanges the OAuth code for these tokens and saves
-- them here. The pco-sync function reads pco_access_token to call the PCO API.
alter table public.user_sessions
  add column if not exists pco_access_token     text,
  add column if not exists pco_refresh_token    text,
  add column if not exists pco_token_expires_at timestamptz;

-- ── Seed PCO service type IDs ─────────────────────────────────────────────────
-- These are the numeric IDs from Planning Center for each service type.
-- Look them up at: https://api.planningcenteronline.com/services/v2/service_types
update public.service_types set pco_service_type_id = '30897'  where slug = 'sunday-9am';
update public.service_types set pco_service_type_id = '27010'  where slug = 'sunday-11am';
update public.service_types set pco_service_type_id = '571895' where slug = 'special';
