-- ─────────────────────────────────────────────────────────────────────────────
-- 029_fix_event_id_fk_to_events.sql
--
-- Migration 016 added event_id columns to all operational tables pointing to
-- special_events(id).  Migration 017 introduced the unified events table.
-- The ServiceData screens (Attendance, Weather, Runtimes, LoudnessLog, Issues)
-- all use activeEventId = events.id, so writes to Sunday services fail silently
-- with a FK violation (the events.id UUID doesn't exist in special_events).
--
-- This migration:
--   1. Remaps existing event_id values: special_events.id → events.id
--      (via events.legacy_special_event_id, which holds the old id for each
--       special event row created before the unified model existed)
--   2. Drops the old FK constraints on each operational table
--   3. Re-adds them pointing at events(id)
--
-- Tables affected:
--   attendance, loudness, weather, runtime_values, issues, evaluations,
--   service_records
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Remap existing event_id values ────────────────────────────────────────
-- For each table, find rows whose event_id matches a special_events.id that
-- has since been mirrored into events.legacy_special_event_id, and update
-- event_id to the corresponding events.id.

UPDATE public.attendance a
SET    event_id = e.id
FROM   public.events e
WHERE  a.event_id IS NOT NULL
  AND  e.legacy_special_event_id = a.event_id;

UPDATE public.loudness l
SET    event_id = e.id
FROM   public.events e
WHERE  l.event_id IS NOT NULL
  AND  e.legacy_special_event_id = l.event_id;

UPDATE public.weather w
SET    event_id = e.id
FROM   public.events e
WHERE  w.event_id IS NOT NULL
  AND  e.legacy_special_event_id = w.event_id;

UPDATE public.runtime_values rv
SET    event_id = e.id
FROM   public.events e
WHERE  rv.event_id IS NOT NULL
  AND  e.legacy_special_event_id = rv.event_id;

UPDATE public.issues i
SET    event_id = e.id
FROM   public.events e
WHERE  i.event_id IS NOT NULL
  AND  e.legacy_special_event_id = i.event_id;

UPDATE public.evaluations ev
SET    event_id = e.id
FROM   public.events e
WHERE  ev.event_id IS NOT NULL
  AND  e.legacy_special_event_id = ev.event_id;

UPDATE public.service_records sr
SET    event_id = e.id
FROM   public.events e
WHERE  sr.event_id IS NOT NULL
  AND  e.legacy_special_event_id = sr.event_id;

-- ── 2. Drop old FK constraints (pointing to special_events) ──────────────────
ALTER TABLE public.attendance      DROP CONSTRAINT IF EXISTS attendance_event_id_fkey;
ALTER TABLE public.loudness        DROP CONSTRAINT IF EXISTS loudness_event_id_fkey;
ALTER TABLE public.weather         DROP CONSTRAINT IF EXISTS weather_event_id_fkey;
ALTER TABLE public.runtime_values  DROP CONSTRAINT IF EXISTS runtime_values_event_id_fkey;
ALTER TABLE public.issues          DROP CONSTRAINT IF EXISTS issues_event_id_fkey;
ALTER TABLE public.evaluations     DROP CONSTRAINT IF EXISTS evaluations_event_id_fkey;
ALTER TABLE public.service_records DROP CONSTRAINT IF EXISTS service_records_event_id_fkey;

-- ── 3. Re-add FK constraints pointing to events(id) ──────────────────────────
ALTER TABLE public.attendance
  ADD CONSTRAINT attendance_event_id_fkey
  FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;

ALTER TABLE public.loudness
  ADD CONSTRAINT loudness_event_id_fkey
  FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;

ALTER TABLE public.weather
  ADD CONSTRAINT weather_event_id_fkey
  FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;

ALTER TABLE public.runtime_values
  ADD CONSTRAINT runtime_values_event_id_fkey
  FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;

ALTER TABLE public.issues
  ADD CONSTRAINT issues_event_id_fkey
  FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;

ALTER TABLE public.evaluations
  ADD CONSTRAINT evaluations_event_id_fkey
  FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;

-- service_records uses SET NULL (not CASCADE) — an event deletion should not
-- wipe the analytics record, just unlink it.
ALTER TABLE public.service_records
  ADD CONSTRAINT service_records_event_id_fkey
  FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE SET NULL;
