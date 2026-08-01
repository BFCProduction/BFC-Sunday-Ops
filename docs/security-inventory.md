# Sunday Ops Security Inventory

**Status:** Read-only inventory complete; SEC-01 containment verified in production

**Reviewed:** July 31, 2026

**Scope:** Supabase database and storage policies, browser data paths, Edge Function caller validation, RPC access, and financial-data handling

**Handling note:** This repository is public. Land this report with the first critical containment release rather than publishing a consolidated issue list before the corresponding fix is deployed.

---

## Outcome

Sunday Ops has a real application login, but most browser database requests are not authorized by that login. Planning Center authentication creates a custom token in `user_sessions`; the Supabase browser client continues to use the public anon key. Row Level Security therefore cannot distinguish a signed-in crew member from any other holder of the public client configuration.

The interface hides administrative and financial controls appropriately, but many underlying reads and writes remain available to the anon database role. UI visibility is not a security boundary.

The highest-priority findings are:

1. At audit time, `push-monday-issue` could use the Monday.com credential without validating the Sunday Ops session. The protected replacement now rejects missing sessions and has passed an authenticated production sync/retry test.
2. Raw hourly rates, paid/volunteer flags, and supply prices are readable through the public database client. The browser also has enough data to reproduce crew-pay calculations.
3. Workbook, production configuration, template, issue, document, and other administrative writes rely largely on `isAdmin` checks in React while their database policies allow anon writes.
4. Evaluation responses and the analytics view are publicly queryable even though the interface presents them as admin-only.
5. Public RPCs can publish workbook schedules or reorder Input List configuration without validating a Sunday Ops user or permission.

This inventory made no production writes, uploads, deletes, or permission changes.

---

## Identity boundary

```text
Planning Center OAuth
        |
        v
pco-auth Edge Function
        |
        +--> users + user_sessions (custom opaque token)
        |
        v
Browser localStorage / x-session-token
        |
        +--> protected Edge Functions can validate this token
        |
        +--> direct Supabase table/storage requests do not send a
             Supabase-recognized user identity; they run as anon
```

Consequences:

- Replacing `to anon` with `to authenticated` would break the current browser flows; the app does not hold a Supabase Auth session.
- Hiding a screen, tab, field, or button protects the normal interface only. It does not prevent a direct REST, RPC, or Storage request.
- Immediate containment should route the highest-risk operations through Edge Functions that validate the existing custom session.
- The durable destination remains a Supabase-recognized signed application identity, as described in F2 of the product roadmap.

---

## Verification method and limits

The inventory reviewed:

- all migrations through `058_intercom_talk_listen_program_modes`;
- all Edge Functions under `supabase/functions`;
- direct Supabase reads, writes, RPCs, and Storage calls under `src`;
- relevant scripts, workflows, README deployment instructions, and the product roadmap;
- read-only live queries made with the same public anon configuration shipped to the browser.

The live queries confirmed nonzero visible rows for:

- `roles`, including the `hourly_rate` column;
- `workbook_crew`, including `is_paid`;
- `workbook_supplies`, including `unit_price`;
- `evaluations`;
- `analytics_records`;
- `production_docs`;
- both public Storage buckets through list requests.

The same client received errors for `users` and `report_email_recipients`, confirming that the protected controls behave differently.

Limits:

- No write or delete was attempted, so deployed write exposure is derived from versioned grants/policies and caller code rather than a destructive live test.
- Storage bucket creation and policies are dashboard-managed rather than fully versioned. Migration `011` drops a globally named delete policy, while migration `034` only documents Storage policies in comments. The exact deployed delete policy set cannot be reconstructed from the repository alone.
- This is an authorization inventory, not a penetration test, dependency audit, or secret-rotation exercise.

---

## Prioritized findings

### SEC-01 — Monday.com credential use lacks application authorization

**Severity:** Critical

At audit time, `push-monday-issue` accepted caller-provided issue content, created a Monday.com item with `MONDAY_API_TOKEN`, and then updated the caller-provided issue ID with the service role. It did not require `x-session-token`, validate an active Sunday Ops session, fetch the canonical issue from the database, or limit requests to POST.

CORS does not authorize non-browser callers. The public Supabase anon key used as the function bearer token is intentionally shipped in the frontend.

**Containment:** Require an unexpired Sunday Ops session, allow only POST, accept only an issue ID, fetch the issue and photos server-side, and make retry behavior idempotent before enabling automatic mirroring for every issue.

**Deployment status:** Migrations `059_monday_issue_sync`, `060_monday_sync_legacy_insert_compat`, and `061_issue_photos_permissions`, the protected Edge Function, and the automatic-mirroring frontend are deployed. Migration `060` preserves the browser's explicit `pushed_to_monday: false` insert while keeping authoritative sync status, Monday item ID, attempts, errors, and timestamps unavailable to browser roles. Migration `061` restores the intended browser photo operations and grants the Edge Function's service role access to photo paths. The function requires an unexpired session, accepts only an issue ID, and returned `401` during a production probe without `x-session-token`. Creation combines Monday.com's native idempotency key with the configured `Sunday Ops Issue ID` text column so a lost create response can be reconciled without another item. An authenticated production failure/retry test reconciled the same Sunday Ops issue to exactly one Monday item and one update.

### SEC-02 — Financial inputs are publicly retrievable

**Severity:** Critical

`roles.hourly_rate`, `workbook_crew.is_paid`, and `workbook_supplies.unit_price` are covered by `public_all` policies and anon CRUD grants. `Workbooks.tsx` loads roles, crew, and supplies directly, and crew pay is calculated in the browser. An admin-only display and the protected `workbook-pay` function do not protect the raw inputs.

**Containment:** Split operational role/crew data from financial fields. Revoke anon access to raw rates and paid-status data; return pay only from a session-validated server boundary. Decide whether supply prices require Financial Access before locking that field down.

### SEC-03 — Administrative writes are primarily UI-gated

**Severity:** High

Anon CRUD policies cover workbook scheduling, crew, supplies, intercom, Input Lists, production configuration, event templates, application configuration, checklist configuration, issue management, and production documents. The React interface usually hides these controls from non-admins, but direct requests bypass that check.

**Containment:** Move the highest-impact admin mutations behind verified functions in small domain releases. Start with configuration, workbook publishing, destructive issue/document operations, and rate management. Preserve realtime and operational capture while each domain is migrated.

### SEC-04 — Restricted analytics and evaluation data are publicly readable

**Severity:** High

`analytics_records` grants SELECT to anon, and `evaluations` has `public_all`. The current screens restrict analytics and aggregate evaluation responses through `isAdmin`, but a direct query can retrieve the data.

**Containment:** Route these reads through a verified server boundary during the transition, then enforce `View analytics` and the agreed evaluation-review permission through signed identity and RLS.

### SEC-05 — Public RPCs perform privileged state changes

**Severity:** High

`publish_workbook_schedule` is executable by anon/authenticated and accepts arbitrary workbook, publisher, and snapshot values. The three Input List reorder functions are also public and update every supplied ID without a caller or ownership check.

**Containment:** Revoke anon execution and expose permission-checked equivalents. Validate that all supplied records belong to the intended workbook or configuration scope.

### SEC-06 — Operational data and personnel schedules are internet-queryable

**Severity:** High

The app login hides the application shell, but direct anon queries can retrieve events, workbooks, crew names and call times, issues, documents, checklists, service data, and related operational configuration. This is intended signed-in crew information, not an intentional public website dataset.

**Containment:** Treat current broad access as a transitional compatibility path, not approved public access. Prioritize personally identifying and schedule data after the financial and administrative boundaries, then move routine crew reads to signed identity.

### SEC-07 — Public Storage setup is not reproducible or fully classifiable

**Severity:** High for writes; Medium for intended crew reads

The `issue-photos` and `production-docs` buckets are public so the browser can render files. Setup instructions include public upload/read/delete examples, but the later hardening migration drops a delete policy by a global policy name. Bucket configuration and effective policies are not represented by an authoritative migration.

**Containment:** Export the deployed Storage policy state read-only, replace dashboard-only setup with versioned bucket-scoped policies, route destructive operations through a verified function, and decide whether signed URLs are required for document/photo reads.

### SEC-08 — Service-role Edge Function authorization is inconsistent by function

**Severity:** Medium

`event-admin`, `summary-email-admin`, `user-admin`, `workbook-pay`, and `pco-workbook-crew` correctly validate an unexpired session and require an admin. PCO plan readers and `pco-sync` validate an unexpired session but do not require admin. The latter is reasonable for plan reads; `pco-sync` performs service-role writes and should be explicitly assigned to a permission. Similar session-verification code is duplicated across functions, increasing drift risk.

**Containment:** Create one shared verification pattern, document the permission required by every function, and decide whether PCO synchronization is a normal signed-in action or a management action.

### SEC-09 — Legacy shared-password function remains present

**Severity:** Low

`admin-session` compares a shared password and returns only `{ ok: true }`. No current source caller was found, and it does not create a durable authorized session.

**Containment:** Confirm it is undeployed or unused, then remove the function and its secret from the deployment inventory.

---

## Database and Storage classification

The classification describes the intended product operation, not the current technical role name. “Authenticated operation” means the feature belongs to a signed-in Sunday Ops user but is temporarily carried over the anon database channel.

| Domain / objects | Current anon capability | Classification | Required direction |
|---|---|---|---|
| `users`, `user_sessions` | Denied; service role only | Correctly protected | Preserve; replace opaque session with signed identity later |
| `report_email_settings`, `report_email_recipients`, `report_email_runs` | Explicitly denied | Correctly protected | Preserve protected function access |
| `service_types` | Read | Authenticated operation | Allow crew read through signed identity |
| `events` | Read, insert, update; delete revoked | Read is authenticated operation; writes are security gaps | Permission-check event management; keep protected delete |
| `sundays`, `special_events` and legacy bridges | Broad CRUD | Transitional compatibility / security gap | Reconcile in F1, then make read-only or retire |
| `checklist_items`, `event_checklist_items` | Broad CRUD | Crew read; configuration writes are security gaps | Separate checklist execution from template/config management |
| `checklist_completions`, `event_checklist_completions` | Broad CRUD | Authenticated operation | Preserve fast/realtime crew updates under signed identity |
| `issues`, `issue_photos` | Broad CRUD | Capture/update is authenticated operation; management/delete is a security gap | Add issue permissions and protected destructive actions |
| `evaluations` | Broad CRUD | Submission is authenticated operation; read/manage is a security gap | Separate submit from restricted response review |
| `service_records` | Read, insert, update | Authenticated operation with integration writers | Permission-check browser writes; preserve server imports |
| `attendance`, `loudness`, `service_runtimes`, `weather`, `stream_analytics`, `resi_events` | Broad CRUD | Transitional compatibility / security gap | Reconcile writers in F1, then restrict or retire |
| `runtime_fields`, `runtime_values`, `weather_config` | Broad CRUD | Operational values are authenticated; configuration writes are security gaps | Split capture from configuration management |
| `analytics_records` | Read | Security gap | Require View Analytics |
| `import_runs` | Read | Security gap; no active browser need found | Revoke anon read unless an approved status surface needs it |
| `production_docs` | Broad CRUD | Crew read; upload/delete is a security gap | Protect mutations; decide public URL versus signed URL |
| `event_templates`, `event_template_items` | Broad CRUD | Read may support creation; writes are security gaps | Protect template management |
| `app_config` | Broad CRUD | Limited read is authenticated; writes are security gaps | Expose safe config read; protect management and secrets |
| `locations`, `departments`, `schedule_item_types` | Broad CRUD | Crew read; writes are security gaps | Safe read model plus protected configuration writes |
| `roles` | Broad CRUD including rate | Critical financial security gap | Public-safe role view without rates; protected financial API |
| `workbooks`, schedule items/assignments/versions, PCO time metadata | Broad CRUD | Crew read; management/publish writes are security gaps | View/Manage Workbooks split with protected publish |
| `workbook_crew` | Broad CRUD including names, schedules, paid flag | Authenticated personnel read plus financial/admin gaps | Safe roster read; protect management and pay fields |
| `workbook_supplies` | Broad CRUD including prices | Crew read and admin-write gap; financial classification open | Protect writes; decide Financial Access treatment for prices |
| Intercom tables | Broad CRUD | Crew read; configuration/assignment writes are security gaps | Preserve read-only crew grid; protect management |
| Input List tables | Broad CRUD | Crew read/entry needs product decision; config writes are security gaps | Separate room config, workbook entry, and management permissions |
| `publish_workbook_schedule` and reorder RPCs | Execute | Security gap | Revoke and replace with permission-checked functions |
| `issue-photos` Storage | Public list/read/upload; delete state not proven live | Authenticated operation plus write gap | Version policies; protect mutations; assess signed URLs |
| `production-docs` Storage | Public list/read/upload; delete state not proven live | Authenticated operation plus write gap | Version policies; protect mutations; assess signed URLs |

No database or Storage dataset reviewed here qualifies as an intentional internet-public dataset. Public access currently exists to support the browser client, not because the product identifies anonymous visitors as an audience.

---

## Edge Function caller matrix

| Function | Audit-time caller validation | Current authority | Classification / action |
|---|---|---|---|
| `pco-auth` | OAuth authorization code; public entry by design | Service role + PCO client secret | Keep public; add abuse controls if needed |
| `pco-plans` | Unexpired Sunday Ops session | User's PCO token | Authenticated operation |
| `pco-plan-times` | Unexpired Sunday Ops session | User's PCO token | Authenticated operation |
| `pco-plan-items` | Unexpired Sunday Ops session | User's PCO token | Authenticated operation |
| `pco-sync` | Unexpired Sunday Ops session | User's PCO token + service-role event updates | Assign an explicit permission |
| `pco-workbook-crew` | Unexpired admin session | PCO token + service-role workbook writes | Correctly protected |
| `event-admin` | Unexpired admin session | Service-role event/storage deletes | Correctly protected |
| `user-admin` | Unexpired admin session | Service-role user reads/updates | Correctly protected |
| `summary-email-admin` | Unexpired admin session | Service-role email configuration | Correctly protected |
| `workbook-pay` | Unexpired admin session | Service-role financial reads | Correct boundary, but browser still reads raw inputs |
| `push-monday-issue` | Unexpired Sunday Ops session | Monday credential + service-role issue update | Protected replacement deployed and authenticated sync/retry verified |
| `admin-session` | Shared password; no durable session | Boolean password check | Retire after deployment check |

---

## Staged containment order

### Release A — External credential containment

1. Protect `push-monday-issue` with the existing custom session. **Deployed and verified.**
2. Fetch canonical issue/photo data server-side instead of trusting caller fields. **Deployed and verified.**
3. Add method enforcement, sync state, retry safety, and idempotency. **Deployed and verified.**
4. Confirm and retire `admin-session` if unused.

This release is the prerequisite for I1 automatic Monday.com mirroring.

### Release B — Financial boundary

1. Split `loadRoles()` into a public-safe operational shape and a protected financial shape.
2. Stop direct browser access to `roles.hourly_rate` and pay-relevant crew fields.
3. Wire pay displays and exports to `workbook-pay` or its permission-aware successor.
4. Move rate edits behind a verified admin/Financial Access function.
5. Decide whether supply prices are financial or broadly operational.

### Release C — High-impact administrative writes

Protect one domain at a time, with rollback migrations and page-level smoke tests:

1. production configuration and workbook publish;
2. workbook crew/supplies/intercom/Input List management;
3. checklist and event-template management;
4. issue and document destructive operations;
5. event insert/update and application configuration.

### Release D — Restricted reads

1. Protect evaluation response review.
2. Protect analytics and prepare the Analytics Viewer boundary.
3. Protect personnel schedules and operational documents.
4. Remove unnecessary `import_runs` exposure.

### Release E — Signed identity and granular RLS

Prototype and adopt a Supabase-recognized identity for PCO-linked and invited email users. Replace transitional Edge Function checks and anon compatibility with granular permissions and RLS where it produces a simpler, auditable boundary.

---

## Release guardrails

Every containment release should include:

- a policy/grant snapshot before and after;
- an explicit list of affected browser, Edge Function, script, workflow, and realtime callers;
- Crew/Operator and Administrator test accounts, expanding to Manager, Analytics Viewer, and Financial Access combinations as those roles are introduced;
- positive tests for permitted reads/writes and negative direct-API tests for denied operations;
- rollback SQL and function deployment steps;
- checks for session expiry, required re-login, and shared-device account switching;
- post-deploy smoke tests on the live app without using production records for destructive validation.

Do not revoke broad policies across all domains in one release. The current client depends on them, and a single global tightening would break service-day workflows, scripts, realtime updates, or all four.

---

## Immediate next release

Migrations `059`, `060`, and `061`, the protected `push-monday-issue` function, the Monday `Sunday Ops Issue ID` column/secret, and the automatic-mirroring frontend are deployed. The unauthorized probe returned `401` without a record mutation, and the authenticated production sync/retry test reconciled to exactly one Monday item. SEC-02's financial-data boundary is the next containment implementation.
