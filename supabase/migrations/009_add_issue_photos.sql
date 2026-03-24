-- Issue photos table
create table if not exists issue_photos (
  id           uuid primary key default gen_random_uuid(),
  issue_id     uuid not null references issues(id) on delete cascade,
  storage_path text not null,
  filename     text not null,
  uploaded_at  timestamptz not null default now()
);

alter table issue_photos enable row level security;

create policy "public_all" on issue_photos
  for all using (true) with check (true);

create index if not exists issue_photos_issue_id_idx on issue_photos(issue_id);
