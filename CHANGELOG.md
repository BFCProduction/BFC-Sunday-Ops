# Changelog

## 2026-04-18 (Session 11)

### Summary

Added admin-only deletion for unified Sunday Ops events. Admins now have a guarded **Delete Current Event** action in the desktop sidebar, backed by a protected `event-admin` Supabase Edge Function. The database was also locked down so public clients can no longer delete from the `events` table directly. During deployment, the remote migration history was repaired for migrations `030` through `036` after live schema checks showed those changes had already been applied outside the recorded migration history, then migration `037` was applied normally. Reporting was also brought onto the unified event model: manual exports and automated summary emails now work per service/event instead of per old Sunday shell.

### Completed

- Added **Delete Current Event** to the admin-only sidebar controls in `src/components/layout/Sidebar.tsx`.
- Added `deleteEventAsAdmin()` to `src/lib/adminApi.ts`.
- Added `supabase/functions/event-admin/index.ts`:
  - Verifies the `x-session-token` against `user_sessions`.
  - Confirms the associated user has `is_admin = true`.
  - Deletes the target unified `events` row only after admin verification.
  - Removes event-scoped issue photo storage objects from the `issue-photos` bucket.
  - Removes event-scoped production document storage objects from the `production-docs` bucket.
  - Deletes the legacy `special_events` bridge row when the event has `legacy_special_event_id`.
- Added `supabase/migrations/037_admin_only_event_deletes.sql`:
  - Replaces the broad `public_all_events` policy with explicit read/insert/update policies.
  - Revokes `delete` on `public.events` from `anon` and `authenticated`.
  - Leaves delete capability available to `service_role` for the protected Edge Function path.
- Deployed the `event-admin` Supabase Edge Function to project `jrvootvytlzrymwoufzu`.
- Verified the remote migration history was missing `030` through `036`, then checked live schema/API behavior before repairing history:
  - `event_checklist_items` and `event_checklist_completions` already referenced unified `events.id` values.
  - `runtime_fields.analytics_key` was selectable.
  - `production_docs` existed and was selectable.
  - Summary email tables were accessible with `service_role`.
- Repaired the remote Supabase migration history for `030` through `036` as applied.
- Dry-ran `supabase db push` and confirmed only `037_admin_only_event_deletes.sql` remained pending.
- Applied migration `037` to the remote database.
- Updated the README to document admin-only event deletion, the `event-admin` function, and migration `037`.
- Corrected the README migration list entry for migration `030`.
- Reworked the Sunday summary email sender to send one report per `events.id` instead of one combined report per `sundays.id`.
- Added `supabase/migrations/038_event_scoped_summary_email_runs.sql` so `report_email_runs` can track idempotency per event/service.
- Updated the email report data loader for event-native checklist completions, attendance, runtimes, loudness, weather, issues, and multiple outcome-based evaluations.
- Added sender validation flags: `--dry-run`, `--date`, `--event-id`, `--to`, and `--include-empty`.
- Updated Issue Log writes to use the active unified event id going forward, while still reading legacy Sunday-scoped rows for transition history.
- Updated summary email deployment docs for the per-event methodology.
- Replaced the two old Settings PDF export controls ("most recent Sunday" and "previous Sunday") with one **Export a Report** picker that targets any unified event/service.
- Added event-native report export loading for checklist completions, attendance, runtimes, weather, issues, and evaluations, with legacy Sunday fallback for older records.
- Updated the printable report template from a fixed 9am/11am Sunday rollup to a single selected event/service report.
- Updated README feature notes to describe event-based report export.

### Verification

- `npm run build` passed.
- Focused ESLint for changed frontend files passed.
- `supabase functions deploy event-admin` completed successfully.
- `supabase migration list` now shows local and remote history aligned through `037`.
- A no-op anon delete probe against `events` now returns `permission denied for table events`.
- `supabase db push --dry-run` showed only migration `038`, then `supabase db push` applied it successfully.
- A second `supabase db push --dry-run` reported the remote database is up to date.
- `node scripts/send-sunday-summary.js --dry-run --now --date 2026-04-12` generated two event-scoped reports (9am and 11am) without sending mail.
- `node --check scripts/send-sunday-summary.js` passed.
- `npm run build` passed after the summary email changes.
- Focused ESLint for `src/App.tsx`, `src/screens/IssueLog.tsx`, and `scripts/send-sunday-summary.js` passed with one existing `react-hooks/exhaustive-deps` warning in `src/App.tsx`.
- `npm run build` passed after the report export changes.
- Focused ESLint for `src/screens/Settings.tsx`, `src/lib/reportData.ts`, and `src/lib/generateReportHtml.ts` passed.

### Notes

- The existing untracked `.claude/` directory was left untouched.
- Full `npm run lint` still reports pre-existing issues in repo files and `.claude` worktrees; this session verified the changed files directly instead.

---

## 2026-04-17 (Session 10)

### Summary

Cleaned up event backlogs created by earlier auto-generation behavior and tightened the sync path so Planning Center no longer creates new Sunday Ops events. The remaining unified event list now starts with March 2026 services and stops before May 2026; future services and special events are expected to be created manually through the **New Event** workflow, with optional PCO linking.

### Completed

- Deleted 715 unified `events` rows dated May 1, 2026 or later from Supabase after saving a local JSON backup.
- Deleted 282 unified `events` rows dated before March 1, 2026 from Supabase after saving a local JSON backup.
- Deleted 10 duplicate unified `events` rows for the April 22, 2026 "ARMM Breakfast - ATRIUM" PCO plan after saving a local JSON backup.
- Deleted 11 additional unneeded special-event rows from April 2026 after saving a local JSON backup: WA Spring Party, Special Events · April 13, all 7 Jadean Murray funeral duplicates, Test Event Sprint 3, and Spring Tea.
- Deleted 3 final unneeded special-event rows from April 2026 after saving a local JSON backup: Senior Supper, Special Events · April 17, and Robinson Missionary Chapter.
- Updated `pco-sync` so special events are update-only: linked events can still refresh name/date from PCO, but unmatched PCO special plans are skipped instead of inserted.
- Preserved manually-entered special-event times during sync when the PCO sync path has no event time to apply.
- Updated the README to describe PCO sync as fully manual-event based.
- Fixed the session picker Sunday service ordering so upcoming dates list 9am before 11am while past dates keep reverse-chronological ordering.
- Deployed the updated `pco-sync` Supabase Edge Function.

### Verification

- `deno check supabase/functions/pco-sync/index.ts` passed.
- `deno lint supabase/functions/pco-sync/index.ts` passed.
- `npm run build` passed.
- Verified Supabase has 0 unified `events` rows on or after May 1, 2026 after cleanup.
- Verified Supabase has 0 unified `events` rows before March 1, 2026 after cleanup.
- Verified historical `analytics_records` / `service_records` rows before March 1, 2026 remain intact.

---

## 2026-04-17 (Session 9)

### Summary

Production Docs refinement session. The tab introduced in Session 8 was reshaped from a single scrollable page into a horizontal pill tab bar (Stage Plot / Input List / Run Sheets / Other), matching the Service Data tab pattern. The PDF viewer was made full-width by removing the `max-w-3xl` container constraint, and its height was increased to `calc(100vh - 190px)` so stage plots and run sheets fill the available screen real estate. Storage PDFs now load with `#toolbar=1&zoom=page-fit` in the URL so the browser's native viewer auto-fits the page — fixing the "can't zoom out far enough" complaint on the stage plot. On mobile, an initial solution using an open-in-new-tab button was replaced after user feedback: storage PDFs are now routed through Google Docs Viewer (which renders them as HTML) so they display inline within Sunday Ops with full pinch-to-zoom support. Google Sheets embeds continue to use `htmlview` on both platforms. Production Docs was also moved to appear before Gameday Checklist in both the desktop sidebar and the mobile bottom nav. The README was updated to document the new feature, the `production-docs` storage bucket setup, the Drive sync workflow, and the `034` migration. A stale env var name in `docs-sync.yml` was corrected.

### Completed

#### Production Docs tab bar (`src/screens/ProductionDocs.tsx`)

- Replaced the four stacked sections with a **horizontal pill tab bar** — Stage Plot, Input List, Run Sheets, Other — using the same `bg-gray-100` pill and `bg-white shadow-sm` active tab styling as Service Data.
- Count badge on each tab shows how many docs are attached; badge color shifts to `bg-blue-100 text-blue-700` on the active tab.
- Only the active tab's docs are shown below the bar; switching tabs is instant (no network call).
- First doc in the active tab auto-expands on load so the document is immediately visible.
- "Add Document" modal pre-fills its type selector to the currently active tab.
- When a new doc is added, the active tab jumps to that doc's type.
- Empty state includes a hint: "Drive sync runs hourly · admins can add files manually above".

#### PDF viewer size and zoom (`src/screens/ProductionDocs.tsx`)

- Removed the `max-w-3xl mx-auto` outer wrapper — the viewer now fills the full content area (screen width minus the 260px sidebar on desktop).
- Iframe height changed from a fixed `520px` / `620px` to `calc(100vh - 190px)`, giving a tall, near-full-screen viewer on all desktop sizes.
- Storage PDF URLs get `#toolbar=1&zoom=page-fit` appended so the browser's built-in PDF viewer auto-fits the page on initial load. Fixes the "can't zoom out far enough on the stage plot" issue.

#### Mobile inline PDF viewing with pinch-to-zoom (`src/screens/ProductionDocs.tsx`)

- Initial implementation used an "Open PDF / Open in Drive" button on mobile. Replaced after user feedback — the goal is inline viewing within the app.
- Storage PDFs on mobile are now routed through `https://docs.google.com/viewer?url=…&embedded=true`, which renders the PDF as HTML inside the iframe. This gives proper pinch-to-zoom within Sunday Ops on iOS and Android.
- Desktop continues to use the native browser PDF viewer (unchanged).
- Google Sheets `htmlview` embeds are used as-is on both platforms.
- Mobile detection uses `window.innerWidth < 768` at render time — no media query listener needed.

#### Navigation reorder (`src/components/layout/Sidebar.tsx`, `src/components/layout/MobileTabs.tsx`)

- Production Docs moved to appear immediately before Gameday Checklist in both the desktop sidebar nav and the mobile bottom pill nav.
- Mobile tab order is now: Docs · Checklist · Issues · Service · Eval.

#### README and docs updates

- Production Docs added to the "Current Scope" feature list.
- Migration `034_production_docs.sql` added to the migrations list.
- New `### production-docs bucket` section in "Supabase Storage" with bucket setup SQL and Drive sync configuration instructions (service account access, folder ID, filename convention).
- `docs-sync.yml` added to the "GitHub Workflows" list.
- Fixed stale env var name in `docs-sync.yml` comment: `DRIVE_SUNDAY_MORNINGS_FOLDER_ID` → `DRIVE_PRODUCTION_DOCS_FOLDER_ID`.

### Verification

- `npx tsc --noEmit` passed clean after each PR.
- Commits merged:
  - `4124fe5` Refine Production Docs tab layout and viewer
  - `fced79e` Use Google Docs Viewer for PDFs on mobile for inline pinch-to-zoom

---

## 2026-04-13 (Session 8)

### Summary

Mobile and dashboard polish session. The mobile bottom navigation bar was redesigned from a flat full-width white tab bar into a floating dark pill that hovers above the bottom of the screen. The dashboard received two major additions: a PCO Run of Show card pulled directly from the linked Planning Center plan, and a full layout restructure that puts a compact progress strip across the top (dial, overall bar, and all five role bars in one row), then places Today's Schedule and the Run of Show side by side below it. The edge function powering the ROS was extended to fetch plan times in parallel with items and compute a cumulative start time for every item so each row shows its clock time alongside its type, title, description, key, and duration. A bug where checklist completion counts exceeded 100% (due to duplicate `item_id` rows when multiple operators sign off the same item) was also fixed.

### Completed

#### Mobile bottom nav redesign (`src/components/layout/MobileTabs.tsx`)

- Replaced the full-width white border tab bar with a **floating dark pill**.
- Pill is 80% of screen width, centered, `rounded-full`, `background: #1c1c1e`, with a drop shadow.
- Active tab: white icon + white label + small `bg-blue-500` dot below the label.
- Inactive tabs: `text-gray-500` icon and label; invisible dot spacer keeps row height stable.
- Red pulse badge on Issues tab preserved.
- Outer wrapper is a full-width white `div` that provides the background the pill floats over; safe-area-inset-bottom handled on the wrapper.
- Main content `paddingBottom` bumped from `72px` to `80px` to clear the taller pill.

#### PCO Run of Show (`supabase/functions/pco-plan-items/`, `src/lib/adminApi.ts`, `src/screens/Dashboard.tsx`)

- **New edge function** `pco-plan-items`:
  - `POST { event_id }` with `x-session-token`, same auth + token-refresh pattern as other PCO functions.
  - Fetches `/plans/{id}/items` and `/plans/{id}/plan_times` from PCO in parallel.
  - Locates the service start anchor from plan_times (prefers `time_type = "service"`).
  - Computes `computed_starts_at` for every item: pre-service items are walked backwards from service start; service and post-service items walk forward using cumulative `length` durations.
  - Returns `id`, `sequence`, `title`, `item_type`, `length`, `description`, `service_position`, `key_name`, `computed_starts_at`.
  - Deployed to the linked Supabase project.

- **`fetchPcoPlanItems()`** added to `src/lib/adminApi.ts`.

- **`RunOfShow` component** in `Dashboard.tsx`:
  - Shows time column (formatted in church timezone) when any item has a computed time.
  - Type icon: music note (song), film (media), type (header), layers (other).
  - Title + `description` as a subtitle line when present.
  - Song key badge and `m:ss` duration on the right.
  - Section headers rendered as gray divider rows with all-caps label.
  - Scrollable, `maxHeight: 480px`.
  - PCO badge and total runtime label in card header.
  - Only rendered when the active event has a linked PCO plan.

#### Dashboard layout restructure (`src/screens/Dashboard.tsx`)

- **Progress strip** — full-width card across the top:
  - Small dial (48px), fixed-width overall bar (`w-48`), vertical divider, then five role bars in `grid-cols-5` filling the remaining space.
  - Role bars hidden on mobile (already shown in dedicated section below on mobile — now removed on desktop).
  - All bar widths capped at `Math.min(pct, 100)` to prevent overflow when completion count temporarily exceeds item count.
  - SVG ring also capped at 100%.

- **Schedule + ROS row** — `md:grid-cols-4` grid:
  - Today's Schedule: `col-span-1` (25%) when ROS is present, `col-span-4` when not.
  - Run of Show: `col-span-3` (75%).
  - Stacks vertically on mobile.

- **Role Progress section removed** from below the grid — role bars now live exclusively in the top strip on desktop.

#### Bug fix: checklist completion count inflation (`src/screens/Dashboard.tsx`)

- `completedIds` was storing one entry per completion row. Multiple operators signing off the same item created duplicate `item_id` values, inflating `done` and pushing the percentage over 100%.
- Fixed by deduplicating with `[...new Set(...)]` before setting state.

### Verification

- `npm run build` passed.
- `pco-plan-items` deployed and verified on Supabase.
- Commits pushed:
  - `dcd1f51 Redesign mobile bottom nav as floating pill`
  - `25399b2 Add PCO Run of Show to dashboard`
  - `d11a24d Restructure dashboard layout`
  - `c5bf17e Compact progress strip at top of dashboard`
  - `b9be53c Fix inflated checklist completion count`
  - `d7a9d91 Fix progress strip overflow and remove duplicate role section`
  - `b30bd1b Add computed times and descriptions to ROS`

---

## 2026-04-12 (Session 7)

### Summary

Cleaned up several production-ops workflows after the manual event model landed. Runtime field management now happens directly in the real runtime list instead of a separate admin-only section. Service Data tabs now provide recent historical context for the active service type. The PCO plan picker sorts plans in ascending date order. The dashboard "Today's Schedule" now pulls event-specific times from the linked Planning Center plan via a new `pco-plan-times` edge function, with the previous static schedule retained as a fallback. A PCO token expiry bug was also fixed: Sunday Ops sessions can outlive PCO access tokens, so all PCO-facing edge functions now refresh expired access tokens with the stored refresh token before calling Planning Center. The new and updated functions were deployed, verified against the linked Supabase project, committed, and pushed.

### Completed

#### Runtime admin cleanup

- **Inline runtime admin controls** (`src/screens/ServiceData/Runtimes.tsx`):
  - Removed the separate bottom admin management section.
  - Admins now reorder by dragging the actual runtime row in the main list.
  - Admins edit the actual runtime row with a pencil button.
  - The old "Add field" action is now **Add Runtime** and inserts into the main list.

- **Runtime modal simplification** (`src/components/admin/RuntimeFieldModal.tsx`):
  - Removed display-order editing from the modal; ordering is now controlled by drag-and-drop in the list.

#### Service Data history

- **Shared history helpers** (`src/screens/ServiceData/history.tsx`, `src/screens/ServiceData/historyData.ts`):
  - Added reusable UI/data helpers for recent service history.

- **Attendance, Runtimes, Weather, Loudness**:
  - Attendance, Runtimes, and Weather now include recent historical data for roughly the past 10 Sundays for the active service type.
  - Loudness history was already present, but now filters consistently to the active service type and caps visible history at 10 entries.

#### PCO plan picker

- **Plan ordering** (`src/components/layout/QuickCreateModal.tsx`):
  - PCO plans in the picker now sort ascending by event date, which feels more natural when selecting an upcoming or recent plan.

#### Dashboard PCO schedule

- **Dashboard schedule rendering** (`src/screens/Dashboard.tsx`):
  - "Today's Schedule" now fetches the active event's linked PCO plan times and renders those times in the configured church timezone.
  - Schedule row status now respects the selected event date so past/future event dashboards do not light up based only on the current clock.
  - A small `PCO` badge appears when the displayed schedule came from Planning Center.
  - The original hardcoded schedule remains as a fallback for unlinked events or failed PCO calls.

- **Frontend API helper** (`src/lib/adminApi.ts`):
  - Added `fetchPcoPlanTimes()` for calling the new protected `pco-plan-times` function with the current session token.

- **New edge function** (`supabase/functions/pco-plan-times/index.ts`):
  - Added protected `POST { event_id }` endpoint.
  - Looks up the active event, its `pco_plan_id`, and the service type's `pco_service_type_id`.
  - Fetches the linked plan's PCO `plan_times`, filters them to the event date in the configured church timezone, and returns them sorted by `starts_at`.
  - Deployed to the linked Supabase project.

#### PCO token refresh and error handling

- **Token refresh** (`supabase/functions/pco-plans/index.ts`, `supabase/functions/pco-plan-times/index.ts`, `supabase/functions/pco-sync/index.ts`):
  - All PCO-facing edge functions now select `pco_refresh_token` and `pco_token_expires_at`.
  - If the PCO access token is expired or near expiry, the function refreshes it with Planning Center and saves the new token metadata back to `user_sessions`.
  - This fixes the "plan picker shows no plans" and "dashboard keeps showing the hardcoded schedule" symptoms that happened when the Sunday Ops session was still valid but the PCO token had expired.

- **Plan fetch errors** (`supabase/functions/pco-plans/index.ts`):
  - If every PCO fetch fails for a service type, the function now returns an error instead of silently returning an empty plan group.

#### Repo hygiene

- **Supabase temp state** (`.gitignore`):
  - Added `supabase/.temp/` so local Supabase CLI state such as project ref and local version files does not appear in Git.

### Verification

- `npm run build` passed.
- Focused frontend lint for the touched dashboard/API files passed.
- `deno check` passed for `pco-plans`, `pco-plan-times`, and `pco-sync`.
- `deno lint` passed for the touched PCO edge functions.
- Deployed and smoke-tested `pco-plans`, `pco-plan-times`, and `pco-sync` on Supabase.
- Verified `pco-plans` returned plans for all service types and `pco-plan-times` returned real schedule items for linked April 12 services.
- Pushed commits:
  - `a849275 Refine runtime admin controls`
  - `75a7479 Add service data history and sort PCO plans`
  - `df9490d Ignore Supabase temp state`
  - `512e23d Populate dashboard schedule from PCO`
  - `da16289 Refresh PCO tokens in edge functions`

---

## 2026-04-12 (Session 6)

### Summary

Architectural shift to **fully manual event creation**. All events and services are now created in Sunday Ops by hand rather than auto-generated by PCO sync. The "New Event" modal was overhauled to support all service types (9am, 11am, Special) and includes an optional PCO plan picker so any Sunday Ops event can be linked to a Planning Center plan — including linking multiple events to the same PCO plan (solving the Easter multi-service problem). The uniqueness constraint that prevented two 9am or 11am services on the same date was dropped. A new `pco-plans` edge function powers the plan picker. Attendance and runtime data were also confirmed to be syncing correctly to `service_records` via the shared `syncToServiceRecords` utility. A series of bugs were fixed along the way: the nightly weather import (PostgREST partial index conflict), the summary email (missing `service_role` grants), the "Auto-captured" label on manual runtime entries, and the Data Explorer not showing attendance or runtime data. The Data Explorer was also redesigned from a 4-tab layout into a single unified filterable table.

### Completed

#### Data sync fixes

- **`syncToServiceRecords` shared utility** (`src/lib/serviceRecords.ts`):
  - New shared function replacing three separate inline sync implementations.
  - Handles all service types: `sunday-9am` → `regular_9am`, `sunday-11am` → `regular_11am`, `special` → `special`.
  - Special events matched on `(service_date, service_label)`; regular services on `(service_date, service_type)`.
  - Imported and called in `Attendance.tsx`, `Runtimes.tsx`, and `LoudnessLog.tsx`.

- **Attendance sync** (`src/screens/ServiceData/Attendance.tsx`):
  - Was writing to `attendance` table only; now also calls `syncToServiceRecords` so data appears in `service_records` and the Data Explorer.

- **Runtimes sync** (`src/screens/ServiceData/Runtimes.tsx`):
  - Added `analytics_key` field support on runtime fields (`service_run_time`, `message_run_time`, `stage_flip_time`).
  - After save, builds analytics field map from tagged fields and syncs to `service_records`.
  - Fixed "Auto-captured" label showing on manually-entered values → now shows "Saved at".

- **Runtime fields schema** (`supabase/migrations/032_runtime_fields_analytics_key.sql`):
  - Added `analytics_key text check (analytics_key in ('service_run_time', 'message_run_time', 'stage_flip_time'))` column.

#### Infrastructure fixes

- **Weather import** (`scripts/fetch-weather.js`):
  - `upsert` with `onConflict: 'sunday_id'` was failing because migration 016 replaced the unique constraint with a partial index that PostgREST can't use for conflict resolution.
  - Fixed by switching to explicit update-or-insert pattern.

- **Summary email** (`supabase/migrations/031_email_tables_service_role_grant.sql`):
  - `report_email_settings`, `report_email_recipients`, `report_email_runs` had RLS enabled but `service_role` was never granted.
  - Fixed with explicit `GRANT ALL … TO service_role` migration.

#### Data Explorer redesign (`src/screens/Analytics/Explorer.tsx`)

- Replaced 4-tab layout (9am / 11am / Combined / Special) with a single unified filterable table.
- Filter bar: Service type (All / 9am / 11am / Special), Year, sort column, sort direction.
- 16 columns including a Service column with colored dot badge.
- Client-side filtering and sorting; nulls sort to the bottom.

#### Mobile navigation (`src/components/layout/SiteHeader.tsx`)

- Added session nav strip to the site header (visible on mobile where the sidebar is hidden).
- Prev/next chevrons step through all sessions.
- Date label button opens a SessionPicker modal.

#### Service label redesign

- Removed service type pills from sidebar and header.
- Sessions now display as `Apr 12 · 9am` (date + time in one label) instead of separate date + pill.
- Sidebar and header both use the same `displayLabel` derivation.

#### Checklist improvements

- **Removed Service selector from item edit form** (`src/components/admin/ItemFormModal.tsx`): the dropdown that let admins accidentally move items between services was removed. Service assignment is now preserved from the item's existing value.
- **Save as Template** (`src/screens/Checklist.tsx`): added button in edit mode that saves the current checklist as a new `event_templates` record, pre-filling the template name from the service type name.

#### Manual event creation model

- **Migration 033** (`supabase/migrations/033_drop_sunday_uniqueness.sql`):
  - Dropped `events_9am_date_unique` and `events_11am_date_unique` partial indexes.
  - Multiple 9am or 11am services can now exist on the same date (Easter, extra traditional services, etc.).

- **`createEvent()` function** (`src/lib/supabase.ts`):
  - New unified function replacing `createSpecialEvent()`.
  - Accepts any service type slug.
  - For special events: also creates legacy `special_events` row and seeds `event_checklist_items` from template.
  - For Sunday services: creates only the `events` row (no legacy row needed for new events).
  - Supports optional `pco_plan_id` linkage.

- **PCO sync updated** (`supabase/functions/pco-sync/index.ts`):
  - Sunday services: now only **updates** existing events (stamps `pco_plan_id` and refreshes name). No longer auto-creates new Sunday events.
  - Special events: still auto-creates when a PCO plan with a title is found.

- **`pco-plans` edge function** (`supabase/functions/pco-plans/index.ts`):
  - New function that returns recent + upcoming PCO plans grouped by service type.
  - Makes two calls per service type: `filter=future` for upcoming, `order=-sort_date` (no filter) for recent.
  - Called by the plan picker in the creation form.

- **`fetchPcoPlans()` helper** (`src/lib/adminApi.ts`):
  - New client-side helper that calls the `pco-plans` edge function with the current session token.

- **QuickCreateModal rewrite** (`src/components/layout/QuickCreateModal.tsx`):
  - Service Type selector (Sunday 9am / Sunday 11am / Special Event).
  - Name field: optional for Sunday services (defaults to service type name), required for specials.
  - Date pre-fills to next Sunday for 9am/11am; time pre-fills to 09:00/11:00 based on type.
  - **PCO Plan link button** opens `PcoPlanPicker` inline modal:
    - Service type tabs (9am / 11am / Special) — pre-selected to match outer form selection.
    - Search bar filters by date or title within the active tab.
    - On Special tab: event title is the primary line, date is secondary.
    - Selecting a plan stamps `pco_plan_id` and auto-fills name if empty.
  - Checklist Template dropdown (special events only).
  - Notes field.

- **Sidebar** (`src/components/layout/Sidebar.tsx`):
  - Passes `sessionToken` to `QuickCreateModal` so the plan picker can authenticate.
  - Button tooltip updated from "Create new special event" to "Create new event or service".

### Notes

- PCO OAuth tokens expire after approximately 2 hours. Session 7 added token auto-refresh to the PCO-facing edge functions so the plan picker and PCO schedule fetch can continue across a longer Sunday Ops session.
- After dropping the uniqueness constraint, the `events` table has no duplicate prevention for Sunday services — the team is responsible for not creating duplicate sessions for the same date and time.
- Previously auto-created Sunday events (from PCO sync runs before this session) remain in the database and are unaffected.

---

## 2026-04-11 (Session 5)

### Summary

Completed a five-sprint rebuild that brings the app to full alignment with the unified events model introduced in Session 4. Sprints 1–3 wired up PCO OAuth auth, the new `events`/`service_types` tables, and the PCO calendar sync edge function. Sprint 4 unified the Sunday and Event checklists into a single component, added a TemplateManager admin UI, and wired template seeding into the QuickCreate flow. Sprint 5 updated the Analytics screens to speak the new slug format through an `analytics_records` view. A follow-on fix corrected a long-standing schema bug where `event_id` FKs on all operational tables still pointed to `special_events(id)` instead of `events(id)`.

### Completed

#### Sprint 1 — Auth Foundation

- **PCO OAuth** (`supabase/migrations/015_pco_auth.sql`):
  - `user_sessions` table storing PCO access/refresh tokens, expiry, and a server-generated session token.
  - Session token is passed as `x-session-token` header to edge functions.

#### Sprint 2 — Unified Events Model

- **`service_types` table** (`supabase/migrations/017_service_types_and_events.sql`):
  - Three seed rows: `sunday-9am`, `sunday-11am`, `special`.
  - `pco_service_type_id` column for PCO linkage.

- **`events` table** (same migration):
  - One row per service instance — replaces the split between `sundays` and `special_events` in the navigation layer.
  - `legacy_sunday_id` and `legacy_special_event_id` bridge columns keep data tables working without a destructive migration.
  - Seeded from existing `sundays` and `special_events` rows.

- **Supporting migrations**:
  - `018_events_unique_constraint.sql` — unique constraint on `(service_type_id, event_date)`.
  - `019_grant_events_permissions.sql` — anon/authenticated grants on `events`.
  - `020_runtime_fields_service_scope.sql` — scopes runtime fields to service types.
  - `021_checklist_event_native.sql` — native event support for checklist tables.
  - `022_checklist_completions_nullable_sunday.sql` — allows null `sunday_id` on completions.
  - `024–026` — service_role grants on `service_types`, `events`, `app_config`.
  - `027_fix_events_unique_constraint.sql` — constraint correction.

- **`src/lib/supabase.ts`** — new helpers: `loadAllSessions()`, `getEventById()`, `getFirstEventForDate()`, `getEventsForDate()`, `getOrCreateTodayEvents()`.

#### Sprint 3 — Event Management UI

- **PCO sync edge function** (`supabase/functions/pco-sync/index.ts`, `supabase/migrations/023_pco_sync.sql`):
  - Pulls upcoming service plans from Planning Center for all service types with a `pco_service_type_id`.
  - Upserts into `events`: matches on `pco_plan_id`, then falls back to `(service_type_id, event_date)` for Sunday services; special events matched on `pco_plan_id` only.
  - Derives event name from PCO plan title → series title → formatted service type + date.
  - Records `pco_last_synced` timestamp in `app_config`.
  - Called automatically after login and manually from Settings → "Sync Now".

- **SessionPicker** — unified sidebar navigation replaces the old Sunday-only date stepper; steps through all sessions (Sunday and special) in chronological order.

- **QuickCreateModal** — create special events inline from the sidebar; template dropdown pre-populates when templates exist.

#### Sprint 4 — Checklist Rebuild

- **Unified `Checklist.tsx`** (`src/screens/Checklist.tsx`) — full rewrite replacing the separate `Checklist.tsx` (Sunday) and `EventChecklist.tsx` (special events):
  - `isEvent = sessionType === 'event'` drives all branching: data source, form type, role filter visibility, subscription table.
  - Unified `Row` interface normalises both `checklist_items` (has `task`/`role`/`note`) and `event_checklist_items` (has `label`/`item_notes`) for shared rendering.
  - `SortableRow` with optional role badge; DnD reorder via `reorderSection<T>` generic helper.
  - Event mode uses `eventId` (= `special_events.id` via `legacySpecialEventId`), NOT `activeEventId` (= `events.id`).
  - `EventItemFormModal` for adding/editing event checklist items.
  - Real-time subscriptions branch on `isEvent`.

- **`TemplateManager`** (`src/components/admin/TemplateManager.tsx`) — new admin component:
  - Three subcomponents: `TemplateList`, `TemplateEditor`, `TemplateItemFormModal`.
  - Full CRUD on `event_templates` and `event_template_items`.
  - Item count displayed per template via embedded query.

- **Settings** (`src/screens/Settings.tsx`) — added "Checklist Templates" section rendering `<TemplateManager />`.

- **QuickCreateModal template seeding** (`src/components/layout/QuickCreateModal.tsx`):
  - Loads templates on mount; shows a template dropdown when templates exist.
  - Passes `templateId` to `createSpecialEvent`.

- **`createSpecialEvent` template seeding** (`src/lib/supabase.ts`):
  - When `templateId` is supplied: stamps `special_events.template_id`, loads `event_template_items`, and bulk-inserts `event_checklist_items` with `source_template_item_id` linkage.

- **`App.tsx`** — simplified checklist routing from dual `<Checklist>` / `<EventChecklist>` branches to a single `{screen === 'checklist' && <Checklist />}`.

#### Sprint 5 — Analytics Rebuild

- **`analytics_records` view** (`supabase/migrations/028_analytics_records_view.sql`):
  - Thin view over `service_records` that remaps legacy `service_type` enum values (`regular_9am` → `sunday-9am`, `regular_11am` → `sunday-11am`) to the new slug format.
  - Analytics screens query this view so they speak the same language as the rest of the events model. `service_records` remains the authoritative analytics store.

- **`Dashboard.tsx`** (`src/screens/Analytics/Dashboard.tsx`):
  - Queries `analytics_records` instead of `service_records`.
  - All `service_type` string comparisons updated to slug format (`sunday-9am`, `sunday-11am`).
  - `GOAL_LAeq` object keys updated (bracket notation required for hyphenated keys).

- **`Explorer.tsx`** (`src/screens/Analytics/Explorer.tsx`):
  - Same table and slug updates as Dashboard.
  - Fixed dot-notation JS syntax error introduced by the slug rename (`GOAL_LAeq['sunday-9am']`).

#### Follow-on: event_id FK fix

- **`029_fix_event_id_fk_to_events.sql`**:
  - `event_id` columns on `attendance`, `loudness`, `weather`, `runtime_values`, `issues`, `evaluations`, and `service_records` were added in migration 016 pointing to `special_events(id)`. All ServiceData screens use `activeEventId` (= `events.id`), so writes for Sunday services were failing silently with FK violations.
  - Migration remaps existing `special_events.id` values → `events.id` via `legacy_special_event_id`, then re-points all FK constraints to `events(id)`. No code changes required — ServiceData screens already used the correct ID.

### Notes

- `EventChecklist.tsx` is left in place as dead code — safe to remove in a future cleanup pass.
- TypeScript build (`npx tsc --noEmit`) exits clean with zero errors after all changes.

---

## 2026-04-03 (Session 4)

### Summary

Added full **Special Events** support so the team can run non-Sunday services (Good Friday, Christmas Eve, etc.) through the same operational workflow as a regular Sunday. Includes reusable templates, per-event checklists with admin inline editing, and chronological session navigation that mixes Sundays and events in one unified sidebar. Fixed several bugs discovered during Good Friday use.

### Completed

- **Database schema** (`supabase/migrations/014_add_special_events.sql`):
  - Five new tables: `event_templates`, `event_template_items`, `special_events`, `event_checklist_items`, `event_checklist_completions`.
  - Added `event_id` column to all operational tables: `issues`, `attendance`, `loudness`, `weather`, `evaluations`, `runtime_values`, `service_records`.
  - Made `sunday_id` nullable on all operational tables (existing rows unaffected).
  - Partial unique indexes replace simple unique constraints so the same uniqueness guarantees work for both Sunday rows and event rows.
  - `CHECK (sunday_id IS NOT NULL OR event_id IS NOT NULL)` constraints on all shared tables.
  - Full `public_all` RLS + `GRANT` to `anon`/`authenticated` on all five new tables.

- **Types** (`src/types/index.ts`):
  - Added `EventTemplate`, `EventTemplateItem`, `SpecialEvent`, `EventChecklistItem`, `EventChecklistCompletion` interfaces.
  - Added `Session` discriminated union (`{ type: 'sunday' }` | `{ type: 'event' }`) for unified navigation.
  - `Issue.sunday_id` made nullable; `event_id` added.

- **Context** (`src/context/SundayContext.ts`):
  - Extended `SundayContextType` with `eventId`, `eventName`, `sessionType`, `sessionDate` — fully backward-compatible with all existing screens.

- **Data layer** (`src/lib/supabase.ts`):
  - `getSpecialEventByDate(date)` — looks up a special event on a given date.
  - `loadAllSessions()` — fetches all Sundays and all events, merges into a single chronologically-sorted `Session[]`.
  - `getOperationalSession()` — determines whether the operational date resolves to a Sunday or a special event.

- **App init & navigation** (`src/App.tsx`):
  - On startup, checks for a special event at the operational date before defaulting to a Sunday.
  - `navigateSunday()` checks for events first, falls back to Sunday lookup.
  - Routes `screen === 'checklist'` to `<Checklist>` or `<EventChecklist>` based on session type.
  - Passes `eventId` to all operational screens.

- **Sidebar** (`src/components/layout/Sidebar.tsx`):
  - Prev/next arrows now step through `allSessions` (Sundays + events mixed in date order).
  - Shows event name as primary label with date below when viewing an event.
  - Purple "Special Event" badge with `CalendarDays` icon.

- **Special Event Manager** (`src/components/admin/SpecialEventManager.tsx`):
  - Admin UI in Settings → Special Events for full CRUD on templates and events.
  - **Templates**: create/edit with name, notes, and checklist items. Items can be pulled from the Sunday checklist ("Add from Sunday checklist" picker) or created as custom items. "Add all (N)" button adds all available Sunday items at once. Picker filters out already-added items.
  - **Events**: create/edit with name, date, time, template selection, and preview of template items. On creation, template items are snapshotted into `event_checklist_items` so later template edits don't affect existing events.
  - **Edit Items on Event**: per-event item editor to add/remove/edit items after creation — changes are isolated to that event.
  - **Save as Template**: create a new template from an event's current checklist items.
  - Errors always visible in a pinned footer banner regardless of scroll position.

- **Event Checklist screen** (`src/screens/EventChecklist.tsx`):
  - Matches Sunday checklist layout exactly: sticky header, progress bar, collapsible section cards, two-column desktop layout (`xl:columns-2`).
  - Initials stored in `localStorage` and reused across checkoffs; sign-off modal as fallback.
  - Supabase Realtime subscription on `event_checklist_completions` for live cross-device sync.
  - **Admin mode**: drag-to-reorder items within sections (persisted to `sort_order`), inline edit modal (label, section, subsection, notes), delete with confirmation, "Add item to {section}" button per section.
  - Admin mode uses `useAdmin()` context — same admin toggle as the Sunday checklist.

- **Operational screens** — all updated to pass `eventId` and query/insert against the correct session:
  - `IssueLog.tsx`: conditional filter and insert (`event_id` vs `sunday_id`).
  - `ServiceData/index.tsx`: passes `eventId` to sub-screens.
  - `ServiceData/Attendance.tsx`: manual upsert for events (partial unique index workaround).
  - `ServiceData/Weather.tsx`: conditional query filter.
  - `ServiceData/Runtimes.tsx`: per-field manual upsert loop for events.
  - `ServiceData/LoudnessLog.tsx`: `loudnessUpsert()` helper used by both 9am and 11am submit paths.
  - `Evaluation.tsx`: conditional filter/insert.

### Bug Fixes

- **"Add All removes all items"**: `Date.now()` returns the same millisecond value in a synchronous `forEach`, giving all new items identical IDs. Fixed by appending a random suffix to every generated ID.
- **"Save Template does nothing"**: Supabase error objects are not JS `Error` instances, so the catch block was displaying "Save failed" instead of the real message. Fixed to extract `.message` from the raw Supabase error object. Error banner moved from inside the scrollable content area to a pinned footer position so it's always visible.
- **"Permission denied for table event_templates"**: Tables existed but `GRANT` statements had not been run for the `anon` role. Fixed by running explicit grants on all five new tables.

### Notes

- Migration `014_add_special_events.sql` must be applied manually in the Supabase SQL editor (tables, RLS, grants).
- The manual upsert pattern (select → update or insert) is required for all event rows due to Supabase's `onConflict` not supporting partial unique indexes.

---

## 2026-04-01 (Session 3)

### Summary

Fixed a root-cause bug where evaluations were being saved to the wrong Sunday's ID (app was defaulting to the *next* Sunday on weekdays instead of the most recent past Sunday). Added a configurable "Sunday Focus Flip" setting so the app knows when to shift attention from last Sunday to the upcoming one. Corrected service phase time boundaries. Cleaned up and reorganized the Settings page. Added countdown-target support to the ProPresenter relay so overrun message timers capture the true total runtime.

### Completed

- **Sunday focus direction fix** (`src/lib/churchTime.ts`):
  - `getOperationalSundayDateString` previously looked *forward* to next Sunday on Mon–Sat. This caused all data entered during the week (evaluations, manual runtimes, etc.) to be saved against the upcoming Sunday rather than the one that just happened.
  - Now defaults to looking *back* to the most recent Sunday on weekdays, flipping forward based on a configurable day + time.

- **Configurable Sunday Focus Flip** (`src/lib/churchTime.ts`, `src/lib/supabase.ts`, `src/App.tsx`, `src/screens/Settings.tsx`):
  - New `sunday_flip_day` and `sunday_flip_hour` keys in `app_config`.
  - Default: Monday at noon — before noon Monday the app stays on last Sunday; after noon it shifts focus to next Sunday.
  - Configurable in Settings → App Settings → Sunday Focus Flip (day dropdown + time dropdown).
  - `loadFlipConfig()` added to `supabase.ts`; `getOrCreateSunday()` accepts `flipDay`/`flipHour` parameters.

- **Service phase time corrections** (`src/lib/serviceStatus.ts`, `src/components/layout/Sidebar.tsx`):
  - Updated phase boundaries to match actual service schedule: Pre-Service 7–9am, Service 1 9–10am, Between Services 10–11am, Service 2 11am–noon, Post-Service noon–6pm.
  - Sidebar fallback hint updated from `8:30 · 10:15` to `9:00 · 11:00`.

- **Evaluation submit error surfaced** (`src/screens/Evaluation.tsx`):
  - `submit()` previously called `setSubmitted(true)` unconditionally regardless of whether the Supabase insert succeeded.
  - Now checks the returned error and shows an alert on failure instead of falsely confirming submission.
  - Fixed `evaluations` table permissions: added `GRANT select, insert ON TABLE evaluations TO anon, authenticated` (must be run manually in Supabase SQL editor).

- **Settings page reorganization** (`src/screens/Settings.tsx`):
  - Sections reordered and regrouped into two clear sections: **App Settings** (Timezone, Sunday Focus Flip) and **Reporting** (Most Recent Sunday PDF, Previous Sunday picker, Summary Email status + admin config).
  - "PDF Export" and "Summary Email" no longer live in separate top-level sections — all reporting output is grouped together.
  - Section header renamed from "Church Settings" to "App Settings".

- **ProPresenter relay: countdown timer support** (`scripts/propresenter-relay.js`, `src/components/admin/RuntimeFieldModal.tsx`, `supabase/migrations/014_add_countdown_target.sql`):
  - New optional `countdown_target` column on `runtime_fields` (e.g. `25:00`).
  - When set, the relay uses ProPresenter's `state` field to compute the true elapsed time: `overran` → target + overrun; `complete` → target; `stopped` → target − remaining.
  - This correctly handles the case where a message timer runs past its configured countdown and ProPresenter starts counting up from zero.
  - Runtime field edit modal exposes the new "Countdown Target" field with explanatory copy.
  - New `--dump-timers` flag added to the relay for inspecting raw ProPresenter timer objects (`node scripts/propresenter-relay.js --dump-timers`); also bypasses the day filter so it works any day of the week.

### Notes

- The `countdown_target` field must be set once per runtime field in the admin UI — ProPresenter's API does not expose the configured timer duration, only the current time and state.
- The `evaluations` table GRANT needs to be run once manually in the Supabase SQL editor (see README).

---

## 2026-03-28 (Session 2)

### Summary

Built the Analytics screen (Dashboard + Data Explorer), refined Dashboard KPIs, and backfilled four years of historical service runtime data by extracting it from the Gameday Checklist PDF archive.

### Completed

- **Analytics screen** (`src/screens/Analytics/index.tsx`, `src/screens/Analytics/Dashboard.tsx`, `src/screens/Analytics/Explorer.tsx`):
  - Full Analytics section added to the app with three tabs: Dashboard, Data Explorer, and Ask a Question (placeholder).
  - Dashboard is the default tab.

- **Dashboard KPI cards** (`src/screens/Analytics/Dashboard.tsx`):
  - Six KPI cards: Avg Attendance, Avg Service Runtime, Avg Message Runtime, Avg Loudness (LAeq 15), Avg Stream Views, and Total Sundays in range.
  - Each card shows an overall value, a 9am / 11am breakdown where applicable, and a delta arrow comparing the selected range to the prior equivalent period.
  - `fmtSecs()` rounds to the nearest whole second before formatting so averages never display decimal seconds (e.g. "53m 9s" not "53m 8.7s").
  - Removed the District Report banner that previously occupied the top of the Dashboard.
  - Added **Avg Message Runtime** as the 6th KPI card — overall average plus separate 9am and 11am breakdowns — sourced from the new `message_run_time_secs` column in `service_records`.
  - KPI grid updated from 5 to 6 columns (`xl:grid-cols-6`).

- **`service_records` table** (`supabase/migrations/012_create_service_records.sql`):
  - New unified analytics table: one row per service per Sunday.
  - Stores attendance, runtime, message runtime, stage flip time, loudness, weather, and stream analytics in one place.
  - Replaces the patchwork of individual operational tables for reporting purposes (those tables remain intact during the transition).
  - C-weighted loudness columns added in `013_add_c_weighted_loudness.sql` (`max_db_c_slow`, `lc_eq_15`).

- **Historical Gameday Checklist PDF extraction** (`scripts/extract-checklist-runtimes.js`):
  - One-shot Node.js script that scans all Sunday folders in the local Google Drive archive (`~/Library/CloudStorage/…/01 Prod Doc Archive`).
  - Finds each `*Gameday Checklist*.pdf`, extracts text with `pdftotext` (falling back to Python `pdfplumber`), and parses three fields:
    - **Service runtimes** (9am + 11am): first and second standalone time values in the Service Data block.
    - **Message runtimes** (9am + 11am): first and second lines in the Service Data block containing "message" + a time value.
    - **Stage flip time**: any line in the document containing "Stage Flip" + a time value.
  - Handles the full format evolution across PDF generations (2021–2025): labels before values, labels after values, message times in comment fields, "1st Message" / "2nd Message" labeling, `MM:SS` vs `H:MM:SS` time formats.
  - Dry-run by default; pass `--write` to upsert into Supabase.
  - Run result: **242 PDFs scanned → 240 parsed → 465 service rows updated** (0 errors, 0 unmatched dates). 2 blank forms (Aug/Sep 2022) correctly skipped.
  - Coverage: service runtimes for all 240 dates (Jun 2021–Mar 2026); message runtimes for 63 dates (mid-2024 onward); stage flip times for 8 dates (Jan 2025 onward).

### In Queue for Next Session

- YouTube analytics importer (`scripts/fetch-youtube.js` is still a stub).
- AI "Ask a Question" tab — natural-language queries against `service_records` via Claude API / Supabase Edge Function.
- Update operational input screens (Loudness Log, Attendance, Runtimes) to write to `service_records` as well as the legacy tables.
- ~~Backfill attendance and loudness into `service_records` from existing legacy tables.~~ (completed)

---

## 2026-03-28

### Summary

Completed the RESI analytics importer, performed a full security audit, and implemented all identified fixes. Updated the README and CHANGELOG to reflect current project state.

### Completed

- **RESI analytics importer** (`scripts/fetch-resi.js`):
  - Fully implemented — no longer a stub.
  - Logs into RESI via Playwright, downloads the session-level CSV for the target Sunday, computes per-service stats, and writes to Supabase.
  - Assigns service names by temporal order of viewer sessions (Traditional / Contemporary).
  - Optional Google Sheets write-back for Church Online unique viewer totals.
  - Supports `--now`, `--date`, and `--dry-run` flags.
  - README updated to reflect completion.

- **Security audit and hardening**:
  - Audited the full codebase for security vulnerabilities. Five issues identified and fixed; three others acknowledged as acceptable trade-offs for a shared internal tool.

  - **Hardcoded fallback admin password removed** (`src/lib/adminApi.ts`):
    - The default fallback `'bfcadmin'` was embedded in compiled frontend JavaScript. Replaced with an empty string so no password can ever match if `VITE_ADMIN_PASSWORD` is not set.

  - **File type validation on photo uploads** (`src/screens/IssueLog.tsx`):
    - The file picker already had `accept="image/*"` on the HTML element. Added a `.filter(f => f.type.startsWith('image/'))` guard in `handleFileChange` so non-image files are also rejected at the JavaScript layer, not just the browser UI.

  - **Storage delete policy tightened** (`supabase/migrations/011_security_hardening.sql`):
    - The original setup allowed any anonymous user to delete any file in the `issue-photos` bucket. The public delete policy has been dropped. Only the service role (edge functions / server-side scripts) can now delete storage objects.

  - **Email table RLS policies made explicit** (`supabase/migrations/011_security_hardening.sql`):
    - `report_email_settings`, `report_email_recipients`, and `report_email_runs` had RLS enabled but no policies defined (Supabase denies all by default in this state, so these were already locked down). Added explicit `as restrictive` deny-all policies for `anon` and `authenticated` roles to make the intent undeniable and guard against accidental future policy additions opening access.

  - **CORS restricted to known origins** (`supabase/functions/*/index.ts`):
    - All three edge functions (`admin-session`, `summary-email-admin`, `push-monday-issue`) previously returned `Access-Control-Allow-Origin: *`. Replaced with a `getCorsHeaders(request)` helper that checks the request `Origin` against an allowlist (`https://bfcproduction.github.io`, `http://localhost:5173`) and echoes back only a matching origin.

  - **Edge functions redeployed** via Supabase CLI to make CORS changes live.

  - **Migration 011 applied** in the Supabase SQL editor.

### Intentionally Not Changed

- `public_all` RLS policies on operational tables (`sundays`, `issues`, `checklist_items`, etc.) — this app has no user accounts by design; the anon key is the intended access method for operators.
- Admin password stored in React state — expected for a shared-password model; the password is never written to `localStorage` or disk.
- CORS not restricting operator access — operators access the app from the same GitHub Pages origin.

### In Queue for Next Session

- YouTube analytics importer (`scripts/fetch-youtube.js` is still a stub).
- Historical data dashboard — trend graphs across loudness, attendance, and stream analytics by Sunday.

---

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
