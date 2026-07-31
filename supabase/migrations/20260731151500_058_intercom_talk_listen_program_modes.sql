-- Extend Intercom channel assignments with a hybrid talk mode, independent
-- listen modes, and an explicit Program-feed flag.

alter table public.intercom_channels
  add column if not exists is_program boolean not null default false;

alter table public.workbook_intercom_channels
  add column if not exists is_program boolean not null default false;

update public.intercom_channels
set is_program = true,
    updated_at = now()
where lower(btrim(name)) = 'program';

update public.workbook_intercom_channels as event_channel
set is_program = true
where lower(btrim(event_channel.name)) = 'program'
   or exists (
     select 1
     from public.intercom_channels as master_channel
     where master_channel.id = event_channel.master_channel_id
       and master_channel.is_program
   );

alter table public.role_intercom_default_channels
  alter column button_mode drop not null,
  add column if not exists listen_mode text,
  add column if not exists program_enabled boolean not null default false;

alter table public.workbook_intercom_channel_assignments
  alter column button_mode drop not null,
  add column if not exists listen_mode text,
  add column if not exists program_enabled boolean not null default false;

alter table public.role_intercom_default_channels
  drop constraint if exists role_intercom_default_channels_button_mode_check,
  drop constraint if exists role_intercom_default_channels_listen_mode_check,
  drop constraint if exists role_intercom_default_channels_has_state_check;

alter table public.role_intercom_default_channels
  add constraint role_intercom_default_channels_button_mode_check
    check (button_mode is null or button_mode in ('momentary', 'latch', 'latch_momentary')),
  add constraint role_intercom_default_channels_listen_mode_check
    check (listen_mode is null or listen_mode in ('listen', 'listen_on_talk'));

alter table public.workbook_intercom_channel_assignments
  drop constraint if exists workbook_intercom_channel_assignments_button_mode_check,
  drop constraint if exists workbook_intercom_channel_assignments_listen_mode_check,
  drop constraint if exists workbook_intercom_channel_assignments_has_state_check;

alter table public.workbook_intercom_channel_assignments
  add constraint workbook_intercom_channel_assignments_button_mode_check
    check (button_mode is null or button_mode in ('momentary', 'latch', 'latch_momentary')),
  add constraint workbook_intercom_channel_assignments_listen_mode_check
    check (listen_mode is null or listen_mode in ('listen', 'listen_on_talk'));

-- A previous talk selection on Program meant the feed was wanted. Preserve
-- that intent while converting Program away from talk/listen semantics.
update public.role_intercom_default_channels as role_channel
set button_mode = null,
    listen_mode = null,
    program_enabled = true
from public.intercom_channels as master_channel
where master_channel.id = role_channel.channel_id
  and master_channel.is_program;

update public.workbook_intercom_channel_assignments as assignment_channel
set button_mode = null,
    listen_mode = null,
    program_enabled = true,
    updated_at = now()
from public.workbook_intercom_channels as event_channel
where event_channel.id = assignment_channel.event_channel_id
  and event_channel.is_program;

alter table public.role_intercom_default_channels
  add constraint role_intercom_default_channels_has_state_check
    check (button_mode is not null or listen_mode is not null or program_enabled);

alter table public.workbook_intercom_channel_assignments
  add constraint workbook_intercom_channel_assignments_has_state_check
    check (button_mode is not null or listen_mode is not null or program_enabled);

comment on column public.intercom_channels.is_program is
  'Marks the Program audio feed, which is assigned as an on/off checkbox instead of talk/listen modes.';
comment on column public.workbook_intercom_channel_assignments.listen_mode is
  'Optional per-person receive behavior: listen or listen_on_talk.';
