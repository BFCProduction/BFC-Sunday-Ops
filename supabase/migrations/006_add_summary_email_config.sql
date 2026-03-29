create table if not exists report_email_settings (
  key text primary key default 'default',
  enabled boolean not null default true,
  send_day integer not null default 0 check (send_day between 0 and 6),
  send_time time not null default '15:00',
  timezone text not null default 'America/Chicago',
  sender_name text not null default 'BFC Sunday Ops',
  reply_to_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists report_email_recipients (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists report_email_recipients_email_idx
  on report_email_recipients (lower(email));

create index if not exists report_email_recipients_sort_idx
  on report_email_recipients (active desc, sort_order asc, created_at asc);

create table if not exists report_email_runs (
  id uuid primary key default gen_random_uuid(),
  sunday_id uuid references sundays(id) on delete cascade not null,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed')),
  sent_at timestamptz,
  recipient_count integer not null default 0,
  error text,
  provider_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sunday_id)
);

alter table report_email_settings enable row level security;
alter table report_email_recipients enable row level security;
alter table report_email_runs enable row level security;
