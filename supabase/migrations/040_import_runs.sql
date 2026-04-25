-- ─────────────────────────────────────────────────────────────────────────────
-- 040_import_runs.sql
--
-- Observable import history for fragile browser/API jobs. RESI writes one row
-- per run so operators can distinguish "no data" from "import failed."
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.import_runs (
  id             uuid primary key default gen_random_uuid(),
  source         text not null,
  target_date    date,
  status         text not null
    check (status in ('running', 'succeeded', 'failed', 'skipped')),
  rows_parsed    integer not null default 0,
  rows_written   integer not null default 0,
  artifact_path  text,
  error          text,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists import_runs_source_date_idx
  on public.import_runs(source, target_date desc, started_at desc);

alter table public.import_runs enable row level security;

drop policy if exists "public_read" on public.import_runs;
create policy "public_read" on public.import_runs
  for select using (true);

grant select on public.import_runs to anon, authenticated;
grant all on public.import_runs to service_role;
