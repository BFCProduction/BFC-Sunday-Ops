-- Sundays: one row per service Sunday
create table if not exists sundays (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  status text not null default 'pre_service'
    check (status in ('pre_service','service_1','between','service_2','post_service','complete')),
  created_at timestamptz default now()
);

-- Checklist completions
create table if not exists checklist_completions (
  id uuid primary key default gen_random_uuid(),
  sunday_id uuid references sundays(id) on delete cascade not null,
  item_id integer not null,
  initials text not null,
  completed_at timestamptz default now(),
  unique(sunday_id, item_id)
);

-- Attendance
create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  sunday_id uuid references sundays(id) on delete cascade not null unique,
  service_1_count integer,
  service_2_count integer,
  notes text,
  submitted_at timestamptz default now()
);

-- Issues
create table if not exists issues (
  id uuid primary key default gen_random_uuid(),
  sunday_id uuid references sundays(id) on delete cascade not null,
  description text not null,
  severity text not null check (severity in ('Low','Medium','High','Critical')),
  monday_item_id text,
  pushed_to_monday boolean default false,
  created_at timestamptz default now()
);

-- Loudness log
create table if not exists loudness (
  id uuid primary key default gen_random_uuid(),
  sunday_id uuid references sundays(id) on delete cascade not null unique,
  service_1_max_db numeric(5,1),
  service_1_laeq numeric(5,1),
  service_2_max_db numeric(5,1),
  service_2_laeq numeric(5,1),
  logged_at timestamptz default now()
);

-- Service runtimes
create table if not exists service_runtimes (
  id uuid primary key default gen_random_uuid(),
  sunday_id uuid references sundays(id) on delete cascade not null unique,
  service_1_runtime text,
  service_1_message_runtime text,
  service_2_runtime text,
  service_2_message_runtime text,
  flip_time text,
  saved_at timestamptz default now()
);

-- Weather
create table if not exists weather (
  id uuid primary key default gen_random_uuid(),
  sunday_id uuid references sundays(id) on delete cascade not null unique,
  temp_f numeric(4,1),
  condition text,
  wind_mph numeric(4,1),
  humidity integer,
  fetched_at timestamptz default now()
);

-- Evaluations
create table if not exists evaluations (
  id uuid primary key default gen_random_uuid(),
  sunday_id uuid references sundays(id) on delete cascade not null unique,
  audio_rating integer check (audio_rating between 1 and 5),
  video_rating integer check (video_rating between 1 and 5),
  lighting_rating integer check (lighting_rating between 1 and 5),
  stage_rating integer check (stage_rating between 1 and 5),
  stream_rating integer check (stream_rating between 1 and 5),
  overall_rating integer check (overall_rating between 1 and 5),
  went_well text,
  didnt_go text,
  submitted_at timestamptz default now()
);

-- Stream analytics (populated by GitHub Actions cron)
create table if not exists stream_analytics (
  id uuid primary key default gen_random_uuid(),
  sunday_id uuid references sundays(id) on delete cascade not null unique,
  youtube_peak integer,
  youtube_total_views integer,
  resi_peak integer,
  church_online_peak integer,
  pulled_at timestamptz default now()
);

-- RLS
alter table sundays enable row level security;
alter table checklist_completions enable row level security;
alter table attendance enable row level security;
alter table issues enable row level security;
alter table loudness enable row level security;
alter table service_runtimes enable row level security;
alter table weather enable row level security;
alter table evaluations enable row level security;
alter table stream_analytics enable row level security;

-- Public access policies
create policy "public_all" on sundays for all using (true) with check (true);
create policy "public_all" on checklist_completions for all using (true) with check (true);
create policy "public_all" on attendance for all using (true) with check (true);
create policy "public_all" on issues for all using (true) with check (true);
create policy "public_all" on loudness for all using (true) with check (true);
create policy "public_all" on service_runtimes for all using (true) with check (true);
create policy "public_all" on weather for all using (true) with check (true);
create policy "public_all" on evaluations for all using (true) with check (true);
create policy "public_all" on stream_analytics for all using (true) with check (true);
