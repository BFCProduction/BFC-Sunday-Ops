-- Allow issues to be marked resolved inline without a separate modal.
alter table issues add column if not exists resolved_at timestamptz;
