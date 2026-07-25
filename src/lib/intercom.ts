import { supabase } from './supabase'
import type { AppUser } from './adminApi'
import type {
  CrewRole,
  IntercomButtonMode,
  IntercomChannel,
  IntercomPackType,
  IntercomPackTypeKey,
  RoleIntercomDefault,
  Session,
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
  button_mode: IntercomButtonMode
}

interface ChannelAssignmentRow {
  assignment_id: string
  event_channel_id: string
  button_mode: IntercomButtonMode
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

  const modesByRole = new Map<string, Record<string, IntercomButtonMode>>()
  for (const row of (defaultChannelResult.data ?? []) as DefaultChannelRow[]) {
    const modes = modesByRole.get(row.role_id) ?? {}
    modes[row.channel_id] = row.button_mode
    modesByRole.set(row.role_id, modes)
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
      channel_modes: modesByRole.get(row.role_id) ?? {},
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
  const { data, error } = await supabase
    .from('intercom_channels')
    .insert({ name: name.trim(), sort_order: sortOrder })
    .select('*')
    .single()
  if (error) throw error
  return data as IntercomChannel
}

export async function renameIntercomChannel(id: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('intercom_channels')
    .update({ name: name.trim(), updated_at: new Date().toISOString() })
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
  channelModes: Record<string, IntercomButtonMode>,
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

  const rows = Object.entries(channelModes).map(([channelId, mode]) => ({
    role_id: roleId,
    channel_id: channelId,
    button_mode: mode,
  }))
  if (rows.length > 0) {
    const { error } = await supabase.from('role_intercom_default_channels').insert(rows)
    if (error) throw error
  }
}

function normalizedPersonKey(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Crew explicitly assigned to the selected event plus workbook-wide crew.
 *
 * Eventless crew rows represent the workbook's shared roster. Their scheduled
 * date controls call-sheet timing, but should not hide them from an attached
 * event's Intercom Grid (especially when events are attached after the roster
 * was created).
 */
export function buildIntercomCrewIdentities(
  crew: WorkbookCrewMember[],
  event: Session,
  users: AppUser[],
  roles: CrewRole[],
): IntercomCrewIdentity[] {
  const relevant = crew
    .filter(member => member.event_id === event.id || !member.event_id)
    .sort((a, b) => {
      const aSpecific = a.event_id === event.id ? 0 : 1
      const bSpecific = b.event_id === event.id ? 0 : 1
      return aSpecific - bSpecific || a.sort_order - b.sort_order
    })

  const grouped = new Map<string, IntercomCrewIdentity>()
  for (const member of relevant) {
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

export async function loadWorkbookIntercomEvent(
  workbookId: string,
  eventId: string,
): Promise<WorkbookIntercomEventData> {
  const [channelResult, assignmentResult] = await Promise.all([
    supabase
      .from('workbook_intercom_channels')
      .select('*')
      .eq('workbook_id', workbookId)
      .eq('event_id', eventId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('workbook_intercom_assignments')
      .select('*')
      .eq('workbook_id', workbookId)
      .eq('event_id', eventId),
  ])
  if (channelResult.error) throw channelResult.error
  if (assignmentResult.error) throw assignmentResult.error

  const assignments = (assignmentResult.data ?? []) as Array<Omit<WorkbookIntercomAssignment, 'channel_modes'>>
  const assignmentIds = assignments.map(assignment => assignment.id)
  let modeRows: ChannelAssignmentRow[] = []
  if (assignmentIds.length > 0) {
    const { data, error } = await supabase
      .from('workbook_intercom_channel_assignments')
      .select('*')
      .in('assignment_id', assignmentIds)
    if (error) throw error
    modeRows = (data ?? []) as ChannelAssignmentRow[]
  }

  const modesByAssignment = new Map<string, Record<string, IntercomButtonMode>>()
  for (const row of modeRows) {
    const modes = modesByAssignment.get(row.assignment_id) ?? {}
    modes[row.event_channel_id] = row.button_mode
    modesByAssignment.set(row.assignment_id, modes)
  }

  return {
    channels: (channelResult.data ?? []) as WorkbookIntercomChannel[],
    assignments: assignments.map(assignment => ({
      ...assignment,
      channel_modes: modesByAssignment.get(assignment.id) ?? {},
    })),
  }
}

async function initializeEventChannels(
  workbookId: string,
  eventId: string,
  masterChannels: IntercomChannel[],
): Promise<void> {
  const { count, error } = await supabase
    .from('workbook_intercom_channels')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)
  if (error) throw error
  if ((count ?? 0) > 0 || masterChannels.length === 0) return

  const { error: insertError } = await supabase
    .from('workbook_intercom_channels')
    .insert(masterChannels.map((channel, index) => ({
      workbook_id: workbookId,
      event_id: eventId,
      master_channel_id: channel.id,
      name: channel.name,
      sort_order: index,
    })))
  if (insertError) throw insertError
}

async function ensureCrewAssignments(
  workbookId: string,
  eventId: string,
  identities: IntercomCrewIdentity[],
  eventChannels: WorkbookIntercomChannel[],
  defaults: RoleIntercomDefault[],
): Promise<void> {
  if (identities.length === 0) return
  const { data, error } = await supabase
    .from('workbook_intercom_assignments')
    .select('crew_key')
    .eq('event_id', eventId)
  if (error) throw error
  const existing = new Set(((data ?? []) as Array<{ crew_key: string }>).map(row => row.crew_key))
  const missing = identities.filter(identity => !existing.has(identity.key))
  if (missing.length === 0) return

  const defaultByRole = new Map(defaults.map(item => [item.role_id, item]))
  const { data: inserted, error: insertError } = await supabase
    .from('workbook_intercom_assignments')
    .insert(missing.map(identity => {
      const roleDefault = identity.primaryRoleId ? defaultByRole.get(identity.primaryRoleId) : null
      return {
        workbook_id: workbookId,
        event_id: eventId,
        crew_key: identity.key,
        role_id: identity.primaryRoleId,
        pack_type: roleDefault?.pack_type ?? null,
      }
    }))
    .select('*')
  if (insertError) throw insertError

  const eventChannelByMaster = new Map(
    eventChannels
      .filter(channel => channel.master_channel_id)
      .map(channel => [channel.master_channel_id as string, channel.id]),
  )
  const identityByKey = new Map(missing.map(identity => [identity.key, identity]))
  const defaultModeRows: Array<{
    assignment_id: string
    event_channel_id: string
    button_mode: IntercomButtonMode
  }> = []
  for (const assignment of (inserted ?? []) as Array<{ id: string; crew_key: string }>) {
    const identity = identityByKey.get(assignment.crew_key)
    const roleDefault = identity?.primaryRoleId ? defaultByRole.get(identity.primaryRoleId) : null
    if (!roleDefault?.pack_type) continue
    for (const [masterChannelId, mode] of Object.entries(roleDefault.channel_modes)) {
      const eventChannelId = eventChannelByMaster.get(masterChannelId)
      if (eventChannelId) {
        defaultModeRows.push({
          assignment_id: assignment.id,
          event_channel_id: eventChannelId,
          button_mode: mode,
        })
      }
    }
  }
  if (defaultModeRows.length > 0) {
    const { error: modeError } = await supabase
      .from('workbook_intercom_channel_assignments')
      .insert(defaultModeRows)
    if (modeError) throw modeError
  }
}

/**
 * First visit copies the master columns and the role defaults. Existing event
 * assignments are never overwritten, so later config changes only affect new
 * event grids and newly-added crew.
 */
export async function prepareWorkbookIntercomEvent(
  workbookId: string,
  eventId: string,
  identities: IntercomCrewIdentity[],
  config: IntercomConfig,
): Promise<WorkbookIntercomEventData> {
  await initializeEventChannels(workbookId, eventId, config.masterChannels)
  const initial = await loadWorkbookIntercomEvent(workbookId, eventId)
  await ensureCrewAssignments(workbookId, eventId, identities, initial.channels, config.roleDefaults)
  return loadWorkbookIntercomEvent(workbookId, eventId)
}

export async function setIntercomPackType(
  assignmentId: string,
  packType: IntercomPackTypeKey | null,
): Promise<void> {
  const { error } = await supabase
    .from('workbook_intercom_assignments')
    .update({ pack_type: packType, updated_at: new Date().toISOString() })
    .eq('id', assignmentId)
  if (error) throw error
  if (!packType) {
    const { error: clearError } = await supabase
      .from('workbook_intercom_channel_assignments')
      .delete()
      .eq('assignment_id', assignmentId)
    if (clearError) throw clearError
  }
}

export async function setIntercomChannelMode(
  assignmentId: string,
  eventChannelId: string,
  mode: IntercomButtonMode | null,
): Promise<void> {
  if (!mode) {
    const { error } = await supabase
      .from('workbook_intercom_channel_assignments')
      .delete()
      .eq('assignment_id', assignmentId)
      .eq('event_channel_id', eventChannelId)
    if (error) throw error
    return
  }
  const { error } = await supabase
    .from('workbook_intercom_channel_assignments')
    .upsert({
      assignment_id: assignmentId,
      event_channel_id: eventChannelId,
      button_mode: mode,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'assignment_id,event_channel_id' })
  if (error) throw error
}

export async function addMasterChannelToEvent(
  workbookId: string,
  eventId: string,
  channel: IntercomChannel,
  sortOrder: number,
): Promise<void> {
  const { error } = await supabase
    .from('workbook_intercom_channels')
    .insert({
      workbook_id: workbookId,
      event_id: eventId,
      master_channel_id: channel.id,
      name: channel.name,
      sort_order: sortOrder,
    })
  if (error) throw error
}

export async function addEventIntercomChannel(
  workbookId: string,
  eventId: string,
  name: string,
  sortOrder: number,
): Promise<void> {
  const { error } = await supabase
    .from('workbook_intercom_channels')
    .insert({
      workbook_id: workbookId,
      event_id: eventId,
      master_channel_id: null,
      name: name.trim(),
      sort_order: sortOrder,
    })
  if (error) throw error
}

export async function deleteEventIntercomChannel(id: string): Promise<void> {
  const { error } = await supabase.from('workbook_intercom_channels').delete().eq('id', id)
  if (error) throw error
}
