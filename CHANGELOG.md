# Changelog

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
