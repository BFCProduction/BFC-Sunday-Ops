# Sunday Ops Product and Platform Roadmap

**Status:** Active product direction

**Last updated:** August 4, 2026

**Audience:** Product owner, maintainers, and future Codex sessions

**Purpose:** Preserve the reasoning, decisions, dependencies, and acceptance criteria needed to grow Sunday Ops into the primary operating workspace for the production team.

---

## How to use this document

Before beginning a roadmap item:

1. Read the **Product direction**, **Confirmed decisions**, and the relevant workstream.
2. Check its dependencies and open questions.
3. Inspect the listed code and data entry points; they are pointers, not a complete impact list.
4. Separate discovery from implementation. Do not fill an open product decision with a developer assumption.
5. Make the smallest end-to-end change that can be tested safely.
6. Update the workstream status, decisions, and validation notes in this document after the change ships.

Status labels used below:

- **Ready:** sufficiently defined for a future session to plan or implement.
- **Discovery:** the problem is known, but the solution must be designed with the product owner.
- **Foundation:** enabling work that protects several later features.
- **Later:** intentionally deferred; do not pull forward without a new decision.
- **Complete:** delivered and verified in the live product.

---

## Product direction

Sunday Ops has reached a version-two moment. It began as a useful set of Sunday-morning tools and has grown into a small operations platform containing event execution, production documents, issue capture, service data, evaluations, analytics, Planning Center integrations, operational imports, and multi-event workbooks.

The project does not need a rewrite. It needs a clearer center, explicit ownership of information, stronger permissions, repeatable delivery, and deliberate separation between workflows that have different purposes.

### North star

For the production crew:

> Sunday Ops is the live workspace for understanding the event, accessing the information needed to do the work, recording what happened, and identifying what needs attention.

For managers:

> Sunday Ops is the place to coordinate events and workbooks, manage operational follow-up, and understand readiness and outcomes.

For analysts and leadership:

> Sunday Ops is a trustworthy, limited-access source of production and service insight.

Planning Center may remain a source of plan, schedule, and crew information behind the scenes. Replacing Planning Center as the crew's daily interface does not require immediately replacing it as a planning database.

Monday.com is different: it is a temporary bridge for issue follow-up. The long-term goal is for Sunday Ops to manage its own issues well enough that the Monday.com dependency can be retired.

---

## Confirmed product decisions

These are requirements unless the product owner explicitly revisits them.

### Run of Show

- The Run of Show must be more prominent on Event Overview.
- It must not be trapped inside its own fixed-height scrolling box.
- It needs additional usefulness and stronger visual presence.
- Its new layout and feature set are **not decided**.
- Do not assume a Now/Next header, live-follow mode, or any other replacement pattern is better.
- A future design session must study the product owner's printed Run of Show example and the crew's real workflow before implementation.

### Event Overview

- Event Overview is the crew's primary event workspace.
- The current Quick Actions section should be removed because it duplicates sidebar navigation and has not earned its space.
- Any replacement content must provide event awareness rather than recreate redundant navigation.

### Production Docs

- Stage Plot, Input List, Run Sheet, and other active documents should display directly in the page.
- Remove the per-document dropdown/accordion experience.
- Preserve zooming and drawing behavior.
- The document should feel embedded in Sunday Ops rather than like a separate viewer framed by unnecessary interface chrome.
- A fully custom PDF experience is optional later work, not a prerequisite for the first improvement.

### Issues

- Every issue should be sent to Monday.com during the transition; there should be no operator checkbox and no severity exclusion.
- Sunday Ops should be the primary record. Monday.com should receive a mirror for follow-up.
- Sunday Ops needs a global place to collect and manage issues from every event.
- The long-term destination is native issue management in Sunday Ops and eventual removal of the Monday.com dependency.

### Evaluation

- Evaluation is useful but has not become a consistent team practice.
- A full app experience with push notifications may materially improve participation.
- Native app and push-notification work is intentionally later in the roadmap.
- Do not make the current roadmap depend on an offline mode; Sunday Ops is intended to remain online.

### Events and Workbooks

- Events and Workbooks share one module model. A module belongs to exactly one Event or one Workbook; Workbooks discover attached Event modules without copying them.
- Event modules describe one service. Workbook modules describe shared production needs. Workbook modules do not appear inside Events, and Events do not inherit Workbook modules.
- Desktop uses owner/module tabs and mobile uses accordions so a Workbook can aggregate several Event modules without showing all documents at once.
- Input List, Production Documents, Crew, Supplies, and Intercom are live at either scope. Location-specific Input List structure and links remain reusable configuration.
- Publication is retired. Modules remain live through the event; historical schedule snapshots are retained only as protected service data.

### People and permissions

- User, Manager, and Admin access levels are live. Users edit module content; Managers organize Events/Workbooks and module lifecycle; Admins control access, folder defaults, PCO sync, financial data, and destructive settings.
- Analytics Viewer and independent Financial Access remain future roles/capabilities. In the current deployed model, financial access is Admin-only.
- Sunday Ops must support invited users who are not in Planning Center, beginning with analytics-only access.
- Permissions must be enforced by the backend, not only by hiding buttons or pages.

### Product and technical guardrails

- Do not rewrite the application from scratch.
- Do not split the project into microservices or multiple repositories merely to make it look more architectural.
- Do not delete legacy data until a live-data reconciliation proves it is safe.
- Do not build a local/offline version as part of service-day resilience.
- Do not let foundation work indefinitely block small, safe improvements to the crew experience.
- Do not treat Planning Center, Monday.com, or the current page structure as permanent simply because they exist today.

---

## Current product and technical baseline

This is a concise orientation, not a substitute for inspecting the current code.

### Product surface

- Home: global tools, event focus, event timeline, updates, and event creation.
- Event Overview: checklist progress, event schedule, PCO Run of Show, and high-priority issue alert.
- Event Modules: Input List, Production Documents, Crew, Supplies, and Intercom owned by the selected Event.
- Checklist: event-native operational checklist with realtime completion; currently a successful feature.
- Issue Log: event-scoped issues, photos, severity, resolution, and automatic Monday.com mirroring when enabled.
- Event Data: attendance, runtime, loudness, weather, and history.
- Evaluation: anonymous event submissions and admin-only response review.
- Workbooks: Schedule, Events, aggregated Event/Workbook Modules, and unified print packets.
- Analytics: admin-only dashboard and data explorer.
- Settings: app, reporting, workbook configuration, and People & Access.

### Technology and delivery

- React 19, TypeScript, Vite, Tailwind CSS, and Supabase.
- GitHub Pages hosts the frontend.
- Planning Center OAuth is the current sign-in path.
- Supabase holds application data, storage, realtime subscriptions, migrations, and Edge Functions.
- GitHub Actions runs frontend deployment and several operational import workflows.
- Operational scripts import or relay weather, RESI, YouTube, ProPresenter, documents, and historical data.
- `npm run verify` runs frontend lint, Deno function lint/check, focused Deno tests, the production build, and a production dependency audit. Broader browser-level regression coverage remains future work.

### Structural pressure already visible

- User/Manager/Admin is server-authoritative; `is_admin` remains only as a synchronized compatibility field. Analytics Viewer, independent Financial Access, and invited non-PCO identity remain future work.
- The browser still performs many Supabase reads and writes directly outside the completed module, financial, event-delete, user-admin, and Monday.com boundaries.
- Several database policies grant broad anonymous access, so some restrictions shown in the interface are not true security boundaries.
- The custom Planning Center session is stored by the browser but is not the same identity understood by Supabase Row Level Security.
- Workbooks and some other screens coordinate many responsibilities from large files.
- Event-native migrations are substantial, but legacy compatibility bridges remain in active code and scripts.
- Frontend deployment is automated more clearly than database and Edge Function deployment.
- Navigation is primarily in-memory screen state rather than durable routes, limiting deep links and clean browser history.
- The app ships as a large client bundle; feature-level route splitting has not yet been established.

### Important code entry points

| Area | Starting points |
|---|---|
| App shell and screen navigation | `src/App.tsx`, `src/components/layout/Sidebar.tsx`, `src/components/layout/MobileTabs.tsx` |
| Current Event Overview and Run of Show | `src/screens/Dashboard.tsx` |
| Event/Workbook modules | `src/components/modules/ModuleWorkspace.tsx`, `src/screens/EventModules.tsx`, `src/lib/modules.ts`, `supabase/functions/module-admin/index.ts` |
| Production Docs | `src/screens/ProductionDocs.tsx`, `supabase/functions/module-content/index.ts`, `scripts/sync-production-docs.js` |
| Event Issue Log | `src/screens/IssueLog.tsx`, `supabase/functions/push-monday-issue/index.ts`, issue migrations |
| Evaluation | `src/screens/Evaluation.tsx`, evaluation tables in Supabase migrations |
| Workbooks | `src/screens/Workbooks.tsx`, `src/components/workbook/*`, `src/lib/workbooks.ts`, workbook and module migrations |
| Input Lists | `src/components/workbook/InputListTab.tsx`, `src/lib/inputLists.ts`, `src/lib/moduleContent.ts`, migrations `053`, `062`, and `066` |
| Analytics | `src/screens/Analytics/*`, `src/lib/serviceRecords.ts`, analytics/service-record migrations |
| Authentication and users | `src/context/AuthContext.tsx`, `src/lib/pcoAuth.ts`, `supabase/functions/pco-auth/index.ts`, `supabase/functions/user-admin/index.ts`, migration `015_pco_auth.sql` |
| Permissions and financial data | `src/screens/Settings.tsx`, `src/lib/financialAdmin.ts`, `supabase/functions/_shared/app-auth.ts`, `financial-admin`, `workbook-pay`, migrations `063` and `065` |
| Reports and legacy compatibility | `src/lib/reportData.ts`, `src/lib/generateReportHtml.ts`, `scripts/send-sunday-summary.js`, event-native migrations |
| Operational automation | `docs/operational-script-inventory.md`, `.github/workflows/*`, `scripts/*` |

---

## Intended product model

This model gives future features a place to belong without prematurely deciding every screen.

### People

| Preset | Primary job | Default shape |
|---|---|---|
| User *(deployed)* | Work an event | Event workspace, live module content, checklist, issues, evaluation, and appropriate workbook information |
| Manager *(deployed)* | Coordinate operations | User capabilities plus Event/Workbook organization and module lifecycle |
| Analytics Viewer *(future)* | Review outcomes | Analytics only; does not require a Planning Center account |
| Admin *(deployed)* | Configure the system | People, permissions, defaults, PCO sync, financial data, configuration, integrations, and sensitive administration |

Independent `Financial Access` remains the target future capability; financial
data is Admin-only in the current deployed model. Presets should be convenient
starting points, while backend permissions remain the actual authority.

### Operational containers

| Container | Working definition | Status |
|---|---|---|
| Standard Event | A normal standalone service or production with the standard event workspace | Existing; behavior can be refined |
| Workbook Event | An ordinary Event attached to one Workbook; it keeps its Event modules while the Workbook discovers them for aggregation | Deployed; no separate Event type or inheritance layer |
| Workbook | A planning and coordination container for related events, days, people, locations, schedules, shared modules, and aggregate views | Existing; module boundary complete |
| Library/Template | Reusable configuration or starting information that is not owned by one event | Partly existing; formal ownership model needed |

Every new module must explicitly answer:

1. Is its source of truth an event, a workbook, a reusable library, or an external integration?
2. Does it reference reusable configuration, and how do later configuration changes affect existing documents?
3. What happens when an event is attached to or detached from a workbook?
4. Who can view, edit, approve, and export it?
5. Which historical state must be preserved?

---

## Roadmap overview

The roadmap runs in two lanes. They should advance together.

### Lane A: visible product value

1. Production Docs improvement
2. Event Overview cleanup
3. Automatic Monday.com mirroring
4. Global Issues center
5. Run of Show discovery and later redesign
6. Workbook-event experience
7. Analytics completion
8. Evaluation engagement and future app notifications

### Lane B: trust and growth foundation

1. Data Truth Audit
2. Identity and permission architecture
3. Immediate security containment
4. Tests and quality gates
5. Repeatable backend deployment and staging
6. Incremental code ownership and navigation improvements

Lane B should protect Lane A, but it should not be used as a reason to postpone every visible improvement. Production Docs and the removal of redundant Quick Actions are examples of changes that can proceed while deeper foundation work is underway.

---

## Workstream F1 — Data Truth Audit

**Status:** Foundation / Ready

**Why it matters:** Permissions, reports, analytics, and future migrations are unsafe if the application has more than one active answer for the same fact.

The existing migration work is real and substantial. This audit must not begin with the conclusion that it failed. The question is whether reconciliation and compatibility cleanup are complete across live data, current screens, reports, and automation.

### Scope

- Events and their legacy Sunday/special-event bridges
- Checklist items and completions
- Issues and evaluations
- Attendance, runtime, loudness, weather, RESI, and YouTube data
- `service_records` and `analytics_records`
- Production documents
- Workbook-linked events and workbook-owned data
- Reports, exports, and operational scripts that still use legacy fallbacks

### Required deliverable

Produce a table for every domain containing:

- Current canonical table or view
- Legacy table or compatibility path
- All active writers
- All active readers
- Live row counts and mapping coverage
- Orphaned, ambiguous, or duplicated records
- Whether fallback behavior is still required
- Recommended next action: retain, migrate, make read-only, archive, or remove later

### Safety rules

- Begin read-only.
- Do not delete or rewrite production records during discovery.
- Preview every backfill or reconciliation operation.
- Preserve external IDs and historical mappings.
- Spot-check known events with the product owner before declaring a domain reconciled.

### Acceptance criteria

- Every active screen, report, and automation has a documented source of truth.
- Analytics values reconcile with the underlying event records for representative dates.
- No legacy path is removed until its replacement is verified in production-like data.
- The final report explicitly lists remaining intentional compatibility paths.

---

## Workstream F2 — Identity, permissions, and security

**Status:** Foundation in progress; external credentials, financial data, module metadata, and five module-content domains contained

**Why it matters:** Analytics-only accounts, Manager access, financial privacy, global issue management, and trustworthy administration all depend on it.

### Target access model

The deployed baseline is User, Manager, and Admin. User works operational
content, Manager adds Event/Workbook organization and module lifecycle, and
Admin adds access management, PCO defaults/sync, financial data, and destructive
settings. Analytics Viewer, invited non-PCO identity, and independent Financial
Access remain the next expansion of this model.

Candidate permissions to validate during design:

- View event operations
- Update event operations
- View and manage global issues
- View workbooks
- Manage workbooks
- View analytics
- View financial data
- Manage users and permissions
- Manage app configuration and integrations

The final list is a product decision. Do not turn every button into a separate permission.

### Identity direction

The long-term direction is a signed application identity that Supabase and its Row Level Security policies can recognize.

- Invited non-PCO users should be able to sign in by email.
- Existing PCO users should be linked to the same internal user/profile model.
- Planning Center authorization should remain available for PCO data access where required.
- Edge Functions should continue to protect external secrets and high-risk operations.

Because Planning Center is not a standard Supabase sign-in provider, begin with a short technical prototype. Compare:

1. A Supabase-recognized session for both email and linked PCO identities.
2. A transitional model where sensitive actions move behind authenticated Edge Functions while identity migration is underway.

The recommended destination is the first model, with the second used only as a controlled transition where helpful.

### Immediate containment before the full identity migration

- Require authorization for the Monday.com push function.
- Verify every admin Edge Function consistently validates the caller.
- Move raw workbook rates and financial calculations behind server-enforced permissions.
- Inventory public/anonymous database policies and classify each as intentional public read, authenticated operation, or security gap.
- Restrict the highest-risk writes first; do not tighten all policies in one untested release.

### Security inventory validation

- **July 31, 2026 — read-only inventory:** Completed the database, Storage, Edge Function, RPC, browser-caller, and financial-data review in [`security-inventory.md`](security-inventory.md).
- A read-only live check with the shipped public client confirmed nonzero visibility for raw role-rate, workbook paid-status, supply-price, evaluation, analytics, and production-document data. Protected user and report-recipient controls rejected the same client.
- Confirmed that the custom Planning Center session is validated by protected Edge Functions but is not an identity Supabase RLS can recognize for direct browser requests.
- No production records, policies, functions, or Storage objects were changed during the inventory.
- **July 31, 2026 release complete:** migrations `059`, `060`, and `061`, the protected `push-monday-issue` function, the Monday `Sunday Ops Issue ID` column/secret, and the automatic-mirroring frontend are deployed. The authenticated sync/retry smoke test reconciled to exactly one Monday item. Financial containment was the next release and was completed on August 4.
- **August 4, 2026 releases complete:** migrations `063`–`067` deployed User/Manager/Admin authorization, the module foundation, protected financial tables, and verified APIs for Input List, Production Documents, Crew, Supplies, and Intercom. Anonymous table/function probes were denied, Admin and non-Admin response shapes were verified, and the production data reconciliation found zero missing module owners. See [`module-system-deployment.md`](module-system-deployment.md).

### Rollout safety

Potential breakage includes lost save access, required re-login, failed integrations, blocked scripts, or missing realtime updates. Use:

- A staging Supabase project or equivalent isolated environment
- Test accounts for every preset and Financial Access combination
- A page-by-page read/write inventory
- Logging for denied operations
- Small policy releases with rollback scripts
- A temporary compatibility period for existing sessions

### Acceptance criteria

- Backend policy, not UI visibility, decides whether an operation is allowed.
- An Analytics Viewer can sign in without PCO and cannot load other app data.
- A Manager without Financial Access cannot retrieve rates or totals through the API.
- A permitted user retains the expected realtime and operational workflows.
- Admin and integration secrets never reach the browser.

---

## Workstream F3 — Quality gates, staging, and repeatable delivery

**Status:** Foundation / Ready

**Why it matters:** The project can keep moving quickly only if routine changes stop depending on memory and manual production testing.

### First automated journeys

Add tests around the product's most valuable and risky flows:

1. Sign in and restore a valid session.
2. Load and switch the active event.
3. Complete and uncomplete a checklist item.
4. Create an issue and preserve it if Monday.com is unavailable.
5. Open an event production document.
6. Enforce each role/permission boundary.
7. Save representative workbook changes.
8. Verify analytics uses the intended canonical records.

Use unit tests for calculations and data transformations, integration tests for Supabase-facing boundaries, and a small browser test suite for critical user journeys. Tool choice should be made during implementation; do not optimize for test count.

### Delivery recipe

Document and automate, as far as practical:

- Frontend build and deployment
- Migration order and application
- Edge Function deployment
- Required secrets and environment variables by environment
- Storage bucket and policy setup
- Scheduled workflows and service accounts
- Smoke tests after deployment
- Rollback steps

### Acceptance criteria

- A fresh environment can be created from version-controlled instructions.
- Pull requests or release branches run build, scoped lint, and critical tests.
- Database and function changes are deployed as part of a documented release rather than remembered separately.
- Production has a short post-deploy smoke-check list.

---

## Workstream P1 — Production Docs embedded experience

**Status:** Deployed / live crew-device validation pending

**Priority:** First visible product improvement

### Problem

Documents currently live inside expandable `DocCard` viewers. The extra layer makes the documents feel secondary and detached from the page.

### First release

- Keep the current document-type tabs.
- Remove the per-document accordion/dropdown.
- Display the active document directly and by default.
- Give the document the usable page width and height.
- Preserve current zoom and drawing behavior on supported devices.
- Provide a compact selector if a tab contains multiple documents.
- Preserve admin add, replace, delete, Drive-link, and upload workflows.
- Verify desktop and mobile behavior separately.

### Later option

Only consider a custom PDF renderer after the first release is evaluated. Before persistent annotation work, decide:

- Are drawings personal or shared?
- Must they survive closing the page?
- Are they attached to a user, event, document version, or all three?
- What happens when a synced document is replaced?

### Acceptance criteria

- A crew member reaches the active document without expanding another control.
- Switching document type changes the visible document directly.
- Existing zoom/drawing capability does not regress.
- Multiple documents remain understandable without stacking several full viewers.
- Empty states and administrative controls still work.

### Implementation validation

- **July 31, 2026 — local implementation:** Replaced the per-document accordion with one direct viewer for the active document. Tabs still select document type, and types with multiple documents now use a compact selector.
- Preserved the existing desktop PDF viewer, mobile Google Docs Viewer, external-open links, Drive sync indicators, upload/link modal, and delete controls.
- Verified the production build and scoped lint, document switching, empty states, and the admin add flow. Browser checks covered `1280×720`, `390×844`, and `320×568`; no page-level horizontal overflow was present.
- **Deployed July 31, 2026:** Commit `e365203` passed the GitHub Pages workflow. The live site served the new bundle and loaded without browser console errors.
- **Still required before marking Complete:** verify with crew access in the live product, including pinch/zoom and drawing on the supported physical devices.

---

## Workstream P2 — Event Overview cleanup

**Status:** Partly Ready

**Scope now:** Remove what is known to be unnecessary; do not pre-empt the Run of Show discovery.

### Ready change

- Remove Quick Actions from Event Overview.
- Rebalance the vacated space without adding speculative replacement widgets.
- Preserve the high-priority issue alert unless a later Issues design intentionally replaces it.

### Acceptance criteria

- Sidebar and mobile navigation remain sufficient to reach all former Quick Actions destinations.
- Removing the section does not create an unexplained empty region.
- No new dashboard concept is introduced without product approval.

### Implementation validation

- **July 31, 2026 — local implementation:** Removed the Quick Actions section and its now-unused UI imports. The existing progress, schedule, Run of Show, and high-priority issue alert retain their prior order and spacing, with no replacement widget added.
- Confirmed Checklist, Issues, Event Data, and Evaluation remain in desktop and mobile navigation. Event Data continues to follow the existing `includeInAnalytics` visibility rule.
- Scoped lint and the production build pass. Browser checks at `1280×720` and `390×844` confirmed there is no page-level horizontal overflow, no residual Quick Actions heading or container, and working navigation from both layouts.
- **Deployed July 31, 2026:** Commit `e365203` passed the GitHub Pages workflow. The live bundle no longer contains the Quick Actions UI.
- **Still required before marking Complete:** confirm the simplified overview with crew access in the live product.

---

## Workstream P3 — Run of Show discovery and redesign

**Status:** Discovery

**Blocker:** Printed Run of Show example and a dedicated product-design conversation

### Known problem

The current PCO Run of Show is presented inside a `Card` with a `480px` nested scroll region. It reads as a secondary dashboard widget rather than primary crew information.

### Explicit non-decisions

- No Now/Next area is approved.
- No automatic current-row behavior is approved.
- No editing or PCO writeback model is approved.
- No table, card, timeline, or print-replica layout is approved.

### Discovery session agenda

1. Review the printed example and identify why it works.
2. Identify which crew roles use it and on which devices.
3. Separate information needed before the event, during the event, and after it.
4. Identify what PCO already supplies and what Sunday Ops would add.
5. Decide whether Sunday Ops is read-only, an operational annotation layer, or an editor.
6. Sketch at least two alternatives without coding them.
7. Choose acceptance criteria before implementation.

### Minimum acceptance criteria already known

- The full Run of Show is part of normal page scrolling rather than a fixed-height inner scroller.
- PCO data remains accurate and understandable.
- The design is evaluated with real plan data on desktop and mobile.
- The product owner approves the layout before implementation begins.

---

## Workstream I1 — Reliable automatic Monday.com mirroring

**Status:** Complete and verified in production

**Role in roadmap:** Transitional infrastructure, not the long-term issue system

### First release

- Remove the “create a task in Monday.com” checkbox.
- Send every newly created issue, including Low severity, when the integration is enabled.
- Save the Sunday Ops issue before attempting the external push.
- Do not discard or roll back the issue if Monday.com fails.
- Track at least pending, synced, and failed states.
- Allow a permitted user to retry a failed push.
- Add idempotency so retries cannot create duplicate Monday items.
- Authenticate and authorize the Edge Function.
- Retain the Monday item ID for reconciliation and eventual migration.

### Acceptance criteria

- Operators make no Monday.com decision during issue capture.
- Every issue appears in Sunday Ops immediately.
- A Monday outage is visible but does not block Sunday Ops.
- Retrying the same issue creates no duplicate item.
- Unauthorized callers cannot create Monday.com items.

### Implementation validation

- **July 31, 2026 — implementation:** Removed the operator checkbox and severity exclusion. With the integration enabled, every new issue is saved first and then mirrored automatically.
- Added migration `059_monday_issue_sync` with durable `not_requested`, `pending`, `syncing`, `synced`, and `failed` states. Existing unsent history remains `not_requested`; new rows default to `pending`.
- Restricted anon issue INSERT/UPDATE privileges to operational fields so only the service role can set sync state, attempt tokens, errors, timestamps, or the Monday item ID.
- The Edge Function now requires an unexpired Sunday Ops session, accepts only an issue ID, fetches canonical issue/photo data server-side, atomically claims work, rejects concurrent claims, reclaims attempts after five minutes, and reuses a stored or externally discoverable Monday item on retry.
- Monday item creation uses a deterministic API idempotency key and a required `Sunday Ops Issue ID` text column, closing the lost-response window where an external item could exist before Sunday Ops stored its ID.
- Pending and failed issue cards expose retry controls; Monday.com failure does not roll back or delete the Sunday Ops issue.
- The production build and scoped frontend lint pass with Monday mirroring enabled. Deno type-check/lint passes, and five focused tests cover validation, content construction, claimable retry state, existing-item reuse, and durable external-ID values.
- **Supabase deployed July 31, 2026:** Applied migration `059` to `BFC Production Sunday Op Hub` and deployed `push-monday-issue` with JWT verification enabled. The remote sync columns returned successfully, and a POST without `x-session-token` returned `401` without a production record mutation.
- Deployed migration `060_monday_sync_legacy_insert_compat` to preserve issue creation by the currently deployed frontend, which explicitly inserts `pushed_to_monday: false`. Server-only control remains in force for authoritative sync status, Monday item ID, attempts, errors, and timestamps.
- Added the Monday `Sunday Ops Issue ID` text column and configured `MONDAY_ISSUE_ID_COLUMN_ID` in Supabase. The configuration restart produced active function version 19; all five Monday settings are present, and the unauthenticated probe still returns `401`.
- Deployed the automatic-mirroring Pages frontend. The authenticated production smoke test confirmed save-first behavior and visible failure/retry state.
- The first smoke attempt stopped before Monday because `service_role` lacked `issue_photos` privileges. Added and deployed migration `061_issue_photos_permissions`, verified both browser and service-role reads, and retried the same issue.
- **Production verification complete:** Sunday Ops recorded the issue as synced, the Monday board filter returned exactly one matching item with one update containing the correct issue UUID, and the retained smoke-test issue was marked resolved.

---

## Workstream I2 — Global Issues center

**Status:** Ready for product specification after the permission skeleton is agreed

**Why it matters:** This is the first step from issue capture toward native operational follow-up.

### First release responsibilities

- Show issues across all events.
- Filter by open/resolved, severity, event/date, and Monday sync state.
- Search titles and descriptions.
- Link every issue back to its source event.
- Resolve or reopen an issue for permitted users.
- Preserve photos and existing historical issues.
- Provide a global navigation entry for users with issue-management permission.

Do not overload the first release with a complete project-management system.

### Acceptance criteria

- A manager can answer “What is still open across all events?” without visiting events one at a time.
- The event-scoped Issue Log remains the fast place to capture and review issues during an event.
- Global and event views show the same underlying records.
- Access is enforced by backend permissions.

---

## Workstream I3 — Native issue management and Monday.com retirement

**Status:** Discovery after I2 has real usage

**Goal:** Make Sunday Ops sufficient for assigning, discussing, tracking, and closing operational follow-up.

### Capabilities to evaluate from actual I2 usage

- Assignee or owning department
- Workflow status beyond open/resolved
- Due date or target event
- Comments and activity history
- Watchers and notifications
- Recurring issue or linked incidents
- Reporting on recurring problem areas
- Links between issues, documents, checklist items, and evaluations

These are candidates, not approved features. The first design session should examine what work is actually still happening in Monday.com after I2 ships.

### Retirement criteria

- Every relied-upon Monday.com issue workflow has an accepted Sunday Ops replacement or is explicitly dropped.
- Open Monday.com items are reconciled and linked or migrated.
- Users are trained on the Sunday Ops workflow.
- The integration can be disabled without losing history.
- Monday IDs and sync history remain available for audit even after cutover.

---

## Workstream W1 — Workbook Event model

**Status:** Complete — deployed August 4, 2026

**Goal:** Let workbook-attached events participate in larger productions without creating a second Event system or copying operational data.

### Implemented decisions

- A module is owned by exactly one Event or one Workbook.
- A Workbook discovers modules from its attached Events at read time. There is no inheritance, copy, or override layer.
- Workbook modules do not appear in an Event, and attaching an Event does not mutate its modules.
- The existing `events` core and `events.workbook_id` relationship remain authoritative; no parallel Workbook Event type was created.
- A detached Event retains its Event-owned modules. Workbook-owned modules remain with the Workbook.
- Schedule coordination remains Workbook-owned; PCO remains authoritative for linked plan identity/times; Event and Workbook modules remain Sunday Ops-owned live documents.
- Workbook aggregation uses owner/module tabs on desktop and accordions on mobile.

### Implementation guardrail

Use the existing `events` core and workbook relationship unless discovery proves it cannot express the required behavior. Prefer explicit capabilities derived from “attached to workbook” over cloning all event tables and pages.

### Acceptance criteria for the design phase

- [x] Standard Event and Workbook Event behavior is documented.
- [x] Attach, detach, archive, and historical behavior is specified without an inheritance/override system.
- [x] Input List, Production Documents, Crew, Supplies, and Intercom can be explicitly Event- or Workbook-owned.
- [x] The product owner approved the model before the Phase 1–3 migrations.

---

## Workstream W2 — Input List ownership pilot

**Status:** Complete — deployed August 4, 2026

**Why it matters:** Input Lists are the clearest current example of information that may need both workbook context and event-level use.

### Implemented model

- Reusable location sections, columns, connection rows, room values, and cell-link rules provide the location-specific structure.
- An Event or Workbook module owns the production-specific cell values.
- A Workbook discovers and prints the Event Input Lists of attached Events and can also own a shared Workbook Input List.
- One module instance is the source of truth for every editable value; no value is copied between scopes.

### Acceptance criteria

- [x] One source of truth is clear for every Input List value.
- [x] Workbook and Event users edit the same canonical module rather than copies.
- [x] Workbook packets can include Workbook and attached-Event Input Lists.
- [x] The ownership/lifecycle model is reused by four other modules while each keeps domain-specific storage.
- [x] Existing 356 Workbook Input List cells were migrated without loss.

---

## Workstream A1 — Analytics trust and completion

**Status:** Depends on F1 and F2; product discovery can begin earlier

### Audience

- Managers who need operational understanding
- Leadership or staff who need analytics but no production-workspace access
- Administrators responsible for data quality and configuration

### Sequence

1. Define the questions each audience needs answered.
2. Complete the Data Truth Audit for every included metric.
3. Show data freshness, coverage, and missing-data states.
4. Remove or clearly label incomplete metrics.
5. Add Analytics Viewer accounts and route-level/data-level restrictions.
6. Improve dashboards only after the underlying answers are trustworthy.

### Acceptance criteria

- Every displayed metric has a documented definition and source.
- Missing or stale data is visible rather than silently treated as zero.
- Representative values reconcile with source events.
- Analytics Viewers cannot retrieve event operations, workbooks, settings, or financial data.
- The dashboard answers agreed user questions rather than merely displaying available charts.

---

## Workstream E1 — Evaluation participation and closeout

**Status:** Later / light discovery allowed

### Near-term questions

- Should evaluation appear as part of event closeout, a checklist expectation, or remain a separate destination?
- How many responses are expected for each event?
- Must anonymity be absolute, or can completion be tracked separately from answers?
- Which results should feed Issues or Analytics?

Avoid a large evaluation redesign until the team expectation and response workflow are clear.

### Future app and push-notification chapter

Evaluate a full mobile app when notification-driven workflows become important enough to justify it. This work should include:

- Which notifications are genuinely valuable
- Who receives each notification and why
- Notification preferences and quiet hours
- Device registration and revocation
- Privacy of evaluation reminders
- App Store/internal distribution and maintenance burden
- Whether a native shell, web push, or another approach best meets the need

The product remains online-first. Push notifications do not imply building offline data editing.

### Acceptance criteria for a future notification release

- Notifications are tied to an agreed event workflow, not sent merely because the technology exists.
- Users can control appropriate notification categories.
- Delivery failure does not corrupt evaluation or event state.
- Evaluation anonymity rules remain intact.

---

## Workstream T1 — Incremental internal architecture

**Status:** Continuous; perform while touching relevant areas

This is not a standalone rewrite phase. Improve ownership along the path of product work.

### Priorities

- Move domain-specific database access out of large screens into clear data/service modules.
- Split `Workbooks.tsx` by feature responsibility while preserving the visible workbook workspace.
- Keep schedule, crew, intercom, input list, supplies, live-module, and export logic independently testable.
- Introduce durable routes and deep links when global Issues, analytics-only entry, and workbook/event navigation require them.
- Split large feature bundles as routes become available.
- Consolidate repeated loading, error, empty, and permission states.
- Keep external integrations behind named adapters so PCO or Monday.com can be changed without rewriting UI screens.

### Guardrails

- Refactor in small slices attached to a verified product change.
- Preserve existing behavior before rearranging code.
- Add characterization tests before moving high-risk logic.
- Do not create abstractions only to reduce line counts.

### Acceptance criteria

- A change to one workbook module has a smaller, testable impact surface.
- Screens coordinate presentation rather than owning every database operation.
- Important destinations can be linked, refreshed, and revisited reliably.
- Removing an integration requires changing its adapter and workflow, not searching the whole UI.

---

## Recommended sequence of releases

This sequence expresses dependencies, not calendar estimates.

### Release 1 — Visible simplification and audit preparation

- Production Docs direct-view experience
- Remove Event Overview Quick Actions
- Inventory security-sensitive operations and public policies
- Define the Data Truth Audit format and representative events
- Add a small smoke-test baseline around the touched features

### Release 2 — Trust foundation

- Execute the Data Truth Audit
- Establish staging and the backend deployment recipe
- Protect Monday.com, admin, and financial operations
- Prototype the signed identity model
- Approve the role and permission matrix

### Release 3 — Issues become a Sunday Ops system

- Automatic reliable Monday.com mirroring **(I1 complete and production-verified July 31, 2026)**
- Global Issues center
- Manager permission for issue management
- Sync status, retry, and duplicate prevention
- Observe which follow-up work still requires Monday.com

Current handoff: SEC-02 and the five initial module-content boundaries are complete. The next containment slice is account-level Production Config and Input List structure/reorder management; I2 Global Issues remains the next issue-management product slice. I1 should be reopened only for a regression or newly approved scope.

### Release 4 — Direct users and permission enforcement

- Email invitation/sign-in
- User/Manager/Admin authorization **(deployed August 4, 2026)**
- Analytics Viewer and invited non-PCO identity
- Separate Financial Access permission
- Row-level/backend enforcement across the highest-value domains
- Analytics-only application entry

### Release 5 — Workbook Event model

- **Complete and production-verified August 4, 2026.**
- Implemented exact Event-or-Workbook module ownership on the existing Event core.
- Migrated Input List and Production Documents first, then Crew, Supplies, and Intercom.
- Added Workbook aggregation without copying or inheriting Event content.
- Retired publication in favor of live documents and protected historical snapshots.

### Release 6 — Analytics completion

- Finalize audience questions and metric definitions
- Resolve data gaps found by the audit
- Add freshness and completeness signals
- Deliver the restricted Analytics Viewer experience

### Release 7 — Deeper product chapters

- Run of Show design and implementation after its dedicated discovery session
- Native issue-management capabilities and Monday.com retirement
- Evaluation closeout improvements
- Full app and push-notification feasibility, followed by implementation only if justified

---

## Future-session launch guide

Use this table to start a focused session without reopening the entire audit.

| Session | Read first | Inspect first | Required output |
|---|---|---|---|
| Production Docs implementation | Confirmed decisions; P1 | `ProductionDocs.tsx`, production-doc schema/storage | Direct-view implementation plus desktop/mobile verification |
| Event Overview cleanup | Confirmed decisions; P2 | `Dashboard.tsx`, Sidebar, MobileTabs | Remove Quick Actions without inventing a new dashboard model |
| Run of Show design | P3 | Printed example, `Dashboard.tsx`, PCO plan-item response | Approved design brief and wireframe; no code required initially |
| Automatic Monday mirror (completed July 31, 2026) | I1; F2 immediate containment | `IssueLog.tsx`, `push-monday-issue` function, issue schema | Regression or incident verification only; implementation is production-verified |
| Global Issues center | I2; permission model | Issue schema, App/Sidebar navigation, event Issue Log | Product spec or first global management slice |
| Monday.com replacement | I3 | Global Issues usage and actual Monday workflows | Gap analysis and native issue-management specification |
| Data Truth Audit | F1 | Migrations, `reportData.ts`, service records, operational scripts | Read-only reconciliation report and canonical-source map |
| Permissions architecture | F2 | Auth context, PCO auth, users table/functions, RLS policies | Approved identity design, permission matrix, staged migration plan |
| Quality and deployment | F3 | `package.json`, workflows, Supabase functions/migrations | Test baseline, staging plan, reproducible deployment guide |
| Module-system regression or extension | W1, W2, module architecture, deployment record | `ModuleWorkspace`, module APIs, migrations `063`–`067` | Preserve exact ownership, role, data-migration, and negative-security-test invariants |
| Analytics completion | A1 | Analytics screens/view, service records, audit results | Audience questions, metric dictionary, prioritized implementation plan |
| Evaluation/app notifications | E1 | Evaluation screen/schema, team workflow | Participation strategy and notification feasibility brief |

---

## Questions intentionally left open

These are not omissions. They require product discovery or operational evidence.

- What exact Run of Show layout best serves the crew?
- Should Sunday Ops ever edit or write Run of Show changes back to PCO?
- Which status, ownership, discussion, and notification features are required before Monday.com can be retired?
- Which analytics questions matter to each audience?
- How should evaluation completion and anonymity coexist?
- Does the value of push notifications justify a maintained native app?

---

## Completion standard for the broader roadmap

Sunday Ops has reached the intended next level when:

- Crew members naturally use Event Overview, Production Docs, Checklist, and Issues as their primary event workspace.
- The Run of Show has an approved, evidence-based design and no longer feels secondary.
- Managers can see and manage open operational issues across events without relying on Monday.com.
- Standard Events and Workbook Events behave deliberately rather than accidentally.
- Invited analytics users can access only the information intended for them.
- Financial data is protected by backend permissions.
- Analytics is trusted because definitions, freshness, and missing data are explicit.
- Deployments include the frontend, database, functions, tests, and rollback instructions.
- Legacy compatibility remains only where documented and necessary.
- New features have a clear owner: event, workbook, library, or integration.

---

## Roadmap change log

### July 31, 2026 — Initial roadmap

- Consolidated the structural audit, Google Doc comments, and page-by-page product feedback.
- Preserved the Run of Show as an open design problem; explicitly rejected an assumed Now/Next direction.
- Established Monday.com as a temporary bridge and native Sunday Ops issue management as the destination.
- Added Workbook Event as a distinct product mode requiring discovery.
- Confirmed permission presets with Financial Access kept separate.
- Deferred full app and push notifications to a later evaluation-engagement chapter.

### July 31, 2026 — Security inventory

- Completed the read-only F2 policy, caller, Edge Function, RPC, Storage, and financial-data inventory.
- Documented the identity mismatch between the custom Planning Center session and direct Supabase anon requests.
- Prioritized Monday.com authorization, financial isolation, high-impact administrative writes, restricted reads, and signed identity as staged containment releases.

### July 31, 2026 — I1 production completion and session handoff

- Deployed the secure automatic-mirroring frontend, migrations `059` and `060`, the protected `push-monday-issue` Edge Function, and the Monday `Sunday Ops Issue ID` column/secret.
- The authenticated smoke test correctly preserved a Sunday Ops issue when server-side photo lookup initially failed. Production logs identified the missing `issue_photos` privilege before any Monday request was made.
- Added and deployed migration `061_issue_photos_permissions`, retried the same issue, and verified exactly one Monday item with one update and the correct issue UUID. The database finished in `synced` state with no error, and the retained smoke-test issue was resolved.
- Updated the README, changelog, roadmap, and security inventory to record the deployed state, verification evidence, rollback order, and next work.

### August 4, 2026 — Event and Workbook module system complete

- Approved and deployed the exact-one-owner module model: Input List, Production Documents, Crew, Supplies, and Intercom may belong to one Event or one Workbook; Workbooks discover attached Event modules without copying them.
- Added User/Manager/Admin authorization, Admin-configured PCO defaults, recoverable archive/restore lifecycle, and verified module/financial APIs through migrations `063`–`067`.
- Migrated all existing content with zero missing module owners and preserved the exact source counts. Retired Send Update/publication while retaining historical snapshots behind service-role access.
- Verified anonymous denial, Admin/non-Admin response shaping, the complete automated quality gate, and authenticated desktop/mobile production workflows. The detailed evidence is in [`module-system-deployment.md`](module-system-deployment.md).
- **Next containment slice:** protect account-level Production Config and Input List structure/reorder management, then continue the remaining administrative-write and restricted-read releases.
- **Next session:** begin SEC-02 financial-data containment. Do not restart I1 unless investigating a regression or implementing newly approved scope.
