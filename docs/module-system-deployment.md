# Event and Workbook Module System — Production Record

**Delivered:** August 4, 2026

**Production commit:** `b2cbe57`

**Database migrations:** `063`–`067`

**Frontend:** [Sunday Ops](https://bfcproduction.github.io/BFC-Sunday-Ops/)

**Pages deployment:** [GitHub Actions run 30966617876](https://github.com/bfcproduction/BFC-Sunday-Ops/actions/runs/30966617876)

This is the durable implementation, migration, and verification record for the
three-phase module-system rollout. Product behavior and future rules live in
[`module-architecture.md`](module-architecture.md); this document records what
actually shipped to production.

## Delivered product model

A module is a live operational document owned by exactly one Event or one
Workbook. Event modules describe one service. Workbook modules describe shared
needs for the whole production. A Workbook discovers the modules belonging to
its attached Events at read time; it does not copy or inherit their content.
Workbook modules do not appear inside Events.

The live catalog contains:

- Input List
- Production Documents
- Crew
- Supplies
- Intercom

Desktop workspaces use owner and module tabs. Mobile uses owner and module
accordions so only one document is expanded at a time. The Workbook now has
three top-level destinations—Schedule, Events, and Modules—instead of separate
Crew, Intercom, Input List, Supplies, and Send Update tabs.

Modules are live through the event. The old publication/Send Update flow was
retired. Historical schedule snapshots were retained as protected service data;
they were not deleted.

## Access model

| Capability | User | Manager | Admin |
|---|---:|---:|---:|
| View and edit live module content | Yes | Yes | Yes |
| Add, rename, reorder, archive, and restore modules | No | Yes | Yes |
| Apply current folder defaults to an existing Event | No | Yes | Yes |
| Configure default modules by PCO grouping | No | No | Yes |
| Sync an Event Crew module from PCO | No | No | Yes |
| View or change rates, paid status, prices, and totals | No | No | Yes |
| Permanently delete populated content | No | No | Yes—recovery only |

Normal removal is archival, which preserves content and prevents defaults from
silently recreating a module someone intentionally removed. These permissions
are enforced by verified Edge Functions, not only by hidden controls.

## Planning Center defaults

Defaults use stable PCO identifiers. In this Planning Center account, top-level
Service Type IDs are stored as deterministic `service-type:<id>` fallback keys
because the principal groupings are exposed as Service Types rather than Folder
API resources.

The deployed starter defaults are:

| PCO grouping | New Event modules |
|---|---|
| 9:00 Service | Input List, Production Documents, Crew, Intercom |
| 11:00 Service | Input List, Production Documents, Crew, Intercom |
| Special Events | Production Documents, Crew |

The migration used conflict-safe inserts and did not overwrite choices already
saved in Settings. Existing Events are unchanged until a Manager applies the
current defaults.

## Phase 1 — Foundation and financial boundary

**Commits:** `b70d329`, `6ed821e`, `2d7d973`

**Migrations:**

- `063_user_access_levels`
- `064_module_foundation`
- `065_financial_data_boundary`

Delivered:

- Added server-authoritative `user`, `manager`, and `admin` access levels while
  retaining `users.is_admin` as a synchronized compatibility field.
- Added the module catalog, Event/Workbook ownership invariant, active/archived
  lifecycle, ordering, optional location binding, audit metadata, PCO grouping
  records, and folder defaults.
- Added the shared `app-auth` verifier and protected module-administration and
  financial APIs.
- Moved role rates, crew paid status, and supply prices into service-role-only
  tables. Public compatibility fields are constrained to safe zero/false values.
- Updated People & Access and Settings so Admins assign access levels and PCO
  defaults while Managers can manage module lifecycle.
- Removed the unused shared-password `admin-session` function from source and
  the linked production project.
- Added the repository-wide `npm run verify` quality gate: frontend lint,
  function lint/check, Deno tests, production build, and production dependency
  audit.

## Phase 2 — Input List and Production Documents

**Commits:** `d7f12c8`, `497b130`

**Migration:** `066_phase_2_module_content`

**Functions:** `module-admin`, `module-content`

Delivered:

- Added Event and Workbook module workspaces and Workbook aggregation of
  attached Event modules.
- Moved Input List values from Workbook-only ownership to canonical Event or
  Workbook modules.
- Linked Production Documents to canonical module instances without copying
  Event documents into a Workbook.
- Updated Drive synchronization to write through module ownership.
- Revoked anonymous access to Production Documents, module Input List values,
  legacy Workbook values, and location-link mutations.
- Routed cell values and location-specific links through the verified module
  content API.
- Preserved the spreadsheet-style Input List workflow: Enter moves down, Tab
  moves right, `=` creates a location-specific link, drag fill increments
  numbered values and linked references, selected ranges copy/paste/delete
  together, and the dense grid uses per-column minimum/maximum widths instead
  of stretching indefinitely with the browser window.

Production reconciliation assigned all 143 existing Production Documents to 45
Event modules and moved all 356 existing Workbook Input List cells into one
Workbook module. Authenticated Event and Workbook reads succeeded; direct
anonymous reads and function requests without a Sunday Ops session were denied.

## Phase 3 — Crew, Supplies, and Intercom

**Commit:** `b2cbe57`

**Migration:** `067_phase_3_operational_modules`

**Functions:** updated `module-content` and `pco-workbook-crew`

Delivered:

- Made `module_instance_id` the canonical owner of Crew, Supplies, Intercom
  channels, pack assignments, and per-channel states.
- Preserved Event meaning for Event Crew/Intercom records and Workbook meaning
  for whole-production Crew and existing Supplies.
- Reused the same Crew, Supplies, and Intercom components at either ownership
  scope instead of forking separate Event implementations.
- Made operational module content editable for every signed-in user while
  keeping paid status, role rates, supply prices, totals, and financial exports
  Admin-only.
- Kept PCO crew synchronization Admin-only and redirected it to active Event
  Crew modules.
- Removed the standalone Crew, Intercom, Supplies, and Send Update Workbook tabs.
- Updated the Workbook print packet to aggregate the selected Workbook and Event
  module content while continuing to reject financial pages for non-Admins.
- Revoked browser access to all Crew, Supplies, Intercom, and schedule-version
  tables and revoked public execution of `publish_workbook_schedule`.

The forward-only migration preserved the original production row counts:

| Content | Rows after migration |
|---|---:|
| Crew | 26 |
| Supplies | 4 |
| Intercom channels | 36 |
| Intercom assignments | 109 |
| Intercom channel states | 42 |

There were zero content rows without a canonical module owner. Production had 6
active Crew modules, 2 active Supplies modules, and 6 active Intercom modules;
content existed in 5 Crew, 2 Supplies, and 6 Intercom modules. The one empty
active Crew module is valid configuration, not lost data.

## Production verification

The completed release passed all of the following on August 4, 2026:

- `npm run verify`: ESLint, Deno lint/check for every function, 8 Deno tests,
  Vite production build, and `npm audit --omit=dev` with 0 vulnerabilities.
- Migration dry-run followed by a transactional production apply.
- Exact pre/post row-count reconciliation and zero null module owners.
- Direct anonymous reads of every migrated content table and historical schedule
  versions returned `401`.
- A `module-content` request without a Sunday Ops session returned `401`.
- Public execution of the retired publish RPC returned `401`.
- Authenticated Admin reads returned complete module data.
- Authenticated non-Admin reads returned operational data but omitted role rates,
  crew paid status, supply prices, and financial totals.
- Authenticated live-app smoke tests passed at desktop and mobile sizes.
- The Ministry Forum workbook showed its shared Input List and Supplies modules;
  attached Events showed their Crew and Intercom modules; existing operational
  values, ordering, pack/channel states, and protected financial data remained
  intact.
- Opening Crew triggered the existing PCO synchronization path; a second count
  reconciliation confirmed that it did not duplicate or drop production rows.
- GitHub Pages deployment run 30966617876 completed successfully and the live
  app loaded the deployed module workspace.

## Compatibility retained intentionally

- Crew, Supplies, and Intercom keep their older `workbook_id` / `event_id`
  fields for current integrations, but `module_instance_id` is canonical.
- `users.is_admin` remains synchronized for older callers; new authorization
  uses `access_level`.
- Historical schedule-version data remains service-role-only for audit/recovery.
- Legacy Input List and publication objects remain only where a forward-only
  migration or older integration still needs their shape; their browser access
  is revoked.

## Remaining work

This release completes the ownership model and the five initial module types. It
does not complete the broader security and product roadmap. The next containment
work should protect account-level Production Config and Input List structure
reordering, followed by checklist/template administration, issue/document
destructive operations outside the module boundary, event/configuration writes,
restricted analytics/evaluation reads, and eventually signed application
identity with granular RLS. Payroll review/finalize/lock also remains separate
future work.
