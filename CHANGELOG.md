# Changelog

## 2026-03-23 (Session 2)

### Summary

Audited the README against the actual codebase and corrected it — several features listed as pending were already shipped. Imported three years of historical loudness data from the BFC Audio Loudness Log Google Sheet. Built a full-history loudness PDF export styled to match the Sunday report. Added Sunday time-travel navigation to the sidebar so any past Sunday's data can be viewed in full context.

### Completed

- **README audit and correction** (`README.md`):
  - Verified every "Future Session Notes" and "Still pending" item against live code.
  - Moved to "Live now": drag-to-reorder checklist items, Supabase Realtime subscriptions, section/subsection dropdowns with "Add new…", mobile header logo visibility, desktop checklist two-column layout, sticky header, subsection dedup, auto-delete empty subsections, loudness log design, PDF photo thumbnail exclusion.
  - "Future Session Notes" trimmed to only genuine remaining work.

- **Historical loudness import** (`scripts/import-loudness-history.js`):
  - One-shot script that fetches the BFC Audio Loudness Log Google Sheet as a public CSV export, parses it (with proper handling of quoted date fields containing commas), and upserts rows into Supabase.
  - Dry-run by default; pass `--write` to write to the database.
  - Skips future placeholder rows that have no readings.
  - Imported 144 rows (March 26, 2023 – March 15, 2026) with 0 errors.

- **Loudness full-history PDF export** (`src/lib/generateLoudnessReportHtml.ts`, `src/screens/ServiceData/LoudnessLog.tsx`):
  - New "↓ Full History PDF" button in the Loudness Log screen, next to the "Recent Sundays" label.
  - Fetches all loudness records from Supabase on demand, generates a styled HTML report, and opens the browser print dialog.
  - PDF matches the Sunday report aesthetic: dark header with BFC Production logo, blue-to-green gradient bar, KPI cards, footer.
  - Data grouped by year, each with a year-average row. Values exceeding goal shown in red with a `!` flag.
  - KPI cards: total Sundays logged, 9am avg LAeq 15, 11am avg LAeq 15, total goal exceedances (split by service).

- **Sunday time-travel navigation** (`src/context/SundayContext.ts`, `src/App.tsx`, `src/components/layout/Sidebar.tsx`, `src/lib/supabase.ts`):
  - Chevron `‹` / `›` arrows added to the sidebar date block. Each click steps one Sunday backward or forward.
  - Right arrow disabled when already on this Sunday.
  - Selecting a past Sunday does a read-only lookup (`getSundayByDate`) — no new rows are created for historical dates.
  - `SundayContext` updated with `todaySundayDate`, `isViewingPast`, and `navigateSunday(date)` so the entire app responds to the navigation.
  - All screens (Dashboard, Checklist, Issue Log, Service Data, Evaluation) automatically reload with the selected Sunday's data.
  - Past Sunday indicator: amber "Historical View" badge replaces the live service-phase pill.
  - "Back to Today" link (with rotate icon) appears below the badge when viewing a past Sunday.
  - Date block label changed from "Today" to "This Sunday" when on the current week.

### In Queue for Next Session

- YouTube / RESI analytics importers (`scripts/fetch-youtube.js` and `scripts/fetch-resi.js` are stubs).
- Historical loudness trend graphics and a broader data dashboard (attendance, loudness, stream analytics across time).

---

## 2026-03-23

### Completed

- **PDF export** (`src/lib/generateReportHtml.ts`, `src/lib/reportData.ts`):
  - "Export PDF" button in the new Settings page generates a self-contained HTML report opened in a new tab, then triggers the browser print dialog.
  - Fetches attendance, runtimes, issues, checklist exceptions, evaluations, and weather in one parallel call.
  - Background colors preserved in print output via `print-color-adjust: exact`.
  - BFC Production logo embedded as a base64 data URL so it renders correctly in the print window regardless of the page's asset base path.
  - Resolved issues show a "✓ Resolved" badge in the issues table.
  - Supports exporting "This Sunday" or any of the previous 14 Sundays via a dropdown.

- **Settings page** (`src/screens/Settings.tsx`):
  - Admin-only screen accessible from the sidebar gear icon.
  - PDF Export section: "This Sunday" button and a "Previous Sunday" dropdown.
  - Church Settings section: timezone dropdown (20+ IANA zones) with free-text fallback, saved to `app_config` Supabase table.
  - Summary Email section: full email config (enable/disable, send day/time, reply-to) and recipient management (add/edit/delete/toggle active) — previously in `Service Data → Reporting`.
  - Removed the Reporting tab from Service Data entirely.

- **Configurable church timezone** (`src/lib/supabase.ts`, `src/context/SundayContext.ts`, `src/App.tsx`):
  - Timezone is no longer hardcoded to `America/Chicago`.
  - On startup, `loadChurchTimezone()` reads the `church_timezone` key from `app_config`; falls back to `America/Chicago` if absent.
  - `timezone` is stored in `SundayContext` and consumed throughout the app.
  - `getOrCreateSunday()` accepts a timezone parameter so the correct operational Sunday is identified in any timezone.
  - All `toLocaleTimeString` calls that previously hardcoded `America/Chicago` now pull from context.
  - **Migration required:** `supabase/migrations/008_add_app_config.sql`

- **Issue log — modal removed, inline checkbox** (`src/screens/IssueLog.tsx`):
  - Removed the "How should we handle this?" confirmation modal.
  - Replaced with an inline "Flag for follow-up before next Sunday" checkbox in the new issue form (only visible when `VITE_ENABLE_MONDAY_PUSH=true` and severity is not Low).

- **Issue resolution** (`src/screens/IssueLog.tsx`, `src/types/index.ts`):
  - Added "Mark Resolved" button to each open issue card.
  - Resolved issues move to a dimmed "Resolved" section at the bottom with a timestamp and an admin "Undo" link.
  - Issue badge in the sidebar/nav filters to unresolved issues only.
  - Dashboard high-priority issue banner filters out resolved issues.
  - **Migration required:** `supabase/migrations/007_add_issue_resolution.sql`

- **Runtime timezone fix** (`src/screens/ServiceData/Runtimes.tsx`):
  - `captured_at` display was using the device's local timezone, causing runtimes captured at e.g. 10:20 CDT to display as 9:20 on a device set to CST. Fixed to use `timeZone: timezone` from context.

- **Dynamic service status** (`src/components/layout/Sidebar.tsx`, `src/components/layout/SiteHeader.tsx`):
  - Replaced hardcoded "Pre-Service" badge with a live computed phase using `getServicePhase()`.
  - Updates every 60 seconds. Returns null on non-Sundays (shows a static service time fallback).
  - Phases: Pre-Service · Service 1 · Between Services · Service 2 · Post-Service.

- **Weather import fixes** (`.github/workflows/weather-import.yml`, `scripts/fetch-weather.js`):
  - Cron schedule changed from `*/5 * * * *` (every 5 min every day) to `*/5 * * * 0` (Sundays only), eliminating daily failure notification emails.
  - Script now exits 0 gracefully on DB config errors instead of failing the workflow.

- **Branding** (all screens, components, generated HTML):
  - "Sunday Ops Hub" renamed to "Sunday Ops" everywhere — header, sidebar, PDF footer, page title.

- **Photo attachments for issue logs** (`src/screens/IssueLog.tsx`, `supabase/migrations/009_add_issue_photos.sql`):
  - Multiple photos can be attached to an issue at log time via a file picker in the new issue form.
  - Selected photos show as removable thumbnail previews before submission.
  - Photos upload to Supabase Storage bucket `issue-photos` immediately after the issue is saved.
  - Thumbnail strip renders on each issue card (open and resolved); tapping a thumbnail opens a full-screen lightbox (Escape or tap outside to close).
  - Admins can delete individual photos via a hover-reveal ✕ button; the Storage object is removed alongside the DB record.
  - Deleting an issue also removes all its Storage objects.
  - Upload errors are surfaced in the notice banner rather than silently swallowed.
  - **Migration required:** `supabase/migrations/009_add_issue_photos.sql`
  - **Supabase setup required:** see README for storage bucket and policy instructions.

- **Monday.com photo sync** (`supabase/functions/push-monday-issue/index.ts`):
  - When an issue with photos is flagged for follow-up, the public Storage URLs are appended to the Monday item's update body as numbered links.
  - The edge function now handles `create_update` failures as non-fatal (item creation still succeeds).
  - Supabase DB sync errors inside the edge function are also non-fatal — the function returns 200 if Monday accepted the item.

### Required Supabase Steps (run in SQL Editor)

```sql
-- Migration 007: issue resolution
alter table issues add column if not exists resolved_at timestamptz;

-- Migration 008: app config
create table if not exists app_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table app_config enable row level security;
create policy "public_all" on app_config for all using (true) with check (true);
insert into app_config (key, value)
  values ('church_timezone', 'America/Chicago')
  on conflict (key) do nothing;

-- Migration 009: issue photos
create table if not exists issue_photos (
  id           uuid primary key default gen_random_uuid(),
  issue_id     uuid not null references issues(id) on delete cascade,
  storage_path text not null,
  filename     text not null,
  uploaded_at  timestamptz not null default now()
);
alter table issue_photos enable row level security;
create policy "public_all" on issue_photos for all using (true) with check (true);
create index if not exists issue_photos_issue_id_idx on issue_photos(issue_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE issue_photos TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE issue_photos TO authenticated;

-- Storage policies for issue-photos bucket
create policy "allow public uploads" on storage.objects
  for insert to public with check (bucket_id = 'issue-photos');
create policy "allow public reads" on storage.objects
  for select to public using (bucket_id = 'issue-photos');
create policy "allow public deletes" on storage.objects
  for delete to public using (bucket_id = 'issue-photos');
```

### In Queue for Next Session

- **Checklist — subsection dropdown bug:** Adding a new item to an existing subsection creates a duplicate subsection header instead of placing it under the correct one.
- **Checklist — section/subsection as dropdowns:** Section and subsection fields in the item edit modal should be dropdowns of existing values with an "Add new…" option.
- **Checklist — drag-to-reorder (admin only):** Drag handles on each item to reorder within a section, persisted to `sort_order`.
- **Checklist — real-time sync:** Supabase Realtime is enabled on `checklist_completions` and `checklist_items`; subscription code not yet written.
- **Loudness Log — split services:** 9 AM and 11 AM service submissions should be saveable independently.
- **Layout — sticky header / mobile header visibility.**

---

## 2026-03-22

### Completed

- **Checklist — expandable notes** (`src/screens/Checklist.tsx`): Notes on checklist items were previously always-visible as tiny gray text that was easy to miss, and non-admins had no obvious way to find them. Items with notes now show a small `›` chevron next to the task label. Tapping the label toggles the note open or closed with a smooth CSS grid-rows slide animation that pushes the items below it down rather than overlapping anything. Notes are hidden by default.

- **Evaluation screen — full redesign** (`src/screens/Evaluation.tsx`, `src/types/index.ts`):
  - Replaced discipline-based 1–5 ratings (Audio / Video / Lighting / Stage / Stream / Overall) with outcome-based questions any team member can answer honestly regardless of where they were standing during service.
  - Four anchored feel options: Excellent / Solid / Had some rough spots / Significant issues.
  - Conditional broken-moment Yes/No toggle — selecting Yes expands a detail textarea using a CSS grid-rows slide animation.
  - Three text fields: "What worked really well?" (required), "What needed attention?" (optional), "Anything specific to your area?" (optional, with discipline hint copy).
  - Multiple anonymous submissions per Sunday — no login, no user ID, each submit is its own row.
  - Post-submission confirmation with "Submit another response" CTA, designed for shared devices after service.
  - Collapsible aggregate panel below the form: total response count, color-coded feel tally pills, individual response cards showing all filled fields.
  - Stream Analytics panel (YouTube / RESI / Church Online peaks) preserved unchanged.
  - Updated `Evaluation` type in `src/types/index.ts` to match new schema.
  - **Requires Supabase migration** — see README for SQL.

- **Branding — logo and favicon**:
  - Replaced the text placeholder in `SiteHeader` with `BFC_Production_Logo_Hor reverse.png`.
  - Set `BFC_Production_ICON.png` as the browser tab favicon (`public/favicon.png`).
  - Added `public/apple-touch-icon.png` (same icon, exact filename iOS looks for) for reliable home screen bookmarks.
  - Linked `public/manifest.json` in `index.html` for PWA icon resolution on modern iOS.
  - Updated browser tab title from `bfc-sunday-ops` to `BFC Sunday Ops`.

### In Queue for Next Session

- **Checklist — subsection dropdown bug:** Adding a new item to an existing subsection creates a duplicate subsection header instead of placing it under the correct one. Root cause is free-text subsection entry with no deduplication.
- **Checklist — section/subsection as dropdowns:** Section and subsection fields in the item edit modal should be dropdowns of existing values with an "Add new…" option. Subsections with no remaining items should auto-delete.
- **Checklist — drag-to-reorder (admin only):** Drag handles on each item to reorder within a section, persisted to `sort_order` in Supabase.
- **Checklist — real-time sync:** Supabase Realtime is enabled on `checklist_completions` and `checklist_items`. Code for the subscription hooks has not been written yet.
- **Loudness Log — split services:** 9 AM and 11 AM service submissions should be saveable independently.
- **Layout — sticky header:** Site header should be fixed to the top of the viewport on all pages.
- **Layout — mobile header:** Logo/header bar should be visible on mobile viewports.

---

## 2026-03-20

### Completed

- Added Sunday summary email configuration tables:
  - `report_email_settings`
  - `report_email_recipients`
  - `report_email_runs`
- Added protected Supabase edge functions for:
  - admin password verification
  - summary email settings / recipient management
- Moved admin password verification to a server-side function with a local fallback for development.
- Added `Service Data -> Reporting` for:
  - send schedule
  - reply-to address
  - recipient list management
- Added `scripts/send-sunday-summary.js` to gather Sunday checklist, issues, service data, and evaluation notes into a concise HTML + plain text report.
- Added `summary-email.yml` to send the Sunday summary automatically through Google Workspace Gmail API once configured.
- Added a visual email mockup in:
  - `docs/sunday-summary-email-mockup.html`
- Updated README and `.env.example` with the new summary-email setup requirements.

## 2026-03-19

### Completed

- Aligned the repo schema with the live app by adding migrations for:
  - `checklist_items`
  - `runtime_fields`
  - `runtime_values`
  - `weather_config`
- Switched Sunday/date handling to church-local Central time for app and relay logic.
- Updated checklist loading so the dashboard and checklist both use live Supabase checklist data instead of only static seed data.
- Added persistent checklist initials on the checklist page so operators can check off multiple items without re-entering initials each time.
- Fixed ProPresenter runtime indexing to use zero-based clocks, including support for `0` as the first timer.
- Added support for manual-only runtime fields by allowing runtimes with no ProPresenter host.
- Improved runtime admin UI copy so manual-only and connected runtimes are clearer.
- Replaced mock weather behavior with real Supabase-backed weather display and empty states.
- Added admin-configurable weather settings:
  - location label
  - ZIP code
  - pull day
  - pull time
- Added scheduled weather import via `scripts/fetch-weather.js` and `weather-import.yml`.
- Added Monday.com issue push through the Supabase Edge Function:
  - `supabase/functions/push-monday-issue`
- Enabled Monday.com integration through GitHub build-time flag support in the deploy workflow.
- Updated Monday.com issue creation so new Monday items use the issue text without the severity prefix in the item name.
- Added issue titles to the issue log so operators can enter a short issue name plus a separate description.
- Updated Monday.com issue sync so:
  - the issue title becomes the Monday item name
  - the issue description becomes the Monday update body
- Changed operator-facing issue wording from explicit Monday.com language to neutral follow-up language such as:
  - `Log Only`
  - `Address Before Next Sunday`
- Added admin-only issue deletion in the issue log.
- Added placeholder analytics scripts so the repo explicitly reflects missing importer work instead of referencing absent files.
- Updated README to match the actual app scope, setup, and workflows.
- Removed leftover transitional/mockup messaging from:
  - Attendance
  - Evaluation analytics
  - Weather empty state
- Verified live weather import end to end against the production Supabase project.
- Fixed the app and relay to use the operational Sunday date instead of the literal current date.
- Hardened the ProPresenter relay to:
  - create the target Sunday record if needed
  - fall back from HTTP timer endpoints to ProPresenter's TCP/IP API
  - log which transport and endpoint succeeded
- Added relay helper scripts for macOS auto-start:
  - `scripts/run-propresenter-relay.sh`
  - `scripts/install-relay-launch-agent.sh`
- Verified the production relay Mac LaunchAgent setup:
  - repo moved to `/Users/production/Code/BFC-Sunday-Ops`
  - LaunchAgent installed as `com.bfc.sundayops.propresenter-relay`
  - scheduled daily at `05:00`
- Identified and corrected the production host typo from `10.1.51.39` to `10.1.51.139`.
- Documented the relay Mac setup and troubleshooting in:
  - `docs/relay-mac-setup.md`
- Logged the local Supabase CLI in, repaired the remote migration history for:
  - `001`
  - `002`
  - `003`
  - `004`
- Applied `005_add_issue_titles.sql` to the linked Supabase project and redeployed:
  - `supabase/functions/push-monday-issue`
- Pushed the frontend issue-title and wording updates to `main`.

### Notes

- The repo now supports:
  - shared-team checklist usage
  - admin-managed checklist/runtime/weather settings
  - weather scheduling/import
  - Monday.com issue pushing
- Remaining planned work:
  - YouTube / RESI analytics importers
  - historical loudness-log import for reporting and graphics
  - desktop checklist column layout cleanup to avoid large blank gaps between sections
  - downstream reporting / summary-email automation
