-- Migration 030: Fix event_checklist_items and event_checklist_completions
-- to use events.id instead of special_events.id for the event_id FK.
--
-- Same pattern as migration 029, which fixed the ServiceData tables.
-- event_checklist_items and event_checklist_completions were missed.

-- ── event_checklist_items ──────────────────────────────────────────────────────

-- Drop old FK first so the UPDATE isn't blocked by the special_events constraint
ALTER TABLE event_checklist_items
  DROP CONSTRAINT IF EXISTS event_checklist_items_event_id_fkey;

-- Remap existing event_id values (special_events.id → events.id)
UPDATE event_checklist_items eci
SET event_id = e.id
FROM events e
WHERE e.legacy_special_event_id = eci.event_id;

-- Re-point FK to events(id)
ALTER TABLE event_checklist_items
  ADD CONSTRAINT event_checklist_items_event_id_fkey
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;

-- ── event_checklist_completions ────────────────────────────────────────────────

-- Drop old FK first
ALTER TABLE event_checklist_completions
  DROP CONSTRAINT IF EXISTS event_checklist_completions_event_id_fkey;

-- Remap existing event_id values (special_events.id → events.id)
UPDATE event_checklist_completions ecc
SET event_id = e.id
FROM events e
WHERE e.legacy_special_event_id = ecc.event_id;

-- Re-point FK to events(id)
ALTER TABLE event_checklist_completions
  ADD CONSTRAINT event_checklist_completions_event_id_fkey
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;
