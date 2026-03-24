# BFC Sunday Ops

Internal Sunday-morning ops app for the BFC production team.

This project is intentionally a shared team tool, not a per-user or multi-account system. The main distinction is between normal operators using the app during a service and admins managing checklist items and ProPresenter runtime definitions.

Live app: [https://bfcproduction.github.io/BFC-Sunday-Ops/](https://bfcproduction.github.io/BFC-Sunday-Ops/)

## Current Scope

- Gameday checklist with initials, timestamps, and expandable item notes
- Issue log with severity tracking, photo attachments, resolution, and Monday.com follow-up sync
- Attendance, runtime, loudness, weather, and evaluation tabs
- Anonymous multi-submission post-service evaluation with outcome-based questions and aggregate response view
- Admin Settings page: PDF export, configurable church timezone, and summary email management
- Admin mode for checklist items, runtime definitions, issue cleanup, and weather settings
- PDF service report export with logo, KPIs, issues, and evaluation responses
- ProPresenter relay script for runtime capture
- GitHub Pages deployment

## What Is Live vs Pending

Live now:
- Checklist data is seeded into Supabase on first run and then managed from the admin UI.
- Dashboard checklist counts now come from the live `checklist_items` table.
- Operators can set persistent checklist initials once and reuse them for multiple checkoffs.
- Checklist items with notes show a chevron indicator; tapping the task label slides the note open inline.
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

Still pending:
- Real YouTube / RESI analytics importers
- Any downstream reporting beyond the Sunday summary email
- Checklist subsection dropdown (free-text currently allows duplicates)
- Checklist drag-to-reorder in admin mode
- Checklist real-time sync (Supabase Realtime enabled on tables; subscription code not yet written)
- Loudness Log split 9 AM / 11 AM submissions
- Sticky header and mobile header visibility

## Tech Stack

- React + TypeScript + Vite
- Tailwind CSS
- Supabase
- GitHub Pages
- GitHub Actions
- Node.js relay scripts

## Supabase Tables

- `sundays`
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

Fresh schema setup is represented by:
- `supabase/migrations/001_initial_schema.sql`
- `supabase/migrations/002_align_runtime_and_checklist_tables.sql`
- `supabase/migrations/003_allow_manual_runtime_fields.sql`
- `supabase/migrations/004_add_weather_config.sql`
- `supabase/migrations/005_add_issue_titles.sql`
- `supabase/migrations/006_add_summary_email_config.sql`
- `supabase/migrations/007_add_issue_resolution.sql`
- `supabase/migrations/008_add_app_config.sql`
- `supabase/migrations/009_add_issue_photos.sql`

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
```

Automatic start on the relay Mac:

```bash
./scripts/install-relay-launch-agent.sh --hour 5 --minute 0
```

This installs a per-user `launchd` agent that runs the relay at login and daily at the chosen time.

Operational runbook:

- `docs/relay-mac-setup.md`

Runtime field notes:
- `clock_number` is zero-based.
- `0` is the first ProPresenter timer.
- Leave the host blank for a manual-entry-only runtime field.
- Runtime values are stored in `runtime_values`.
- The relay now targets the operational Sunday date and creates that `sundays` row if needed.
- The relay tries HTTP timer endpoints first and falls back to ProPresenter's TCP/IP API if HTTP fails.

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

## Future Session Notes

- Fix checklist subsection bug — new items land in a duplicate subsection instead of the existing one.
- Convert section/subsection fields in the item edit modal to dropdowns with an "Add new…" option; auto-delete empty subsections.
- Add drag-to-reorder for checklist items within each section (admin only), persisted to `sort_order`.
- Write Supabase Realtime subscription hooks in `Checklist.tsx` for `checklist_completions` and `checklist_items` (Realtime is already enabled on both tables in Supabase).
- Split Loudness Log into independent 9 AM and 11 AM service submissions.
- Make the site header sticky so it stays visible while scrolling.
- Ensure the header logo is visible on mobile viewports.
- Set up the analytics importers and supporting workflow.
- Import historical loudness logs so the loudness section can support graphics and trend views.
- Fix the desktop checklist layout so the two columns place sections independently and do not leave large blank gaps.
- Verify the Google Workspace send-as / reply-to behavior you want for the summary email.
- Consider embedding issue photo thumbnails in the PDF export (currently excluded by design).
