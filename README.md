# BFC Sunday Ops

Internal Sunday-morning ops app for the BFC production team.

This project is intentionally a shared team tool, not a per-user or multi-account system. The main distinction is between normal operators using the app during a service and admins managing checklist items and ProPresenter runtime definitions.

Live app: [https://bfcproduction.github.io/BFC-Sunday-Ops/](https://bfcproduction.github.io/BFC-Sunday-Ops/)

## Current Scope

- Home landing screen with global tool cards, focus event, event timeline, and public "What's New" update feed
- Event checklist with initials, timestamps, and expandable item notes
- Issue log with severity tracking, photo attachments, resolution, and Monday.com follow-up sync
- Attendance, runtime, loudness, weather, and evaluation tabs
- Anonymous multi-submission post-service evaluation with outcome-based questions and admin-only aggregate response review
- Admin Settings page: event-based report export, configurable church timezone, checklist template manager, and People & Access admin management
- Admin mode for checklist items, runtime definitions, issue cleanup, and weather settings
- Event/service report export with logo, KPIs, issues, and evaluation responses
- Event-native service data and analytics path: attendance, runtimes, loudness, weather, stream analytics, and imports sync through event-linked `service_records`
- ProPresenter relay script for runtime capture
- **Analytics screen** with Dashboard (6 KPI cards, trend charts, date-range filter) and Data Explorer tabs — powered by the `analytics_records` view
- **Unified events** — Sunday services and standalone events share one chronological event model, with reusable templates, template seeding at event creation, per-event checklist snapshots, and unified navigation
- **Manual event creation** — all events are created in Sunday Ops via the "New Event" modal; multiple events of the same type can exist on the same date (Easter, extra traditional services, etc.)
- **Event-native standalone event creation** — new standalone events no longer create `special_events` bridge rows; template seeding writes checklist rows directly against `events.id`
- **Admin-only event deletion** — admins can delete events from the desktop session picker via a hover-reveal trash icon with a two-step confirmation; deletes are routed through the protected `event-admin` Supabase Edge Function and public `events` table deletes are blocked by migration `037`
- **People & Access** — Settings section lets admins view all users who have logged into Sunday Ops (with last login dates) and toggle admin status, backed by the `user-admin` Edge Function
- **PCO plan linking** — events can optionally link to a Planning Center plan via an in-app picker; multiple Sunday Ops events can link to the same PCO plan
- **PCO schedule integration** — the dashboard "Today's Schedule" pulls event-specific plan times from the linked Planning Center plan when available
- **PCO Run of Show** — the dashboard pulls the ordered plan items from the linked PCO plan and displays them as a scrollable Run of Show card with computed start times, type icons, song keys, durations, and item descriptions
- **PCO sync** — updates existing manually-created events with PCO plan metadata (name, date); no longer auto-creates Sunday Ops events
- **Mobile floating pill nav** — bottom navigation on mobile is a dark floating pill (80% width, centered) with white active state and a blue dot indicator
- **Production Docs** — per-event stage plots, input lists, run sheets, and other files; Google Drive auto-sync via a service account + filename convention; manual upload (PDF) or Drive/Sheets link via admin UI; horizontal tab bar, full-width inline viewer on desktop, Google Docs Viewer on mobile for pinch-to-zoom
- GitHub Pages deployment

## What Is Live vs Pending

Live now:
- Checklist blueprint data is seeded into Supabase on first run; live checklist work happens through per-event `event_checklist_items` snapshots.
- Dashboard checklist counts now come from the live event checklist snapshot for the selected event.
- Operators can set persistent checklist initials once and reuse them for multiple checkoffs.
- Checklist items with notes show a chevron indicator; tapping the task label slides the note open inline.
- Checklist section and subsection fields use dropdowns with an "Add new…" option in the item edit modal; free-text fallback is gone.
- Checklist items can be dragged to reorder within each section in admin mode; order is persisted to `sort_order`.
- Event checklist completions and event checklist items subscribe to Supabase Realtime so the list updates across devices without a page refresh.
- Issues capture a short title, description, severity, and optional photo attachments.
- Issue photos upload to Supabase Storage, display as thumbnail strips on each issue card, and open in a full-screen lightbox.
- Issues can be marked resolved; resolved issues move to a dimmed section and are excluded from the sidebar badge and dashboard alert.
- High-priority issue follow-up uses neutral operator-facing copy (`Flag for follow-up before next Sunday`), syncing to Monday.com when that integration is enabled.
- When photos are attached to a flagged issue, the photo URLs are included in the Monday item update.
- Runtime fields support ProPresenter's native zero-based timer index. `0` is the first clock.
- Runtime fields can also be manual-only by leaving the ProPresenter host blank.
- Runtime captured-at timestamps display in the configured church timezone, not the device timezone.
- Runtime field admin controls are inline on the actual runtime list: admins drag the real row to reorder, use the row pencil to edit, and use **Add Runtime** to create a new row in place.
- Home is the default landing experience. It now works as the app-level hub: Global Tools, a full-width focus/next event card, event timeline, recent events, and app update notes.
- Desktop navigation separates the global Home layer from the selected event context, event-scoped workspace screens, and admin/global areas.
- Mobile navigation includes Home as the event-selection entry point, so event switching no longer depends on a modal as the primary path.
- Weather location and pull schedule are configured per event in the admin UI.
- Weather is imported automatically through event-level weather config via the weather workflow.
- Weather tab reads from Supabase if weather data exists and otherwise shows an honest empty state.
- Monday.com push can be enabled with the edge function and related secrets.
- Admins can delete issue log entries directly in the app (photos are cleaned up from Storage).
- Admins can delete events from the desktop session picker; deletion is verified server-side by the `event-admin` Edge Function and direct public deletes on `events` are blocked.
- Admin Settings page (gear icon in sidebar) provides event-based report export and church timezone selection.
- Church timezone is configurable in Settings and stored in `app_config`; falls back to `America/Chicago`.
- Report export can generate a PDF-style print report for any unified event/service.
- Dynamic service phase indicator in the sidebar and header (Pre-Service, Service 1, Between Services, Service 2, Post-Service) updates every 60 seconds.
- Summary email has been retired from the product surface. Use Settings → Reporting to export reports manually.
- Post-service evaluation redesigned: anonymous multi-submission, outcome-based questions, conditional broken-moment detail, and admin-only response review in the app UI. Operators can submit evaluations, but non-admins do not see or fetch the aggregate response panel from the Evaluation screen.
- BFC Production branding applied: logo in header, icon as favicon, iOS home screen icon. App name is "Sunday Ops" throughout.
- Header logo is always visible including on mobile viewports.
- Site header is sticky so it remains visible while scrolling.
- Desktop checklist uses a CSS two-column layout (`xl:columns-2`) that keeps sections from breaking across columns.
- Checklist subsection deduplication enforced — new items land in the existing subsection rather than creating a duplicate.
- Empty subsections are auto-deleted when the last item referencing them is removed.
- Loudness Log saves event-scoped readings and syncs them to the matching event-linked analytics row.
- Event/service report export intentionally excludes issue photo thumbnails.
- Historical loudness data imported from the BFC Audio Loudness Log Google Sheet — 144 Sundays (March 2023 – March 2026) via `scripts/import-loudness-history.js`.
- Loudness Log includes a "Full History PDF" button that generates a styled multi-year report matching the Sunday report aesthetic, grouped by year with per-year averages and goal exceedance flags.
- Event Data tabs show recent historical context for the active event type: Attendance, Runtimes, Loudness, and Weather include roughly the past 10 comparable events.
- Sidebar date block has `‹` / `›` chevron arrows to step backward and forward through past Sundays. All screens reload with the selected Sunday's data. Past Sundays show an amber "Historical View" badge and a "Back to Today" link.
- On weekdays the app automatically focuses on the most relevant event using midpoint logic: if the current time is past the halfway point between the last event's end (6 PM approximation) and the next event's start time, focus shifts to the next event. This works for Sunday services, standalone events, and mid-week services with no configuration required.
- Service phase indicator time boundaries corrected: Pre-Service 7–9am, Service 1 9–10am, Between Services 10–11am, Service 2 11am–noon, Post-Service noon–6pm.
- Post-service evaluations now surface Supabase errors on submit instead of silently showing a false success screen.
- Settings page sections: **App Settings** (Timezone), **Reporting** (event report export), **Checklist Templates**, and **People & Access** (admin user management).
- Planning Center auth failures surface as reauth-required states in the plan picker and Dashboard instead of looking like empty schedule data.
- ProPresenter relay supports a `countdown_target` on any runtime field. When set, the relay reads ProPresenter's timer `state` (`overran` / `complete` / `stopped`) and computes the true elapsed time rather than storing the raw overrun value. Useful for message timers configured as countdown-with-overrun. Set once in the runtime field admin UI.
- New `--dump-timers` flag on the relay prints the full raw JSON for every timer on every connected ProPresenter host (useful for debugging and field setup).

- RESI analytics importer (`scripts/fetch-resi.js`) — logs in via Playwright, downloads the session CSV for the target Sunday, saves the CSV/debug screenshot as workflow artifacts, records an `import_runs` status row, computes per-service stats, and writes to `service_records` / `analytics_records` through Supabase. Supports `--now`, `--date`, and `--dry-run` flags. Manual CSV fallback: `node scripts/import-resi-csv.js --date YYYY-MM-DD --file path/to.csv`.
- Operational scripts are inventoried by trust status in `docs/operational-script-inventory.md`.

- **YouTube live relay** (`scripts/fetch-youtube.js`) — runs during the Sunday service window (7:30 AM–1:30 PM CT). Polls BFC's YouTube channel for active live streams created by RESI via `search.list?eventType=live`, tracks `concurrentViewers` every 60 seconds, resolves the matching Sunday Ops event, and writes `youtube_unique_viewers` to the event-linked `service_records` row when each stream ends. If no matching event exists, it logs the mismatch and does not write a date-only row. For historical data use `scripts/import-youtube-history.js` in preview mode first.

- **Historical issue/evaluation review** (`scripts/review-session-assignments.js`) — exports ambiguous Sunday-level issues and evaluations with candidate events, high-confidence suggestions, and blank `assigned_event_id` cells for manual review. Apply mode updates `event_id` only from a reviewed CSV; delete mode removes reviewed rows left unassigned. Session 15 cleanup confirmed 0 Sunday-level issue/evaluation rows remain.

- **Event-native cleanup pass** (`src/lib/supabase.ts`, `src/screens/Checklist.tsx`, `src/screens/Home.tsx`, `src/components/layout/SessionPicker.tsx`) — standalone event creation now seeds checklist items directly with unified `events.id`, regular Sunday services now use event-scoped checklist snapshots, the active app shell no longer exposes a separate legacy `eventId`/`sessionType` context, and dead legacy UI files (`EventChecklist`, `SpecialEventManager`, retired Service Data reporting tab) have been removed.

- **Dashboard layout** — compact progress strip (dial + overall bar + role bars) spans the full width at the top; Today's Schedule (25%) and Run of Show (75%) sit side by side below it; Quick Actions below that. Stacks vertically on mobile.

- **PCO Run of Show** (`supabase/functions/pco-plan-items/`):
  - Fetches ordered plan items from the linked PCO plan.
  - Fetches `plan_times` in parallel and computes a cumulative `computed_starts_at` for each item (pre-service items walk backwards from service start; service/post items walk forward).
  - Returns `title`, `item_type`, `length`, `description`, `service_position`, `key_name`, `computed_starts_at`.
  - Dashboard ROS card shows time, type icon, title, description, song key, and duration per item.

- **Home navigation** (`src/screens/Home.tsx`, `src/components/layout/Sidebar.tsx`, `src/components/layout/MobileTabs.tsx`) makes the app feel like a true global starting point instead of half-inside an event. Home surfaces Global Tools (Event Timeline, Analytics for admins, Production Support, App Updates, Settings for admins, and Create Event for admins), a full-width focus/next event card, current/upcoming/recent event lists, readiness/checklist/issue/evaluation signals, and a public-facing "What's New" update feed. Event workspace screens remain drill-downs from the selected event.

- **Mobile bottom nav** (`src/components/layout/MobileTabs.tsx`) redesigned as a floating dark pill with Home as the primary event-selection entry point.

- **Evaluation response visibility** (`src/screens/Evaluation.tsx`) — all logged-in users can submit event-native evaluations, but only admins see the response summary and submitted notes in the app UI. Event report export includes evaluation responses for admin review.

- **Unified event support** (`src/components/layout/QuickCreateModal.tsx`, `src/components/admin/TemplateManager.tsx`, `src/screens/Checklist.tsx`):
  - Admin-managed event templates (reusable checklist blueprints) and standalone events with name, date, time, and template assignment.
  - Template seeding: when a template is selected in the QuickCreate modal for a standalone event, checklist items are snapshotted into `event_checklist_items.event_id = events.id` at creation time — later template changes don't affect existing events.
  - Events appear chronologically in Home, the sidebar, and the event picker; prev/next navigation steps through the unified event list.
  - Per-event checklists: items can be added, edited, reordered, and deleted per-event in admin mode.
  - **Unified checklist component** (`src/screens/Checklist.tsx`) reads and writes event-scoped checklist snapshots for Sunday services and standalone events.
  - All operational screens (issues, attendance, runtimes, loudness, weather, evaluations) work for events using the same `event_id` column pattern. `event_id` FKs on all operational tables now correctly reference `events(id)`.
  - Template manager in Settings → Checklist Templates (admin only).

- **Analytics screen** (`src/screens/Analytics/`) — three-tab layout:
  - **Dashboard**: 6 KPI cards (Avg Attendance, Avg Service Runtime, Avg Message Runtime, Avg Loudness, Avg Stream Views, Total Sundays), each with 9am/11am breakdown and period-over-period delta arrows. Date-range filter. All time values rounded to whole seconds.
  - **Data Explorer**: filterable table view with column-level sorting.
  - **Ask a Question**: placeholder for a future AI natural-language query interface.
  - Both tabs query the `analytics_records` view, which remaps legacy `service_type` enum values to service slugs and exposes event id, event name, event time, and labels for event-native analytics.

- **Manual event creation** (`src/components/layout/QuickCreateModal.tsx`):
  - All events are created in Sunday Ops via the "New Event" modal: event type, name, date, time, optional PCO plan link, optional checklist template, notes.
  - Multiple events of the same type on the same date are fully supported (dropped uniqueness constraint in migration 033).
  - PCO plan picker (`supabase/functions/pco-plans/`) shows recent and upcoming plans grouped by service type with search, sorted ascending by event date; multiple Sunday Ops events can link to the same PCO plan.

- **Admin-only event deletion** (`src/components/layout/SessionPicker.tsx`, `src/components/layout/Sidebar.tsx`, `supabase/functions/event-admin/`, `supabase/migrations/037_admin_only_event_deletes.sql`):
  - Admins see a guarded delete action on each event row in the desktop session picker.
  - The frontend calls the protected `event-admin` Edge Function with the current PCO session token.
  - The Edge Function verifies the session is still valid and belongs to an admin user before deleting the event.
  - Deletion cleans up event-scoped issue photo storage objects, production document storage objects, event checklist data, operational rows, and the legacy `special_events` bridge row when present.
  - Migration `037` removes public delete grants/policies on `events`, so direct anon/authenticated table deletes are blocked even if a non-admin tries to bypass the UI.

- **Dashboard PCO schedule** (`src/screens/Dashboard.tsx`, `supabase/functions/pco-plan-times/`):
  - The dashboard "Today's Schedule" fetches the active event's linked PCO plan times and displays them in the configured church timezone.
  - If an event is not linked to PCO or the PCO call fails, the dashboard falls back to the original static schedule.

- **PCO sync** (`supabase/functions/pco-sync/`, `supabase/migrations/023_pco_sync.sql`):
  - Updates existing events with PCO plan metadata (stamps `pco_plan_id`, refreshes name/date).
  - No longer auto-creates Sunday Ops events — creation is manual only through the "New Event" modal.
  - Special events update only when an existing Sunday Ops event is already linked to the same PCO plan.
  - Called automatically after login and manually via Settings → Sync Now (admin only).
  - `pco-sync`, `pco-plans`, `pco-plan-times`, and `pco-plan-items` refresh expired Planning Center access tokens using the stored refresh token.

- **`service_records` table** (`supabase/migrations/012_create_service_records.sql`, event-native updates in `039`) — unified analytics table with one row per service event when `event_id` is available, storing attendance, runtimes, loudness, weather, and stream analytics in one place.

- **Historical checklist PDF extraction** (`scripts/extract-checklist-runtimes.js`) — one-shot script that scans 242 PDFs from the local Google Drive archive (Jun 2021–Mar 2026), extracts service runtime, message runtime, and stage flip time from each, and upserts into `service_records`. 465 rows backfilled.

Still pending:
- **YouTube live relay first live test** — `scripts/fetch-youtube.js` is event-native but not yet verified against a live Sunday stream
- Historical script burn-down follow-up — see `docs/operational-script-inventory.md` for guarded scripts and remaining archive cleanup.
- AI "Ask a Question" Analytics tab (Claude API via Supabase Edge Function)
- Any downstream reporting beyond manual report export
- Continue data compatibility cleanup: several operational screens still keep legacy Sunday fallback reads for old attendance/runtime/loudness/evaluation rows.
- Harden evaluation response privacy at the Supabase/RLS or Edge Function layer if response visibility needs to be enforced beyond the current admin-only UI path.

Completed (previously listed as pending):
- Attendance, runtimes, and loudness all sync to `service_records` via the shared `syncToServiceRecords` utility.
- Attendance and loudness data backfilled into `service_records` from legacy tables.
- Sunday focus direction corrected (app now defaults to most recent past Sunday on weekdays).
- Evaluation submissions now fail loudly instead of silently.
- PCO OAuth token auto-refresh is implemented in the PCO-facing edge functions.

## Tech Stack

- React + TypeScript + Vite
- Tailwind CSS
- Supabase
- GitHub Pages
- GitHub Actions
- Node.js relay scripts

## Supabase Tables

- `sundays` — legacy Sunday records retained for historical bridges and older rows
- `service_types` — service type definitions (`sunday-9am`, `sunday-11am`, `special`)
- `events` — unified event instances (replaces the split between `sundays` and `special_events` in the navigation layer)
- `user_sessions` — PCO OAuth session tokens
- `checklist_items` — Sunday checklist blueprint rows used to seed event snapshots
- `checklist_completions` — legacy Sunday completion rows retained for historical migration/audit compatibility
- `attendance`
- `runtime_fields`
- `runtime_values`
- `issues`
- `issue_photos`
- `loudness`
- `weather`
- `evaluations`
- `stream_analytics`
- `import_runs`
- `report_email_settings` / `report_email_recipients` / `report_email_runs` — retired summary-email tables retained for historical/audit compatibility
- `app_config`
- `service_records` — unified analytics table, now event-linked by `event_id` when available; queried via the `analytics_records` view
- `event_templates` — reusable checklist blueprints for standalone/event-scoped checklists
- `event_template_items` — checklist items belonging to a template
- `special_events` — legacy bridge table retained for older standalone/non-Sunday events; new standalone event creation writes directly to `events`
- `event_checklist_items` — per-event checklist items (snapshotted from Sunday blueprints or standalone event templates)
- `event_checklist_completions` — completions for event checklist items

Views:
- `analytics_records` — view over `service_records` that remaps legacy service-type values, exposes event identity/time/labels, and powers Analytics screens

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
- `supabase/migrations/030_fix_checklist_event_id_fk_to_events.sql`
- `supabase/migrations/031_email_tables_service_role_grant.sql`
- `supabase/migrations/032_runtime_fields_analytics_key.sql`
- `supabase/migrations/033_drop_sunday_uniqueness.sql`
- `supabase/migrations/034_production_docs.sql`
- `supabase/migrations/035_add_ptz_op_checklist_role.sql`
- `supabase/migrations/036_rename_ptz_op_role_to_ptz.sql`
- `supabase/migrations/037_admin_only_event_deletes.sql`
- `supabase/migrations/038_event_scoped_summary_email_runs.sql`
- `supabase/migrations/039_event_native_service_records.sql`
- `supabase/migrations/040_import_runs.sql`
- `supabase/migrations/041_event_native_weather_config.sql`
- `supabase/migrations/042_event_checklist_snapshots_for_sundays.sql`

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
VITE_PCO_CLIENT_ID=your_pco_oauth_app_client_id
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
PCO_CLIENT_ID=your_pco_oauth_app_client_id
PCO_CLIENT_SECRET=your_pco_oauth_app_client_secret
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

Weather settings are managed in the app under `Event Data -> Weather` while in admin mode.

Automatic import is handled by:

```bash
node scripts/fetch-weather.js
```

Useful flag:

```bash
node scripts/fetch-weather.js --now
```

Notes:
- Weather settings are event-level. Each event owns its own `weather_config` row through `weather_config.event_id`.
- Legacy `weather_config` rows such as `default`, `sunday-9am`, and `sunday-11am` are templates for seeding new events, not the runtime source of truth.
- The importer uses [Open-Meteo](https://open-meteo.com/en/docs) for geocoding and weather data.
- It writes imported weather into an event-scoped `weather` row and syncs temperature/condition into the matching event-linked `service_records` row.
- Weather import and ProPresenter runtime import were both verified live on March 19, 2026.

### Historical weather backfill

The Data Explorer and Event Data history tabs read weather from `service_records`, not the `weather` table. If `weather_temp_f` is null for older records, use the backfill script:

```bash
node scripts/backfill-service-records-weather.js
```

This fetches historical weather from the Open-Meteo archive API for every past event-linked `service_records` row that is missing weather and has event-level weather config. Safe to re-run — only updates null rows.

To copy event weather from the `weather` table into matching event-linked `service_records` rows:

```bash
node scripts/sync-weather-to-service-records.js
```

## YouTube Live Relay

Run on Sunday morning before the first service. The script polls until all expected streams have ended or the service window closes (1:30 PM CT).

```bash
node --env-file=.env.local scripts/fetch-youtube.js
```

Useful flags:

```bash
node --env-file=.env.local scripts/fetch-youtube.js --dry-run          # poll and log, no DB writes
node --env-file=.env.local scripts/fetch-youtube.js --date 2026-04-27  # target a specific Sunday
```

Notes:
- Must be run during the service window (7:30 AM–1:30 PM CT); will exit with a message if run outside that window (allows starting up to 30 minutes early).
- RESI-created live streams are visible via `search.list?eventType=live` while active but are not accessible after they end. For historical data use `scripts/import-youtube-history.js`.
- Streams are matched to events by actual start time: 8:45–10:15 CT → Sunday 9am event, 10:15–12:30 CT → Sunday 11am event, 7:45–8:45 CT → special 8am event when one exists.
- Peak `concurrentViewers` is written to `service_records.youtube_unique_viewers` by `event_id` when each stream ends.
- If no matching event exists, the relay logs the missing event and skips the write.
- Ctrl-C flushes any in-progress streams before exiting.

Required env:
```
YOUTUBE_CLIENT_ID
YOUTUBE_CLIENT_SECRET
YOUTUBE_REFRESH_TOKEN
SUPABASE_URL
SUPABASE_SERVICE_KEY
```

To set up OAuth credentials for the first time, run `scripts/youtube-auth.js` once and follow the prompts.

### Historical YouTube import

For past Sundays, use the spreadsheet importer:

```bash
node --env-file=.env.local scripts/import-youtube-history.js --file ~/Downloads/"Stream Analytics Master - 9am Service.csv" --service 9am
node --env-file=.env.local scripts/import-youtube-history.js --file ~/Downloads/"Stream Analytics Master - 11am Service.csv" --service 11am
node --env-file=.env.local scripts/import-youtube-history.js --file ~/Downloads/"Stream Analytics Master - 9am Service.csv" --service 9am --write --confirm-historical-import
```

Reads `Col 0` (date, M/D/YYYY) and `Col 19` (YouTube unique viewers) from the BFC stream analytics spreadsheet exports. Default mode is a preview that shows the resolved `event_id`; writes require `--write --confirm-historical-import` and skip dates without a matching event.

### Historical issue/evaluation review

Older issue and evaluation rows can be Sunday-level instead of event-level. Session 15 cleanup removed the known ambiguous rows and a final export confirmed 0 remain. If new ambiguous rows appear later, export a review artifact before assigning or deleting them:

```bash
node --env-file=.env.local scripts/review-session-assignments.js
node --env-file=.env.local scripts/review-session-assignments.js --reviewed artifacts/reviews/session-assignment-review.csv --dry-run
node --env-file=.env.local scripts/review-session-assignments.js --reviewed artifacts/reviews/session-assignment-review.csv --apply
node --env-file=.env.local scripts/review-session-assignments.js --reviewed artifacts/reviews/session-assignment-review.csv --delete-unassigned --dry-run
```

The export includes row date, title/detail, severity or service feel, created/submitted time, candidate events for that date, and high-confidence suggestions when available. Apply mode only writes `event_id` values that were filled into `assigned_event_id`. Delete mode removes reviewed rows that still have a blank `assigned_event_id`.

## Supabase Storage

### `issue-photos` bucket

Stores photos attached to issue log entries.

#### Setup

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

### `production-docs` bucket

Stores PDFs and other files attached to production doc records.

#### Setup

1. Create a bucket named `production-docs` in the Supabase dashboard → Storage.
2. Set the bucket to **Public** (enables public URL access for inline viewing).
3. Run the following in the SQL Editor:

```sql
create policy "allow public uploads" on storage.objects
  for insert to public with check (bucket_id = 'production-docs');
create policy "allow public reads" on storage.objects
  for select to public using (bucket_id = 'production-docs');
create policy "allow public deletes" on storage.objects
  for delete to public using (bucket_id = 'production-docs');
```

4. Run migration `034_production_docs.sql` to create the `production_docs` table.

#### Drive sync setup

The `docs-sync.yml` workflow uses a Google service account to read the `01 Sunday Mornings` subfolder inside the BFC production docs parent folder. Required secrets:

- `GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`

The service account must have at least **Viewer** access to the `00 Production Documents for this week` parent folder. The folder ID is hard-coded in `scripts/sync-production-docs.js` and can be overridden via the `DRIVE_PRODUCTION_DOCS_FOLDER_ID` environment variable.

Files must follow the BFC filename convention to be picked up by the sync:

```
YYYY.MM.DD.S - Description[.ext]   → service-specific  (S=1 → 9am, S=2 → 11am)
YYYY.MM.DD - Description[.ext]     → all services on that date
```

Doc type is inferred from the description: "Stage Plot", "Input List" / "IO", "Run Sheet", or "Other".

## GitHub Workflows

- `deploy.yml`: builds and deploys to GitHub Pages on push to `main`
- `summary-email.yml`: retired placeholder; does not send email
- `sunday-analytics.yml`: runs the RESI Playwright importer and uploads downloaded CSV / debug screenshot artifacts when present
- `weather-import.yml`: runs every 5 minutes **on Sundays only** and imports weather once the configured day/time has passed
- `docs-sync.yml`: runs every hour and syncs production docs from the Google Drive `01 Sunday Mornings` folder into Supabase Storage; exits cleanly if there is nothing new

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

## Report Export

Manual report export lives in `Settings -> Reporting` as a single **Export a Report** control.

- The dropdown selects from unified `events`, so reports can target any Sunday service, combined service, extra service, or special event.
- Reports are generated for one selected event/service at a time.
- Event-native data is used first for checklist completions, attendance, runtimes, weather, issues, and evaluations.
- Older service-data records still work through scoped legacy fallback where applicable. Sunday-level issue/evaluation history needs review assignment before it appears in an event report.
- The export opens a self-contained printable report in a new tab and triggers the browser print dialog.

## Admin Event Deletion

Admins can delete events from the desktop session picker. Deletion is intentionally protected in two places:

- The UI only renders the delete action for admins.
- The `event-admin` Supabase Edge Function verifies the `x-session-token` belongs to an active admin user before deleting anything.

Migration `037_admin_only_event_deletes.sql` removes public delete access from the `events` table. That means event deletion must go through the Edge Function; direct anon/authenticated table deletes are rejected by Supabase.

Deploy the function after adding or changing it:

```bash
supabase functions deploy event-admin
```

## People & Access

Admins can manage who has admin access to Sunday Ops from **Settings → People & Access** without touching Supabase directly. The section lists every user who has logged in, shows their last login date, and provides a toggle to grant or revoke admin access. Self-demotion is blocked server-side.

This is backed by the `user-admin` Supabase Edge Function:

```bash
supabase functions deploy user-admin
```

## Notes

- Admin mode is a shared-password convenience layer in the frontend.
- Retired summary-email tables remain private and are not exposed in the app surface.
- The repo now matches the current checklist/runtime data model better than the original generated README did.
- Scheduled analytics should stay disabled until their backing code exists.
- `supabase/.temp/` is local Supabase CLI state and is intentionally ignored.
- A session-level change summary is tracked in `CHANGELOG.md`.
- Home navigation and evaluation visibility follow-up commits have been pushed to `main` through `b8d66a2`.
- As of the April 17, 2026 cleanup, the unified `events` navigation table is intentionally kept to real Sunday Ops usage: March–April 2026 operational sessions plus future events created manually through **New Event**. Historical analytics before March 2026 remain in `service_records` / `analytics_records` and are separate from the removed navigation events.

## Credentials and Security

**Never commit real credentials, passwords, or API keys to this repo.**

- `.env.local` is gitignored and must stay that way. All real secrets live there or in Supabase project secrets — never in committed files.
- `VITE_ADMIN_PASSWORD` and `ADMIN_PASSWORD` must always be set via environment variables. There is no hardcoded fallback.
- The Supabase anon key (`VITE_SUPABASE_ANON_KEY`) is intentionally public — it is embedded in the built frontend and is safe to expose because all sensitive tables are protected by RLS. Do not confuse it with the service role key (`SUPABASE_SERVICE_KEY`), which must never be committed or exposed to the frontend.
- All other secrets (Monday API token, Google service account key, Gmail delegated credentials) must be added to Supabase project secrets for edge functions and to GitHub Actions secrets for workflows — never hardcoded.
- When in doubt, treat a value as a secret. If it's genuinely non-sensitive (a feature flag, a public URL, a display name), it's fine in committed config.
