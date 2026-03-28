-- Add C-weighted loudness columns to the existing loudness table.
-- These complement the existing A-weighted columns (service_1_max_db, service_1_laeq, etc.)
-- Null for all historical rows; populated going forward once the Loudness Log
-- input screen is updated to collect them.

alter table loudness
  add column if not exists service_1_max_db_c numeric(5,1),
  add column if not exists service_1_lceq     numeric(5,1),
  add column if not exists service_2_max_db_c numeric(5,1),
  add column if not exists service_2_lceq     numeric(5,1);
