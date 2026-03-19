# Changelog

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

### Notes

- The repo now supports:
  - shared-team checklist usage
  - admin-managed checklist/runtime/weather settings
  - weather scheduling/import
  - Monday.com issue pushing
- Remaining planned work:
  - YouTube / RESI analytics importers
  - downstream reporting / summary-email automation
