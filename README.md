# BFC Sunday Ops

Internal Sunday-morning ops app for the BFC production team.

This project is intentionally a shared team tool, not a per-user or multi-account system. The main distinction is between normal operators using the app during a service and admins managing checklist items and ProPresenter runtime definitions.

Live app: [https://bfcproduction.github.io/BFC-Sunday-Ops/](https://bfcproduction.github.io/BFC-Sunday-Ops/)

## Current Scope

- Gameday checklist with initials, timestamps, and expandable item notes (Sunday and special events in one unified component)
- Issue log with severity tracking, photo attachments, resolution, and Monday.com follow-up sync
- Attendance, runtime, loudness, weather, and evaluation tabs
- Anonymous multi-submission post-service evaluation with outcome-based questions and aggregate response view
- Admin Settings page: PDF export, configurable church timezone, summary email management, and checklist template manager
- Admin mode for checklist items, runtime definitions, issue cleanup, and weather settings
- PDF service report export with logo, KPIs, issues, and evaluation responses
- ProPresenter relay script for runtime capture
- **Analytics screen** with Dashboard (6 KPI cards, trend charts, date-range filter) and Data Explorer tabs — powered by the `analytics_records` view
- **Special Events** — full operational support for non-Sunday services (Good Friday, Christmas Eve, etc.) with reusable templates, template seeding at event creation, per-event checklists, and unified chronological navigation
- **PCO sync** — Planning Center calendar plans pulled automatically on login and manually via Settings; upserted into the unified `events` table
- GitHub Pages deployment

## What Is Live vs Pending

Live now:
- Checklist data is seeded into Supabase on first run and then managed from the admin UI.
- Dashboard checklist counts now come from the live `checklist_items` table.
- Operators can set persistent checklist initials once and reuse them for multiple checkoffs.
- Checklist items with notes show a chevron indicator; tapping the task label slides the note open inline.
- Checklist section and subsection fields use dropdowns with an "Add new…" option in the item edit modal; free-text fallback is gone.
- Checklist items can be dragged to reorder within each section in admin mode; order is persisted to `sort_order`.
- Checklist completions and checklist items subscribe to Supabase Realtime so the list updates across devices without a page refresh.
- Issues capture a short title, description, severity, and optional photo attachments.
- Issue photos upload to Supabase Storage, display as thumbnail strips on each issue card, and open in a full-screen lightbox.
- Issues can be marked resolved; resolved issues move to a dimmed section and are excluded from the sidebar badge and dashboard alert.
- High-priority issue follow-up uses neutral operator-facing copy (`Flag for follow-up before next Sunday`), syncing to Monday.com when that integration is enabled.
- When photos are attached to a flagged issue, the photo URLs are included in the Monday item update.
- Runtime fields support ProPresenter's native zero-based timer index. `0` is the first clock.
- Runtime fields can also be manual-only by leaving the ProPresenter host blank.
- Runtime captured-at timestamps display in the configured church timezone, not the device timezone.
- Weather location and pull schedule can be configured in the admin UI.
- Weather is imported automatically on Sundays only via the weather workflow.
- Weather tab reads from Supabase if weather data exists and otherwise shows an honest empty state.
- Monday.com push can be enabled with the edge function and related secrets.
- Admins can delete issue log entries directly in the app (photos are cleaned up from Storage).
- Admin Settings page (gear icon in sidebar) provides PDF export, church timezone selection, and summary email management.
- Church timezone is configurable in Settings and stored in `app_config`; falls back to `America/Chicago`.
- PDF service report can be exported for the current Sunday or any of the previous 14 Sundays.
- Dynamic service phase indicator in the sidebar and header (Pre-Service, Service 1, Between Services, Service 2, Post-Service) updates every 60 seconds.
- Sunday summary email settings and recipients are managed in Settings → Summary Email.
- Sunday summary email can be sent automatically through Google Workspace Gmail API once the related secrets are configured.
- Post-service evaluation redesigned: anonymous multi-submission, outcome-based questions, conditional broken-moment detail, collapsible aggregate response view.
- BFC Production branding applied: logo in header, icon as favicon, iOS home screen icon. App name is "Sunday Ops" throughout.
- Header logo is always visible including on mobile viewports.
- Site header is sticky so it remains visible while scrolling.
- Desktop checklist uses a CSS two-column layout (`xl:columns-2`) that keeps sections from breaking across columns.
- Checklist subsection deduplication enforced — new items land in the existing subsection rather than creating a duplicate.
- Empty subsections are auto-deleted when the last item referencing them is removed.
- Loudness Log has separate 9 AM and 11 AM submission buttons, stored as a single row per Sunday (one row, two service readings).
- PDF service report intentionally excludes issue photo thumbnails.
- Historical loudness data imported from the BFC Audio Loudness Log Google Sheet — 144 Sundays (March 2023 – March 2026) via `scripts/import-loudness-history.js`.
- Loudness Log includes a "Full History PDF" button that generates a styled multi-year report matching the Sunday report aesthetic, grouped by year with per-year averages and goal exceedance flags.
- Sidebar date block has `‹` / `›` chevron arrows to step backward and forward through past Sundays. All screens reload with the selected Sunday's data. Past Sundays show an amber "Historical View" badge and a "Back to Today" link.
- On weekdays the app defaults to the most recent past Sunday rather than the upcoming one, so data entered during the week lands on the right record. The crossover point ("Sunday Focus Flip") is configurable in Settings.
- Service phase indicator time boundaries corrected: Pre-Service 7–9am, Service 1 9–10am, Between Services 10–11am, Service 2 11am–noon, Post-Service noon–6pm.
- Post-service evaluations now surface Supabase errors on submit instead of silently showing a false success screen.
- Settings page reorganized into **App Settings** (Timezone, Sunday Focus Flip) and **Reporting** (PDF export, summary email) sections.
- ProPresenter relay supports a `countdown_target` on any runtime field. When set, the relay reads ProPresenter's timer `state` (`overran` / `complete` / `stopped`) and computes the true elapsed time rather than storing the raw overrun value. Useful for message timers configured as countdown-with-overrun. Set once in the runtime field admin UI.
- New `--dump-timers` flag on the relay prints the full raw JSON for every timer on every connected ProPresenter host (useful for debugging and field setup).

- RESI analytics importer (`scripts/fetch-resi.js`) — logs in via Playwright, downloads the session CSV for the target Sunday, computes per-service stats, and writes to Supabase. Supports `--now`, `--date`, and `--dry-run` flags.

- **Special Events** (`src/components/admin/SpecialEventManager.tsx`, `src/components/admin/TemplateManager.tsx`, `src/screens/Checklist.tsx`):
  - Admin-managed event templates (reusable checklist blueprints) and special events with name, date, time, and template assignment.
  - Template seeding: when a template is selected in the QuickCreate modal, checklist items are snapshotted into the event at creation time — later template changes don't affect existing events.
  - Events appear chronologically in the sidebar alongside Sundays; prev/next navigation steps through all session types.
  - Per-event checklists: items can be added, edited, reordered, and deleted per-event in admin mode.
  - **Unified checklist component** (`src/screens/Checklist.tsx`) handles both Sunday and event modes — `isEvent` flag drives data source, form type, and subscription table.
  - All operational screens (issues, attendance, runtimes, loudness, weather, evaluations) work for events using the same `event_id` column pattern. `event_id` FKs on all operational tables now correctly reference `events(id)`.
  - Template manager in Settings → Checklist Templates (admin only).

- **Analytics screen** (`src/screens/Analytics/`) — three-tab layout:
  - **Dashboard**: 6 KPI cards (Avg Attendance, Avg Service Runtime, Avg Message Runtime, Avg Loudness, Avg Stream Views, Total Sundays), each with 9am/11am breakdown and period-over-period delta arrows. Date-range filter. All time values rounded to whole seconds.
  - **Data Explorer**: filterable table view with column-level sorting.
  - **Ask a Question**: placeholder for a future AI natural-language query interface.
  - Both tabs query the `analytics_records` view, which remaps legacy `service_type` enum values to the new slug format (`sunday-9am`, `sunday-11am`).

- **PCO sync** (`supabase/functions/pco-sync/`, `supabase/migrations/023_pco_sync.sql`):
  - Pulls upcoming service plans from Planning Center for each service type linked via `pco_service_type_id`.
  - Upserts into `events`: Sunday services matched by `(service_type_id, event_date)` or `pco_plan_id`; special events matched by `pco_plan_id` only.
  - Called automatically after login and manually via Settings → Sync Now (admin only).

- **`service_records` table** (`supabase/migrations/012_create_service_records.sql`) — unified analytics table with one row per service per Sunday, storing attendance, runtimes, loudness, weather, and stream analytics in one place.

- **Historical Gameday Checklist PDF extraction** (`scripts/extract-checklist-runtimes.js`) — one-shot script that scans 242 PDFs from the local Google Drive archive (Jun 2021–Mar 2026), extracts service runtime, message runtime, and stage flip time from each, and upserts into `service_records`. 465 rows backfilled.

Still pending:
- Real YouTube analytics importer (`scripts/fetch-youtube.js` is a stub)
- AI "Ask a Question" Analytics tab (Claude API via Supabase Edge Function)
- Attendance and Runtimes screens writing to `service_records` (LoudnessLog already syncs via `syncToServiceRecords`; others still use only legacy tables)
- Any downstream reporting beyond the Sunday summary email

Completed (previously listed as pending):
- Attendance and loudness data backfilled into `service_records` from legacy tables.
- Sunday focus direction corrected (app now defaults to most recent past Sunday on weekdays).
- Evaluation submissions now fail loudly instead of silently.

## Tech Stack

- React + TypeScript + Vite
- Tailwind CSS
- Supabase
- GitHub Pages
- GitHub Actions
- Node.js relay scripts

## Supabase Tables

- `sundays` — legacy Sunday records (still used as source of truth for operational data)
- `service_types` — service type definitions (`sunday-9am`, `sunday-11am`, `special`)
- `events` — unified event instances (replaces the split between `sundays` and `special_events` in the navigation layer)
- `user_sessions` — PCO OAuth session tokens
- `checklist_items`
- `checklist_completions`
- `attendance`
- `runtime_fields`
- `runtime_values`
- `issues`
- `issue_photos`
- `loudness`
- `weather`
- `evaluations`
- `stream_analytics`
- `report_email_settings`
- `report_email_recipients`
- `report_email_runs`
- `app_config`
- `service_records` — unified analytics table (one row per service per Sunday); queried via the `analytics_records` view
- `event_templates` — reusable checklist blueprints for special events
- `event_template_items` — checklist items belonging to a template
- `special_events` — non-Sunday services (Good Friday, Christmas Eve, etc.)
- `event_checklist_items` — per-event checklist items (snapshotted from template at creation)
- `event_checklist_completions` — completions for event checklist items

Views:
- `analytics_records` — thin view over `service_records` that remaps legacy `service_type` enum values to the new slug format (`sunday-9am`, `sunday-11am`)

Fresh schema setup is represented by running all migrations in order:
- `supabase/migrations/001_initial_schema.sql`
- `supabase/migrations/002_align_runtime_and_checklist_tables.sql`
- `supabase/migrations/003_allow_manual_runtime_fields.sql`
- `supabase/migrations/004_add_weather_config.sql`
- `supabase/migrations/005_add_issue_titles.sql`
- `supabase/migrations/006_add_summary_email_config.sql`
- `supabase/migrations/007_add_issue_resolution.sql`
- `supabase/migrations/008_add_app_config.sql`
- `supabase/migrations/009_add_issue_photos.sql`
- `supabase/migrations/010_add_resi_events.sql`
- `supabase/migrations/011_security_hardening.sql`
- `supabase/migrations/012_create_service_records.sql`
- `supabase/migrations/013_add_c_weighted_loudness.sql`
- `supabase/migrations/014_add_countdown_target.sql`
- `supabase/migrations/015_pco_auth.sql`
- `supabase/migrations/016_add_special_events.sql`
- `supabase/migrations/017_service_types_and_events.sql`
- `supabase/migrations/018_events_unique_constraint.sql`
- `supabase/migrations/019_grant_events_permissions.sql`
- `supabase/migrations/020_runtime_fields_service_scope.sql`
- `supabase/migrations/021_checklist_event_native.sql`
- `supabase/migrations/022_checklist_completions_nullable_sunday.sql`
- `supabase/migrations/023_pco_sync.sql`
- `supabase/migrations/024_service_types_service_role_grant.sql`
- `supabase/migrations/025_events_service_role_grant.sql`
- `supabase/migrations/026_app_config_service_role_grant.sql`
- `supabase/migrations/027_fix_events_unique_constraint.sql`
- `supabase/migrations/028_analytics_records_view.sql`
- `supabase/migrations/029_fix_event_id_fk_to_events.sql`

### Evaluation Table Migration (2026-03-22)

The `evaluations` table was redesigned. Run this in the Supabase SQL editor:

```sql
drop table if exists evaluations;

create table evaluations (
  id                   uuid         primary key default gen_random_uuid(),
  sunday_id            text         not null,
  submitted_at         timestamptz  not null default now(),
  service_feel         text,        -- 'excellent' | 'solid' | 'rough_spots' | 'significant_issues'
  broken_moment        boolean,
  broken_moment_detail text,
  went_well            text,
  needed_attention     text,
  area_notes           text
);

alter table evaluations enable row level security;

create policy "Anyone can read evaluations"
  on evaluations for select using (true);

create policy "Anyone can submit evaluations"
  on evaluations for insert with check (true);
```

## Local Development

```bash
npm install --legacy-peer-deps
cp .env.example .env.local
npm run dev
```

The app runs at `http://localhost:5173/BFC-Sunday-Ops/`.

## Environment Variables

Frontend:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
VITE_ADMIN_PASSWORD=choose_a_shared_admin_password
VITE_ENABLE_MONDAY_PUSH=false
```

Admin / edge functions:

```bash
ADMIN_PASSWORD=choose_the_server_side_admin_password
```

Server-side scripts / edge functions:

```bash
SUPABASE_SERVICE_KEY=your_service_role_key
MONDAY_API_TOKEN=your_monday_api_token
MONDAY_BOARD_ID=your_board_id
MONDAY_GROUP_ID=optional_group_id
MONDAY_STATUS_COLUMN_ID=optional_status_column_id
GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL=service-account@project-id.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GMAIL_DELEGATED_USER=jerry@bethanynaz.org
REPORT_EMAIL_FROM_NAME=BFC Sunday Ops
REPORT_EMAIL_FROM_ADDRESS=jerry@bethanynaz.org
REPORT_EMAIL_REPLY_TO=production@bethanynaz.org
```

## ProPresenter Relay

Run the relay on a machine that can reach the ProPresenter hosts:

```bash
node scripts/propresenter-relay.js
```

Useful flags:

```bash
node scripts/propresenter-relay.js --now
node scripts/propresenter-relay.js --probe --now
node scripts/propresenter-relay.js --dump-timers
```

`--dump-timers` prints the full raw JSON for every timer on every connected ProPresenter host. Use it to find clock indexes and inspect available fields when setting up runtime field configs.

Automatic start on the relay Mac:

```bash
./scripts/install-relay-launch-agent.sh --hour 5 --minute 0
```

This installs a per-user `launchd` agent that runs the relay at login and daily at the chosen time.

Operational runbook:

- `docs/relay-mac-setup.md`

Runtime field notes:
- `clock_number` is zero-based. `0` is the first ProPresenter timer.
- Leave the host blank for a manual-entry-only runtime field.
- Runtime values are stored in `runtime_values`.
- The relay targets the operational Sunday date and creates that `sundays` row if needed.
- The relay tries HTTP timer endpoints first and falls back to ProPresenter's TCP/IP API if HTTP fails.
- Set `countdown_target` (e.g. `25:00`) on any field whose ProPresenter clock is a countdown-with-overrun timer. The relay uses ProPresenter's `state` field (`overran` / `complete` / `stopped`) to compute the true elapsed time. Leave blank for stopwatch/elapsed-time clocks.

## Weather Import

Weather settings are managed in the app under `Service Data -> Weather` while in admin mode.

Automatic import is handled by:

```bash
node scripts/fetch-weather.js
```

Useful flag:

```bash
node scripts/fetch-weather.js --now
```

Notes:
- The importer reads the ZIP code, pull day, and pull time from `weather_config`.
- It uses [Open-Meteo](https://open-meteo.com/en/docs) for geocoding and weather data.
- It writes the imported weather into the `weather` table for the current or upcoming Sunday.
- Weather import and ProPresenter runtime import were both verified live on March 19, 2026.

## Supabase Storage

The `issue-photos` bucket stores photos attached to issue log entries.

### Setup

1. Create a bucket named `issue-photos` in the Supabase dashboard → Storage.
2. Set the bucket to **Public** (enables public URL access for thumbnails).
3. Run the following in the SQL Editor to allow anonymous uploads and reads:

```sql
create policy "allow public uploads" on storage.objects
  for insert to public with check (bucket_id = 'issue-photos');
create policy "allow public reads" on storage.objects
  for select to public using (bucket_id = 'issue-photos');
create policy "allow public deletes" on storage.objects
  for delete to public using (bucket_id = 'issue-photos');

grant select, insert, update, delete on table issue_photos to anon;
grant select, insert, update, delete on table issue_photos to authenticated;
```

## GitHub Workflows

- `deploy.yml`: builds and deploys to GitHub Pages on push to `main`
- `summary-email.yml`: checks every 15 minutes on Sunday and sends the summary email once the configured local send time has passed
- `sunday-analytics.yml`: manual-only placeholder workflow until real analytics importers are added
- `weather-import.yml`: runs every 5 minutes **on Sundays only** and imports weather once the configured day/time has passed

## Monday.com Push

The issue log can push Medium, High, and Critical issues to Monday.com through:

- `supabase/functions/push-monday-issue`

Setup notes:
- Set `VITE_ENABLE_MONDAY_PUSH=true` before building the frontend.
- Add the Monday and Supabase service secrets shown above to your Supabase project for the edge function.
- Deploy the edge function after adding secrets.
- Add `VITE_ENABLE_MONDAY_PUSH` as a GitHub Actions secret so the Pages build can enable the UI.
- If `MONDAY_STATUS_COLUMN_ID` is provided, the function will try to set that status column to the issue severity label.

The function creates:
- a Monday item named from the issue title
- a Monday update containing the full issue description, internal issue ID, and any attached photo URLs as numbered links

Example function deploy command:

```bash
supabase functions deploy push-monday-issue
```

## Sunday Summary Email

Summary email settings live in `Service Data -> Reporting` and include:

- enabled / paused state
- send day and time
- reply-to address
- recipient list

The sender currently assumes Google Workspace Gmail API delivery using:

- delegated mailbox: `jerry@bethanynaz.org`
- display name: `BFC Sunday Ops`
- reply-to: `production@bethanynaz.org`

Supporting pieces:

- `scripts/send-sunday-summary.js`
- `supabase/functions/admin-session`
- `supabase/functions/summary-email-admin`
- `.github/workflows/summary-email.yml`

Deploy the new edge functions after adding secrets:

```bash
supabase functions deploy admin-session
supabase functions deploy summary-email-admin
```

## Notes

- Admin mode is a shared-password convenience layer in the frontend.
- Summary email recipients are stored in private tables and managed through edge functions rather than direct public table access.
- The repo now matches the current checklist/runtime data model better than the original generated README did.
- Scheduled analytics should stay disabled until their backing code exists.
- A session-level change summary is tracked in `CHANGELOG.md`.

## Credentials and Security

**Never commit real credentials, passwords, or API keys to this repo.**

- `.env.local` is gitignored and must stay that way. All real secrets live there or in Supabase project secrets — never in committed files.
- `VITE_ADMIN_PASSWORD` and `ADMIN_PASSWORD` must always be set via environment variables. There is no hardcoded fallback.
- The Supabase anon key (`VITE_SUPABASE_ANON_KEY`) is intentionally public — it is embedded in the built frontend and is safe to expose because all sensitive tables are protected by RLS. Do not confuse it with the service role key (`SUPABASE_SERVICE_KEY`), which must never be committed or exposed to the frontend.
- All other secrets (Monday API token, Google service account key, Gmail delegated credentials) must be added to Supabase project secrets for edge functions and to GitHub Actions secrets for workflows — never hardcoded.
- When in doubt, treat a value as a secret. If it's genuinely non-sensitive (a feature flag, a public URL, a display name), it's fine in committed config.

## Status: Maintenance Mode (as of 2026-04-11)

Sunday Ops has been successful and is actively used at BFC, but development focus is shifting to **Callsheet** — a purpose-built production management platform that covers both the pre-event planning layer and the day-of execution layer this app handles.

The features proven here (checklist, issue log, runtime capture, attendance, loudness, evaluations, analytics) are being integrated into Callsheet's EventSpace as dedicated tabs, with real user auth replacing typed initials, Socket.io replacing Supabase Realtime, and Callsheet's design system replacing the current UI.

A full five-sprint rebuild cycle was completed on 2026-04-11 (Session 5), bringing the app to full alignment with the unified events model. **This app will remain running at BFC until Callsheet can replace it day-to-day.** Minor bug fixes are fine. No new features.

Callsheet repo: `/Users/alanbrown/Documents/EdgeCase Engineering/callsheet`

## Future Session Notes (pre-maintenance)

- ~~Backfill attendance and loudness into `service_records` from legacy data.~~ (completed)
- ~~PCO calendar sync edge function.~~ (completed — Session 5)
- ~~Unified events model and session navigation.~~ (completed — Session 5)
- ~~Unified checklist component (Sunday + Event in one screen).~~ (completed — Session 5)
- ~~Analytics screens using new slug format.~~ (completed — Session 5)
- YouTube analytics importer (`scripts/fetch-youtube.js` is a stub) — deferred, will not be built here.
- AI "Ask a Question" Analytics tab — deferred, will not be built here.
- Attendance and Runtimes screens writing to `service_records` — deferred, will not be built here.
