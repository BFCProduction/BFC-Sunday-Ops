import { supabase } from './supabase'
import type { AppUser } from './adminApi'
import type {
  CrewRole,
  IntercomButtonMode,
  IntercomChannel,
  IntercomChannelState,
  IntercomListenMode,
  IntercomPackType,
  IntercomPackTypeKey,
  RoleIntercomDefault,
  WorkbookCrewMember,
  WorkbookIntercomAssignment,
  WorkbookIntercomChannel,
} from '../types'

export interface IntercomConfig {
  packTypes: IntercomPackType[]
  masterChannels: IntercomChannel[]
  roleDefaults: RoleIntercomDefault[]
}

export interface IntercomCrewIdentity {
  key: string
  name: string
  roleIds: string[]
  roleNames: string[]
  primaryRoleId: string | null
  isOpen: boolean
}

export interface WorkbookIntercomEventData {
  channels: WorkbookIntercomChannel[]
  assignments: WorkbookIntercomAssignment[]
}

interface DefaultChannelRow {
  role_id: string
  channel_id: string
  button_mode: IntercomButtonMode | null
  listen_mode: IntercomListenMode | null
  program_enabled: boolean
}

export async function loadIntercomConfig(): Promise<IntercomConfig> {
  const [packResult, channelResult, defaultResult, defaultChannelResult] = await Promise.all([
    supabase.from('intercom_pack_types').select('*').order('sort_order', { ascending: true }),
    supabase.from('intercom_channels').select('*').eq('is_active', true).order('sort_order', { ascending: true }).order('name', { ascending: true }),
    supabase.from('role_intercom_defaults').select('*'),
    supabase.from('role_intercom_default_channels').select('*'),
  ])
  if (packResult.error) throw packResult.error
  if (channelResult.error) throw channelResult.error
  if (defaultResult.error) throw defaultResult.error
  if (defaultChannelResult.error) throw defaultChannelResult.error

  const statesByRole = new Map<string, Record<string, IntercomChannelState>>()
  for (const row of (defaultChannelResult.data ?? []) as DefaultChannelRow[]) {
    const states = statesByRole.get(row.role_id) ?? {}
    states[row.channel_id] = {
      talk_mode: row.button_mode,
      listen_mode: row.listen_mode,
      program_enabled: row.program_enabled,
    }
    statesByRole.set(row.role_id, states)
  }

  return {
    packTypes: (packResult.data ?? []) as IntercomPackType[],
    masterChannels: (channelResult.data ?? []) as IntercomChannel[],
    roleDefaults: ((defaultResult.data ?? []) as Array<{
      role_id: string
      pack_type: IntercomPackTypeKey | null
    }>).map(row => ({
      role_id: row.role_id,
      pack_type: row.pack_type,
      channel_states: statesByRole.get(row.role_id) ?? {},
    })),
  }
}

export async function updateIntercomPackCapacity(key: IntercomPackTypeKey, count: number): Promise<void> {
  const { error } = await supabase
    .from('intercom_pack_types')
    .update({ available_count: Math.max(0, Math.floor(count)), updated_at: new Date().toISOString() })
    .eq('key', key)
  if (error) throw error
}

export async function createIntercomChannel(name: string, sortOrder: number): Promise<IntercomChannel> {
  const trimmedName = name.trim()
  const { data, error } = await supabase
    .from('intercom_channels')
    .insert({ name: trimmedName, is_program: trimmedName.toLowerCase() === 'program', sort_order: sortOrder })
    .select('*')
    .single()
  if (error) throw error
  return data as IntercomChannel
}

export async function renameIntercomChannel(id: string, name: string): Promise<void> {
  const trimmedName = name.trim()
  const { error } = await supabase
    .from('intercom_channels')
    .update({ name: trimmedName, is_program: trimmedName.toLowerCase() === 'program', updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deleteIntercomChannel(id: string): Promise<void> {
  const { error } = await supabase.from('intercom_channels').delete().eq('id', id)
  if (error) throw error
}

export async function saveRoleIntercomDefault(
  roleId: string,
  packType: IntercomPackTypeKey | null,
  channelStates: Record<string, IntercomChannelState>,
): Promise<void> {
  const { error: defaultError } = await supabase
    .from('role_intercom_defaults')
    .upsert({
      role_id: roleId,
      pack_type: packType,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'role_id' })
  if (defaultError) throw defaultError

  const { error: deleteError } = await supabase
    .from('role_intercom_default_channels')
    .delete()
    .eq('role_id', roleId)
  if (deleteError) throw deleteError

  const rows = Object.entries(channelStates)
    .filter(([, state]) => state.talk_mode || state.listen_mode || state.program_enabled)
    .map(([channelId, state]) => ({
    role_id: roleId,
    channel_id: channelId,
    button_mode: state.talk_mode,
    listen_mode: state.listen_mode,
    program_enabled: state.program_enabled,
  }))
  if (rows.length > 0) {
    const { error } = await supabase.from('role_intercom_default_channels').insert(rows)
    if (error) throw error
  }
}

function normalizedPersonKey(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

type IntercomPerson = Pick<AppUser, 'id' | 'name'>

export function buildModuleIntercomCrewIdentities(
  crew: WorkbookCrewMember[],
  users: IntercomPerson[],
  roles: CrewRole[],
): IntercomCrewIdentity[] {
  const grouped = new Map<string, IntercomCrewIdentity>()
  for (const member of [...crew].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))) {
    const key = member.user_id
      ? `user:${member.user_id}`
      : member.is_open
        ? `open:${member.id}`
        : `name:${normalizedPersonKey(member.person_name ?? 'unknown')}`
    const user = member.user_id ? users.find(item => item.id === member.user_id) : null
    const role = member.role_id ? roles.find(item => item.id === member.role_id) : null
    const name = member.is_open ? 'TBD' : (user?.name ?? member.person_name ?? 'Unknown')
    const existing = grouped.get(key) ?? {
      key,
      name,
      roleIds: [],
      roleNames: [],
      primaryRoleId: member.role_id,
      isOpen: member.is_open,
    }
    if (member.role_id && !existing.roleIds.includes(member.role_id)) existing.roleIds.push(member.role_id)
    if (role?.name && !existing.roleNames.includes(role.name)) existing.roleNames.push(role.name)
    grouped.set(key, existing)
  }

  return [...grouped.values()].sort((a, b) => {
    if (a.isOpen !== b.isOpen) return a.isOpen ? 1 : -1
    return a.name.localeCompare(b.name) || a.roleNames.join(', ').localeCompare(b.roleNames.join(', '))
  })
}
