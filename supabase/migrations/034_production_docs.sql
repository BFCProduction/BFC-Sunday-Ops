-- Production docs: stage plots, input lists, run sheets, and other files per event.
--
-- Storage bucket: create a bucket named `production-docs` in the Supabase dashboard → Storage.
-- Set to Public. Then run the following policies in the SQL Editor:
--
--   create policy "allow public uploads" on storage.objects
--     for insert to public with check (bucket_id = 'production-docs');
--   create policy "allow public reads" on storage.objects
--     for select to public using (bucket_id = 'production-docs');
--   create policy "allow public deletes" on storage.objects
--     for delete to public using (bucket_id = 'production-docs');

create table if not exists public.production_docs (
  id             uuid        primary key default gen_random_uuid(),
  event_id       uuid        not null references public.events(id) on delete cascade,
  doc_type       text        not null default 'other',
  -- 'stage_plot' | 'input_list' | 'run_sheet' | 'other'
  title          text        not null,
  storage_path   text,       -- Supabase Storage path inside the production-docs bucket
  gdrive_file_id text,       -- Google Drive file ID (kept for re-sync reference and Sheet embeds)
  gdrive_url     text,       -- Google Drive webViewLink (direct open link)
  source         text        not null default 'manual',
  -- 'drive_sync' | 'manual'
  synced_at      timestamptz,
  uploaded_at    timestamptz not null default now()
);

alter table public.production_docs enable row level security;

create policy "public_all" on public.production_docs
  for all using (true) with check (true);

create index if not exists production_docs_event_id_idx
  on public.production_docs(event_id);

-- Prevents re-syncing the same Drive file to the same event twice.
create unique index if not exists production_docs_gdrive_event_unique
  on public.production_docs(event_id, gdrive_file_id)
  where gdrive_file_id is not null;
