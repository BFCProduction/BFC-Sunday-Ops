-- Add optional countdown_target to runtime_fields.
-- When set, the relay adds this duration to the captured overrun time so the
-- stored value is the true total runtime (countdown target + overrun).
-- Leave null for stopwatch / elapsed-time clocks.

alter table runtime_fields
  add column if not exists countdown_target text default null;
