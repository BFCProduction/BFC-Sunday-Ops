-- checklist_completions.sunday_id was created NOT NULL because all completions
-- were originally keyed by sunday_id. Now that completions are stored per-event
-- (event_id), new rows have sunday_id = NULL. Drop the NOT NULL so inserts work.
--
-- The existing unique(sunday_id, item_id) constraint is unaffected — in Postgres
-- NULL values are never considered equal in a unique constraint, so multiple
-- event-native rows (sunday_id = NULL) with different item_ids are allowed.
-- The partial unique index added in 021 (event_id, item_id WHERE event_id IS NOT NULL)
-- handles uniqueness for the new model.

alter table public.checklist_completions
  alter column sunday_id drop not null;
