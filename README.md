# BFC Sunday Ops

Internal Sunday-morning ops app for the BFC production team.

This project currently uses a shared-team access model whose main distinction is between operators and admins. The product roadmap expands that foundation toward Crew/Operator, Manager, Analytics Viewer, and Administrator access, including invited users who do not have Planning Center accounts.

Live app: [https://bfcproduction.github.io/BFC-Sunday-Ops/](https://bfcproduction.github.io/BFC-Sunday-Ops/)

## Product Roadmap

The durable product direction, confirmed decisions, technical foundations, and future-session handoff guide live in [`docs/product-roadmap.md`](docs/product-roadmap.md).

The current authorization and policy review, including per-finding deployment status and the staged containment order, lives in [`docs/security-inventory.md`](docs/security-inventory.md). SEC-01 is deployed and verified; the remaining findings are explicitly identified there as pending work.

The confirmed Event/Workbook module ownership model, access levels, PCO-folder defaults, and phased migration rules live in [`docs/module-architecture.md`](docs/module-architecture.md).

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
- **Production Docs** — per-event stage plots, input lists, run sheets, and other files; Google Drive auto-sync via a service account + filename convention; manual upload (PDF) or Drive/Sheets link via admin UI; document-type tabs open the active document directly, with a compact selector when a type contains multiple files; full-width native PDF viewing on desktop and Google Docs Viewer on mobile preserve zoom and drawing support where available
- **Workbooks** — a scheduling layer above events for multi-event / multi-day productions (conferences, assemblies). Reachable from the sidebar, mobile nav, and Home; writes are admin-gated. Includes:
  - **Workbook library + focused workspace** — Workbooks opens to a dedicated library for choosing or creating a production. Opening a workbook uses the full content width, with an **All Workbooks** control to return to the library instead of a permanent workbook-switching rail.
  - **Workbook Settings** in Settings (admin-only): a tabbed configuration area for Locations, Departments, Roles (+ hourly rate), schedule-item Types, Intercom, and room Input Lists. Ordered lists use drag-and-drop and workbook selectors respect the saved order.
  - **PCO-first event manager** — the Events tab is a focused list of attached workbook events plus one **Add Event** action. Workbook events are created from Planning Center plans and attached atomically; non-PCO production activities are entered as Schedule items. The plan picker hides plans before the workbook start date and sorts the remaining plans chronologically.
  - **Schedule** — a chronological Detail view plus **By Room** and **By Department** views on a shared time-axis grid (time down the left, one column per room/department, items positioned by real start/end, same-column overlaps flagged as conflicts). Day-N labels (Day 1 = the workbook's earliest event).
  - **PCO plan times** pulled into the schedule read-only and kept in sync (never stored); each can be assigned a room + departments via an overlay.
  - **Crew roster** — visible to every workbook user with assigned people from the **Production** team, local roles, call/release times, hours, and PCO ordering. Admins can sync from Planning Center and use one **Edit crew** control for inline role/time/pay-type editing, drag ordering, manual guests, and open/TBD rows. Paid/volunteer status, per-row pay, and workbook pay totals are omitted entirely for non-admins.
  - **Call sheets** — printable per-person schedule (per-day call/release, role, event), with crew avatars.
  - **Crew pay** (admin only) — per-event pay (each crew row's call→release × the role's hourly rate), calculated client-side in the admin-only Crew tab, shown per row, and totaled per person across the workbook, with a printable business-office pay report. The deployed `workbook-pay` Edge Function remains available for the future raw-rate security hardening.
  - **Intercom Grid** — event-scoped assignments pulled from the workbook crew roster and visible to every workbook user. Non-admins receive a read-only grid; admins can assign wired/wireless/no-intercom packs, set each channel's talk behavior to **Off / Momentary / Latch / Latch-Momentary**, independently set its receive behavior to **Off / Listen / Listen on Talk**, and add or remove event channel columns. **Program** is treated as a simple audio-feed checkbox with no talk or listen mode. Workbook Settings owns global pack capacities, the reusable master channel list, and per-role starting defaults. Over-capacity pack counts are flagged.
  - **Input List** — a room-aware workbook document built from reusable sections, configurable columns, and a drag-ordered connection inventory. Room-defined infrastructure is shown read-only while production-specific inputs, outputs, devices, people, destinations, and monitor assignments autosave in the workbook. Location-wide linked cells can mirror another input-list cell in every workbook, and a spreadsheet-style fill handle continues numbered values or sequential linked-cell references down a column. Connections sharing a floor box stay grouped across input types; the hidden type value drives print-safe row shading for audio input, audio output, monitor output, network, fiber, and BNC.
  - **Supplies** — a workbook-wide shopping list for consumables, décor, and miscellaneous purchases, visible read-only to non-admins and editable by admins. Each row stores item, description, quantity, unit price, optional department, and purchase link; the tab calculates line totals and a workbook estimate.
  - **Send Update** — snapshots the schedule, diffs it against the last sent version, and produces a copyable change summary for occasional crew.
  - **Workbook print packet** — one Print / PDF control with selectable pages for the detail schedule, room Input Lists, Supplies shopping list, event Intercom Grids, and per-person call sheets. Admins also receive the business-office pay report option; it is absent from non-admin print controls and rejected by the export path for non-admins. Packets print on Letter portrait pages; Input List sections use two balanced tables side by side to preserve readable type without wasting paper.
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
- When the Monday.com integration is enabled, every new issue—including Low severity—is saved in Sunday Ops first and then mirrored automatically. Operators do not choose whether to create the follow-up.
- Monday delivery states are visible as pending, syncing, synced, or failed. A signed-in user can retry pending or failed deliveries without creating a second Monday item.
- The protected Edge Function fetches the canonical issue and photo records server-side; attached photo URLs are included in the Monday item update.
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
- The login screen has a **"Log in as someone else"** button for shared devices. Normal login is the fast one-tap path (reuses the device's active Planning Center session); the switch-account button calls PCO with the `openid` scope and `prompt=select_account` to force the account chooser so a different user can sign in.
- Manual service-data entry (Runtimes, Attendance, Loudness) **saves on Enter/Return** — pressing Enter in a field saves immediately and blurs the field for a visible confirmation, so values aren't lost by navigating away without clicking Save.
- ProPresenter relay supports a `countdown_target` on any runtime field. When set, the relay reads ProPresenter's timer `state` (`overran` / `complete` / `stopped`) and computes the true elapsed time rather than storing the raw overrun value. Useful for message timers configured as countdown-with-overrun. Set once in the runtime field admin UI.
- New `--dump-timers` flag on the relay prints the full raw JSON for every timer on every connected ProPresenter host (useful for debugging and field setup).

- RESI analytics importer (`scripts/fetch-resi.js`) — logs in via Playwright, downloads the session CSV for the target Sunday, saves the CSV/debug screenshot as workflow artifacts, records an `import_runs` status row, computes per-service stats, and writes to `service_records` / `analytics_records` through Supabase. Supports `--now`, `--date`, and `--dry-run` flags. Manual CSV fallback: `node scripts/import-resi-csv.js --date YYYY-MM-DD --file path/to.csv`.
- Operational scripts are inventoried by trust status in `docs/operational-script-inventory.md`.

- **YouTube live relay** (`scripts/fetch-youtube.js`) — runs during the Sunday service window (7:30 AM–1:30 PM CT). Polls BFC's YouTube channel for active live streams created by RESI via `search.list?eventType=live`, tracks `concurrentViewers` every 60 seconds, resolves the matching Sunday Ops event, and writes `youtube_unique_viewers` to the event-linked `service_records` row when each stream ends. If no matching event exists, it logs the mismatch and does not write a date-only row. For historical data use `scripts/import-youtube-history.js` in preview mode first.

- **Historical issue/evaluation review** (`scripts/review-session-assignments.js`) — exports ambiguous Sunday-level issues and evaluations with candidate events, high-confidence suggestions, and blank `assigned_event_id` cells for manual review. Apply mode updates `event_id` only from a reviewed CSV; delete mode removes reviewed rows left unassigned. Session 15 cleanup confirmed 0 Sunday-level issue/evaluation rows remain.

- **Event-native cleanup pass** (`src/lib/supabase.ts`, `src/screens/Checklist.tsx`, `src/screens/Home.tsx`, `src/components/layout/SessionPicker.tsx`) — standalone event creation now seeds checklist items directly with unified `events.id`, regular Sunday services now use event-scoped checklist snapshots, the active app shell no longer exposes a separate legacy `eventId`/`sessionType` context, and dead legacy UI files (`EventChecklist`, `SpecialEventManager`, retired Service Data reporting tab) have been removed.

- **Dashboard layout** — compact progress strip (dial + overall bar + role bars) spans the full width at the top; Event Schedule (25%) and Run of Show (75%) sit side by side below it, followed by the high-priority issue alert when needed. Navigation remains in the desktop sidebar and mobile tab bar. The layout stacks vertically on mobile.

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
- Harden evaluation response privacy at the Supabase/RLS or Edge Function layer if response visibility needs to be enforced beyond the current admin-only UI path.
- Stream analytics section in Evaluation still reads from the legacy `stream_analytics` table via `sunday_id`.
- Workbook follow-ups: verify crew pay against a real paid production; add payroll review/finalize/lock; confirm the safe no-notify PCO assignment write path; and design the Workbook-wide mobile experience.
- Intercom-specific follow-up: attach assignments to individually tracked packs after the future equipment/assets layer exists. Current assignments intentionally stop at wired vs wireless.

Completed (previously listed as pending):
- Attendance, runtimes, and loudness all sync to `service_records` via the shared `syncToServiceRecords` utility.
- **Service data legacy cleanup** — all `sunday_id` fallback reads removed from Attendance, Runtimes, Weather, LoudnessLog, and Evaluation. Attendance and Loudness now write directly to `service_records` (no more dual-write + sync); the individual `attendance` and `loudness` tables are no longer actively written by the app. LoudnessLog history and Full History PDF export now read from `analytics_records` / `service_records` and correctly include all event-native data.
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
- **Workbook Settings / Production Config — account-level reference data managed in Settings (migration `045`):**
  - `locations` — rooms/venues, referenced by workbooks and events (replaces the per-workbook `workbook_locations`, which was dropped)
  - `departments` — production departments used to tag schedule items and crew
  - `roles` — crew roles with an `hourly_rate` and an optional `department_id` (migration `049`). Rate/pay are admin-only, computed for verified admins (see the `workbook-pay` Edge Function). Raw-rate anon lockdown is a pending follow-up.
  - `schedule_item_types` — managed, extensible list of schedule-item types (replaces the old fixed enum)
- `workbooks` — top-level container for multi-event / multi-day productions (name, date range, venue, status, sent version)
- `workbook_schedule_items` — typed schedule rows (type is a managed `schedule_item_types` key) with date, start/end time, notes, departments, tags; `location_id` references account `locations`; optionally linked to an `events` row
- `workbook_schedule_assignments` — per-schedule-item crew assignments (real user or open/named slot, role, department)
- `workbook_pco_time_meta` — room + department annotation for a read-only PCO plan time, keyed by (`event_id`, `pco_time_id`) (migration `046`)
- `workbook_crew` — crew roster: person (PCO user / manual guest / open TBD), role, day (+ optional event), call/release times, paid flag (migration `047`)
  - Migration `052` adds PCO assignment identity/source fields so linked-plan crew can sync without duplicating rows or overwriting Sunday Ops call/release/pay details.
- **Input List room configuration + workbook values (migration `053`):**
  - `input_list_sections`, `input_list_columns`, and `input_list_rows` — ordered, location-specific document structure and connection inventory
  - `input_list_room_values` — reusable fixed infrastructure values shown read-only inside workbooks
  - `workbook_input_list_values` — production-specific values keyed to a workbook, room connection row, and workbook-entry column
  - `input_list_cell_links` — reusable location-wide target/source relationships that resolve against the active workbook (migration `062`)
- **Intercom configuration + event grids (migration `050`):**
  - `intercom_pack_types` — account-level wired/wireless availability counts (future specific equipment can attach without replacing the pack type)
  - `intercom_channels` — reusable master channel list, including an explicit Program-feed marker
  - `role_intercom_defaults` / `role_intercom_default_channels` — per-role starting pack, talk mode, listen mode, and Program-feed settings
  - `workbook_intercom_channels` — event-scoped channel columns, linked to a master channel or created for one event only
  - `workbook_intercom_assignments` / `workbook_intercom_channel_assignments` — event-scoped crew packs plus independent talk/listen state or Program-feed enablement per channel (expanded by migration `058`)
- `workbook_schedule_versions` — immutable JSON snapshots produced by "Send Update" (versioned change checkpoints)
- `events` also carries `workbook_id`, `workbook_location_id` (now → account `locations`), and `event_end_time` columns for workbook attachment

Functions:
- `publish_workbook_schedule(workbook_id, published_by, snapshot)` — snapshots the current schedule as the next numbered version (used by "Send Update")
- `save_input_list_cell_links_bulk(location_id, cells)` / `save_workbook_input_list_values_bulk(workbook_id, cells)` — atomically save drag-filled link or value ranges and their Undo operations

Edge Functions (workbook):
- `workbook-pay` — admin-only (verifies the PCO session token + `is_admin`); computes crew pay for a workbook and returns it only to verified admins. Deployed; wired in for the raw-rate lockdown (crew pay is currently computed client-side in the admin-only Crew tab).
- `pco-workbook-crew` — admin-only; mirrors non-declined assignments from the **Production** team on every attached event's linked PCO plan into `workbook_crew` while preserving workbook-local call/release, pay, and role overrides.

Views:
- `analytics_records` — view over `service_records` that remaps legacy service-type values, exposes event identity/time/labels, and powers Analytics screens. As of migration `043`, it filters to events with `include_in_analytics = true` plus legacy `service_records` rows that have no `event_id` (pre-events historical data).

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
- `supabase/migrations/20260503005015_043_include_in_analytics.sql`
- `supabase/migrations/20260503013350_044_service_types_pco_unique.sql`
- `supabase/migrations/20260525233648_workbook_scheduler_foundation.sql`
- `supabase/migrations/20260725020516_045_production_config.sql`
- `supabase/migrations/20260725025843_046_workbook_pco_time_meta.sql`
- `supabase/migrations/20260725031614_047_workbook_crew.sql`
- `supabase/migrations/20260725203121_049_roles_department.sql`
- `supabase/migrations/20260725211500_050_workbook_intercom.sql`
- `supabase/migrations/20260726003000_051_workbook_supplies.sql`
- `supabase/migrations/20260729184500_052_workbook_crew_pco_sync.sql`
- `supabase/migrations/20260730160000_053_workbook_input_lists.sql`
- `supabase/migrations/20260730190000_054_group_input_list_connections.sql`
- `supabase/migrations/20260731140000_055_workbook_crew_manual_order.sql`
- `supabase/migrations/20260731143000_056_workbook_crew_display_names.sql`
- `supabase/migrations/20260731144500_057_workbook_supplies_whole_quantities.sql`
- `supabase/migrations/20260731151500_058_intercom_talk_listen_program_modes.sql`
- `supabase/migrations/20260731170000_059_monday_issue_sync.sql`
- `supabase/migrations/20260731174500_060_monday_sync_legacy_insert_compat.sql`
- `supabase/migrations/20260801030000_061_issue_photos_permissions.sql`
- `supabase/migrations/20260804190000_062_input_list_cell_links.sql`

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
VITE_ENABLE_MONDAY_PUSH=false
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
MONDAY_ISSUE_ID_COLUMN_ID=required_text_column_id
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

When enabled, the Issue Log mirrors every newly created issue to Monday.com through:

- `supabase/functions/push-monday-issue`

Setup notes:
- Set `VITE_ENABLE_MONDAY_PUSH=true` before building the frontend.
- Add the Monday and Supabase service secrets shown above to your Supabase project for the edge function.
- Add a Monday **Text** column named `Sunday Ops Issue ID` and set `MONDAY_ISSUE_ID_COLUMN_ID` to that column's API ID. The function fails closed when this durable idempotency column is missing.
- Apply migrations `059_monday_issue_sync`, `060_monday_sync_legacy_insert_compat`, and `061_issue_photos_permissions` before deploying the updated Edge Function or frontend.
- Deploy the Edge Function after the migration and secrets, then deploy the frontend.
- Add `VITE_ENABLE_MONDAY_PUSH` as a GitHub Actions secret so the Pages build can enable the UI.
- If `MONDAY_STATUS_COLUMN_ID` is provided, the function will try to set that status column to the issue severity label.

Current production state as of July 31, 2026: migrations `059`, `060`, and `061`, the protected Edge Function, the automatic-mirroring Pages frontend, the Monday `Sunday Ops Issue ID` text column, and its Supabase function secret are deployed. The function is active with JWT verification enabled and rejects unauthenticated requests with `401`. An authenticated production smoke test saved the Sunday Ops issue before delivery, exposed an initial failed state, retried the same issue after the photo-table permission repair, and reconciled to exactly one Monday item with one update. The retained smoke-test issue is resolved in Sunday Ops.

Production verification covered the complete delivery path:

- an unauthenticated function request returned `401` without mutating an issue;
- an authenticated issue was saved in Sunday Ops before external delivery;
- the failed state and retry control remained visible when the first attempt stopped before Monday;
- retrying the same issue after migration `061` produced one Monday item and one update with the correct issue ID;
- the database recorded `synced`, a Monday item ID, no sync error, and a resolved smoke-test record.

Rollback is forward-only: do not edit or delete an applied migration. Disable `VITE_ENABLE_MONDAY_PUSH` and redeploy the frontend before rolling back the function behavior, then use a new migration for any database permission change. Migration `061` repairs the pre-existing Issue Log photo permissions as well as server-side photo lookup, so it should remain in place unless photo access is intentionally being redesigned.

The browser saves the Sunday Ops issue first and sends only its ID to the function. The function requires an unexpired `x-session-token`, claims one delivery attempt, fetches canonical issue/photo data with the service role, and creates:
- a Monday item named from the issue title
- a Monday update containing the full issue description, internal issue ID, and any attached photo URLs as numbered links

The issue row records `not_requested`, `pending`, `syncing`, `synced`, or `failed`. The function combines a deterministic Monday `Idempotency-Key` with the board's `Sunday Ops Issue ID` column, so it can recover an item even if Sunday Ops never received the original create response. Retrying also reuses a stored `monday_item_id`; concurrent requests cannot claim the same issue, and a stale attempt becomes retryable after five minutes. Existing issues that were never pushed are backfilled as `not_requested` rather than becoming an automatic historical backlog. See Monday.com's official [idempotency guidance](https://developer.monday.com/api-reference/docs/idempotency).

Example function deploy command:

```bash
supabase db push
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

Admins can manage access levels from **Settings → People & Access** without touching Supabase directly. The section lists every user who has logged in, shows their last login date, and supports three access levels: User, Manager, and Admin. Managers can manage event and workbook modules; only Admins can change access levels, folder defaults, financial data, and destructive settings. Self-demotion is blocked server-side.

This is backed by the `user-admin` Supabase Edge Function:

```bash
supabase functions deploy user-admin
```

## Notes

- Sunday Ops uses Planning Center sign-in plus server-verified User, Manager, and Admin access levels.
- The module architecture and phased rollout are documented in [`docs/module-architecture.md`](docs/module-architecture.md).
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
- Privileged Edge Functions verify the Planning Center session token and the user's server-side access level before performing protected actions.
- The Supabase anon key (`VITE_SUPABASE_ANON_KEY`) is intentionally public — it is embedded in the built frontend and is safe to expose because all sensitive tables are protected by RLS. Do not confuse it with the service role key (`SUPABASE_SERVICE_KEY`), which must never be committed or exposed to the frontend.
- All other secrets (Monday API token, Google service account key, Gmail delegated credentials) must be added to Supabase project secrets for edge functions and to GitHub Actions secrets for workflows — never hardcoded.
- When in doubt, treat a value as a secret. If it's genuinely non-sensitive (a feature flag, a public URL, a display name), it's fine in committed config.
