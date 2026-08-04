# Sunday Ops Module Architecture

Last updated: August 4, 2026

## Confirmed product model

Sunday Ops Events are the canonical records for individual services. A Workbook
coordinates one or more Events but does not copy their operational data.

A module is a live operational document owned by exactly one Event or exactly
one Workbook:

- Event modules describe the needs of one service.
- Workbook modules describe shared production needs across the Workbook.
- A Workbook automatically discovers modules owned by its attached Events.
- Workbook-level modules do not appear inside the individual Events.
- Workbook aggregate views use tabs on desktop and accordions on mobile so one
  Event's module can be viewed at a time.
- Module contents remain live until the Event is over. Publication/versioning is
  not part of the target module workflow.

The first module types are Input List, Production Documents, Crew, Supplies,
and Intercom. The database allows multiple instances of one type while folder
defaults create at most one of each configured type.

## Ownership examples

| Need | Owner | Workbook behavior |
|---|---|---|
| Different input list for each service | Event | Workbook switches among Event lists |
| One intercom grid shared by every service | Workbook | One shared grid |
| Baptism towels and shirts | Event | Appears under that Event's Supplies |
| General production purchases | Workbook | One shared Supplies module |
| Planning Center crew assignments | Event | Workbook aggregates Event rosters |

## Lifecycle

Modules are active or archived. Managers and Admins can archive and restore
modules. Archiving preserves module contents and prevents folder defaults from
silently recreating an intentionally removed module. Permanent deletion is an
Admin-only recovery operation and is not part of the normal workspace UI.

## Access levels

| Capability | User | Manager | Admin |
|---|---:|---:|---:|
| View and edit live module contents | Yes | Yes | Yes |
| Add, archive, restore, and reorder modules | No | Yes | Yes |
| Create and organize Events | No | Yes | Yes |
| Configure PCO-folder module defaults | No | No | Yes |
| View or change pay, rates, and costs | No | No | Yes |
| Manage users and access levels | No | No | Yes |
| Permanently delete populated modules | No | No | Yes |

The server, rather than the visibility of a UI control, must enforce every
Manager and Admin capability.

## Planning Center defaults

Planning Center Folder IDs are the preferred stable configuration keys. This
account currently exposes the principal Sunday Ops groupings as top-level PCO
Service Types rather than Folder API resources, so their stable Service Type
IDs provide deterministic fallback keys. Names remain display labels and may
change without losing the defaults. The principal groupings are:

- 9:00 Service
- 11:00 Service
- Special Events

Folder defaults apply automatically to newly created Events. Existing Events
remain unchanged until a Manager explicitly applies the current defaults.

## Storage model

`module_definitions` is the code-backed catalog of supported module types.
`module_instances` stores ownership, ordering, location, lifecycle, and audit
metadata. Each module type keeps its structured content in domain-specific
tables instead of a generic JSON payload.

Phase 2 stores Input List cells in `module_input_list_values` and links
Production Document rows to `production_docs.module_instance_id`. Both content
paths require a verified Sunday Ops session. Existing Workbook Input List cells
and Event Production Documents are assigned to canonical modules by a
forward-only migration; Event content is not copied into Workbook storage.

`pco_folders` stores the Planning Center hierarchy plus deterministic
`service-type:<PCO ID>` fallbacks for the three principal top-level groupings, and
`module_folder_defaults` maps a Folder to its default Event modules. Module
metadata has no anonymous browser grants; authenticated reads and Manager/Admin
writes go through the `module-admin` Edge Function.

## Migration order

1. Establish access levels, protected module metadata, PCO folder defaults, and
   financial-data containment.
2. Convert Production Documents and Input List to module ownership and add the
   Workbook Event switcher. **Implemented in Phase 2.**
3. Convert Crew, Supplies, and Intercom, then remove the old publication UI and
   superseded compatibility paths after production verification.

All migrations are forward-only and preserve existing operational records.
