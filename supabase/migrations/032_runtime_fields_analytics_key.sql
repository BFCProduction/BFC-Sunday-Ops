-- Migration 032: Add analytics_key to runtime_fields.
--
-- Allows each runtime field to be tagged with its role in service_records so
-- that the Runtimes screen can sync values to the analytics table after saving.
-- Only three analytics slots exist for runtimes:
--   'service_run_time'  → service_records.service_run_time_secs
--   'message_run_time'  → service_records.message_run_time_secs
--   'stage_flip_time'   → service_records.stage_flip_time_secs
-- Null means this field is not synced to service_records.

alter table public.runtime_fields
  add column if not exists analytics_key text
    check (analytics_key in ('service_run_time', 'message_run_time', 'stage_flip_time'));
