# Operational Script Inventory

This inventory separates scripts that are part of the trusted operating model
from historical one-shot imports and retired experiments. The goal is that an
operator or maintainer can tell whether a script is safe to run, what data it
writes, and what should be modernized next.

## Production Automation

| Script | Trigger | Writes | Trust status | Next action |
| --- | --- | --- | --- | --- |
| `scripts/fetch-weather.js` | `.github/workflows/weather-import.yml` every 5 minutes on Sunday, or manual `--now` | Event-scoped `weather`, event-linked `service_records`, `import_runs` | Active, event-native | Monitor first scheduled run after migration `041` |
| `scripts/fetch-resi.js` | `.github/workflows/sunday-analytics.yml`, manual date/dry-run flags | `resi_events`, `stream_analytics`, event-linked `service_records`, `import_runs`, CSV/screenshot artifacts | Active, event-aware with manual CSV fallback | Watch for RESI UI selector breakage |
| `scripts/fetch-youtube.js` | Manual Sunday relay | Event-linked `service_records.youtube_unique_viewers` | Active, event-native, not yet live-verified | Run during a live Sunday stream and confirm YouTube stream detection |
| `scripts/sync-production-docs.js` | `.github/workflows/docs-sync.yml`, manual | `production_docs`, Supabase Storage | Active | Confirm event matching when unusual service filenames appear |
| `scripts/propresenter-relay.js` | Local operator Mac / LaunchAgent | `runtime_values`, then `service_records` via app/runtime sync path | Active local automation | Keep field config reviewed before special services |

## Manual Fallbacks And Recovery

| Script | Use when | Writes | Trust status | Next action |
| --- | --- | --- | --- | --- |
| `scripts/import-resi-csv.js` | RESI browser automation fails but CSV is available | Same Supabase analytics path as `fetch-resi.js`, plus `import_runs` | Supported fallback | Keep parser shared with RESI automation |
| `scripts/review-session-assignments.js` | Sunday-level issues/evaluations need review before event assignment or cleanup | Export mode writes local CSV/JSON only; apply mode sets reviewed `event_id` values; delete mode removes reviewed unassigned rows | Supported admin review tool | Use CSV review artifact before any historical issue/evaluation assignment or deletion |
| `scripts/youtube-auth.js` | YouTube refresh token needs to be generated | No app data writes | Supported setup tool | Use only during credential rotation |
| `scripts/backfill-weather.js` | Event weather rows are missing for past events | Event-scoped `weather` | Supported recovery, event-native | Run only after confirming event weather config exists |
| `scripts/sync-weather-to-service-records.js` | Event `weather` rows exist but analytics rows lack weather | Event-linked `service_records` | Supported recovery, event-native | Prefer scheduled importer for new data |
| `scripts/backfill-service-records-weather.js` | `service_records` needs historical weather directly from Open-Meteo | Event-linked `service_records` | Supported recovery, event-native | Use after reviewing target row count |
| `scripts/run-propresenter-relay.sh` | LaunchAgent wrapper for relay | Delegates to relay | Supported local helper | No data logic |
| `scripts/install-relay-launch-agent.sh` | Install local relay autostart | macOS LaunchAgent only | Supported local helper | No data logic |

## Historical One-Shot Imports

These scripts describe how historical data was loaded. They should not be used
as routine operations without reviewing their assumptions first.

| Script | Original purpose | Current risk | Next action |
| --- | --- | --- | --- |
| `scripts/import-service-records.js` | Import Stream Analytics Master sheet into `service_records` | Sunday/date/service-type shaped; can overwrite broad history if misused | Guarded: writes require `--write --confirm-historical-import` |
| `scripts/migrate-existing-ops-data.js` | Merge legacy Sunday Ops attendance/loudness/weather/RESI into `service_records` | Sunday-shaped and superseded by migration `039` for high-trust paths | Guarded: writes require `--write --confirm-historical-import` |
| `scripts/import-loudness-history.js` | Load historical loudness Google Sheet | Writes old Sunday-shaped loudness rows | Guarded: writes require `--write --confirm-historical-import`; rewrite before future import |
| `scripts/extract-checklist-runtimes.js` | Extract runtimes from archived Gameday PDFs | Local path, Sunday-shaped service matching | Guarded: writes require `--write --confirm-historical-import`; keep as reference |
| `scripts/import-youtube-history.js` | Import past YouTube viewers from spreadsheet CSVs | Historical source, but now resolves `event_id` and skips missing/ambiguous events | Preview by default; writes require `--write --confirm-historical-import` |
| `scripts/backfill-resi-to-service-records.js` | Copy old `resi_events` into `service_records` | Uses service type/date mapping; safer than raw import but not fully event-native | Preview by default; writes require `--write --confirm-historical-import`; replace with shared RESI event resolver if needed again |

## Retired

| Script | Reason | Current guard |
| --- | --- | --- |
| `scripts/send-sunday-summary.js` | Summary email is retired; manual report export is the supported workflow | Workflow is disabled; UI no longer exposes email settings; script exits unless `--allow-retired-summary-email` is passed |

## Burn-Down Order

1. Live-verify `fetch-youtube.js` against an actual Sunday stream.
2. Use `review-session-assignments.js` to classify Sunday-level issue and
   evaluation history before applying any `event_id` assignments.
3. Replace `backfill-resi-to-service-records.js` with the shared RESI event
   resolver if old `resi_events` ever need another repair pass.
4. Move archived one-shot importers out of `scripts/` if the repo gains a
   dedicated archive folder.
