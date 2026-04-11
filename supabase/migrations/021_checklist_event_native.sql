-- ── Sprint 3: Per-Event Checklists ────────────────────────────────────────────
--
-- 1. checklist_completions gains event_id so each service event can track its
--    own completions independently (9am and 11am no longer share completions).
--
-- 2. checklist_items gains service_type_slug so items can be scoped to a
--    specific service type (null = show on all services).

-- ── checklist_completions ─────────────────────────────────────────────────────

alter table public.checklist_completions
  add column if not exists event_id uuid
    references public.events(id)
    on delete cascade;

-- Partial unique index: one completion row per (event_id, item_id).
-- The WHERE clause makes it a partial index so legacy rows (event_id IS NULL)
-- are unaffected and the existing sunday_id unique constraint still applies.
create unique index if not exists checklist_completions_event_item_idx
  on public.checklist_completions(event_id, item_id)
  where event_id is not null;

-- ── checklist_items ───────────────────────────────────────────────────────────

-- null  → item appears on all service types (current default for all rows)
-- slug  → item appears only on that service type (e.g. 'sunday-9am')
alter table public.checklist_items
  add column if not exists service_type_slug text;

-- ── Grants ────────────────────────────────────────────────────────────────────
grant select, insert, update, delete on public.checklist_completions to anon, authenticated;
grant select, insert, update, delete on public.checklist_items         to anon, authenticated;
