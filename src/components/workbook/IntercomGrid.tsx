import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, Loader2, Plus, RadioTower, Trash2 } from 'lucide-react'
import { Card } from '../ui/Card'
import {
  buildModuleIntercomCrewIdentities,
  type WorkbookIntercomEventData,
} from '../../lib/intercom'
import {
  addModuleIntercomChannel,
  deleteModuleIntercomChannel,
  setModuleIntercomChannelState,
  setModuleIntercomPack,
} from '../../lib/moduleContent'
import type {
  CrewRole,
  IntercomButtonMode,
  IntercomChannel,
  IntercomChannelState,
  IntercomListenMode,
  IntercomPackType,
  IntercomPackTypeKey,
  ModulePerson,
  WorkbookCrewMember,
  WorkbookIntercomAssignment,
} from '../../types'

interface IntercomGridProps {
  moduleId: string
  contextLabel: string
  users: ModulePerson[]
  roles: CrewRole[]
  crew: WorkbookCrewMember[]
  initialData: WorkbookIntercomEventData
  packTypes: IntercomPackType[]
  masterChannels: IntercomChannel[]
  editable: boolean
  sessionToken: string
  onChanged: () => Promise<void>
}

function emptyChannelState(): IntercomChannelState {
  return { talk_mode: null, listen_mode: null, program_enabled: false }
}

function nextTalkMode(mode: IntercomButtonMode | null): IntercomButtonMode | null {
  if (!mode) return 'momentary'
  if (mode === 'momentary') return 'latch'
  if (mode === 'latch') return 'latch_momentary'
  return null
}

function nextListenMode(mode: IntercomListenMode | null): IntercomListenMode | null {
  if (!mode) return 'listen'
  if (mode === 'listen') return 'listen_on_talk'
  return null
}

function talkModeClass(mode: IntercomButtonMode | null) {
  if (mode === 'momentary') return 'border-blue-300 bg-blue-100 text-blue-800'
  if (mode === 'latch') return 'border-violet-300 bg-violet-100 text-violet-800'
  if (mode === 'latch_momentary') return 'border-emerald-300 bg-emerald-100 text-emerald-800'
  return 'border-gray-200 bg-white text-gray-300 hover:border-gray-300 hover:text-gray-500'
}

function listenModeClass(mode: IntercomListenMode | null) {
  if (mode === 'listen') return 'border-cyan-300 bg-cyan-100 text-cyan-800'
  if (mode === 'listen_on_talk') return 'border-orange-300 bg-orange-100 text-orange-800'
  return 'border-gray-200 bg-white text-gray-300 hover:border-gray-300 hover:text-gray-500'
}

function talkModeLabel(mode: IntercomButtonMode | null) {
  if (mode === 'momentary') return 'M'
  if (mode === 'latch') return 'L'
  if (mode === 'latch_momentary') return 'LM'
  return 'Off'
}

function listenModeLabel(mode: IntercomListenMode | null) {
  if (mode === 'listen') return 'Listen'
  if (mode === 'listen_on_talk') return 'On Talk'
  return 'Off'
}

function avatar(name: string, isOpen: boolean) {
  const initials = isOpen ? '?' : name.split(' ').map(part => part[0]).slice(0, 2).join('').toUpperCase()
  return (
    <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
      isOpen ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
    }`}>
      {initials}
    </span>
  )
}

const GRID_NUMBER_WIDTH = 48
const GRID_CREW_WIDTH = 192
const GRID_ROLE_WIDTH = 192
const GRID_PACK_WIDTH = 128
const GRID_CHANNEL_MIN_WIDTH = 168
const GRID_TOTAL_WIDTH = 96
const GRID_FIXED_WIDTH = GRID_NUMBER_WIDTH
  + GRID_CREW_WIDTH
  + GRID_ROLE_WIDTH
  + GRID_PACK_WIDTH
  + GRID_TOTAL_WIDTH

export function IntercomGrid({ moduleId, contextLabel, users, roles, crew, initialData, packTypes, masterChannels, editable, sessionToken, onChanged }: IntercomGridProps) {
  const [data, setData] = useState<WorkbookIntercomEventData>(initialData)
  const [error, setError] = useState('')
  const [savingKey, setSavingKey] = useState('')
  const [unusedMasterId, setUnusedMasterId] = useState('')
  const [eventChannelName, setEventChannelName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const identities = useMemo(
    () => buildModuleIntercomCrewIdentities(crew, users, roles),
    [crew, roles, users],
  )
  useEffect(() => setData(initialData), [initialData])

  const assignmentByCrew = useMemo(
    () => new Map(data.assignments.map(assignment => [assignment.crew_key, assignment])),
    [data.assignments],
  )
  const unusedMasterChannels = masterChannels.filter(master =>
    !data.channels.some(channel => channel.master_channel_id === master.id),
  )
  const usage = packTypes.map(pack => ({
    ...pack,
    used: data.assignments.filter(assignment => assignment.pack_type === pack.key && identities.some(identity => identity.key === assignment.crew_key)).length,
  }))
  const gridWidth = GRID_FIXED_WIDTH + data.channels.length * GRID_CHANNEL_MIN_WIDTH

  async function changePack(assignment: WorkbookIntercomAssignment, packType: IntercomPackTypeKey | null) {
    if (!editable) return
    const key = `pack:${assignment.id}`
    setSavingKey(key)
    setError('')
    setData(current => ({
      ...current,
      assignments: current.assignments.map(item => item.id === assignment.id
        ? { ...item, pack_type: packType, channel_states: packType ? item.channel_states : {} }
        : item),
    }))
    try {
      await setModuleIntercomPack(sessionToken, moduleId, assignment.id, packType)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update the pack type.')
      await onChanged()
    } finally {
      setSavingKey('')
    }
  }

  async function changeChannelState(
    assignment: WorkbookIntercomAssignment,
    channelId: string,
    nextState: IntercomChannelState,
  ) {
    if (!editable || !assignment.pack_type) return
    const key = `channel:${assignment.id}:${channelId}`
    setSavingKey(key)
    setError('')
    setData(current => ({
      ...current,
      assignments: current.assignments.map(item => {
        if (item.id !== assignment.id) return item
        const states = { ...item.channel_states }
        if (nextState.talk_mode || nextState.listen_mode || nextState.program_enabled) states[channelId] = nextState
        else delete states[channelId]
        return { ...item, channel_states: states }
      }),
    }))
    try {
      await setModuleIntercomChannelState(sessionToken, moduleId, assignment.id, channelId, nextState)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update the channel.')
      await onChanged()
    } finally {
      setSavingKey('')
    }
  }

  async function addMasterColumn() {
    if (!editable || !unusedMasterId) return
    const master = masterChannels.find(channel => channel.id === unusedMasterId)
    if (!master) return
    setSavingKey('add-channel')
    setError('')
    try {
      await addModuleIntercomChannel(sessionToken, moduleId, { masterChannelId: master.id, name: master.name })
      setUnusedMasterId('')
      await onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add the channel.')
    } finally {
      setSavingKey('')
    }
  }

  async function addEventColumn() {
    if (!editable || !eventChannelName.trim()) return
    setSavingKey('add-channel')
    setError('')
    try {
      await addModuleIntercomChannel(sessionToken, moduleId, { masterChannelId: null, name: eventChannelName })
      setEventChannelName('')
      await onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add the event channel.')
    } finally {
      setSavingKey('')
    }
  }

  async function removeChannel(channelId: string) {
    if (!editable) return
    setSavingKey(`delete:${channelId}`)
    setError('')
    try {
      await deleteModuleIntercomChannel(sessionToken, moduleId, channelId)
      setConfirmDelete(null)
      await onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove the channel.')
    } finally {
      setSavingKey('')
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-bold text-gray-900">
              <RadioTower className="h-4 w-4 text-blue-600" /> Intercom Grid
            </p>
            <p className="mt-1 max-w-2xl text-xs text-gray-500">
              {editable
                ? 'Assign packs, talk-button behavior, and independent listen behavior. Program is an on/off audio feed. Role defaults are copied once and remain editable here.'
                : 'Review each event crew member’s intercom pack and channel assignments.'}
            </p>
            <p className="mt-1 text-[11px] font-medium text-gray-400">{contextLabel}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-4">
          {usage.map(pack => {
            const over = pack.used > pack.available_count
            return (
              <span key={pack.key} className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${
                over ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-700'
              }`}>
                {over && <AlertTriangle className="h-3.5 w-3.5" />}
                {pack.label}: {pack.used} / {pack.available_count}
              </span>
            )
          })}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">M · Momentary</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700">L · Latch</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">LM · Latch/Momentary</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-700">Listen</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-700">Listen on Talk</span>
        </div>
      </Card>

      {!editable && error && (
        <p className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          <AlertTriangle className="h-3.5 w-3.5" /> {error}
        </p>
      )}

      <div style={{ width: `min(100%, ${gridWidth}px)` }}>
        <Card className="overflow-hidden">
          {identities.length === 0 ? (
            <div className="p-10 text-center text-sm text-gray-400">
              No Crew module assignments are available yet. Add crew in this owner&apos;s Crew module first.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table
                className="table-fixed border-collapse text-sm"
                style={{ width: gridWidth, minWidth: gridWidth }}>
              <colgroup>
                <col style={{ width: GRID_NUMBER_WIDTH }} />
                <col style={{ width: GRID_CREW_WIDTH }} />
                <col style={{ width: GRID_ROLE_WIDTH }} />
                <col style={{ width: GRID_PACK_WIDTH }} />
                {data.channels.map(channel => (
                  <col
                    key={channel.id}
                    style={{ width: GRID_CHANNEL_MIN_WIDTH }}
                  />
                ))}
                <col style={{ width: GRID_TOTAL_WIDTH }} />
              </colgroup>
              <thead>
                <tr className="border-b border-gray-200 bg-gray-100 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                  <th className="sticky left-0 z-20 w-12 border-r border-gray-200 bg-gray-100 px-2 py-3 text-center">#</th>
                  <th className="sticky left-12 z-20 w-48 border-r border-gray-200 bg-gray-100 px-3 py-3 text-left">Crew member</th>
                  <th className="sticky left-60 z-20 w-48 border-r border-gray-200 bg-gray-100 px-3 py-3 text-left">Role</th>
                  <th className="sticky left-[27rem] z-20 w-32 border-r border-gray-200 bg-gray-100 px-3 py-3 text-left">Com pack</th>
                  {data.channels.map(channel => (
                    <th key={channel.id} className="border-r border-gray-200 px-2 py-2 text-center">
                      <div className="flex min-w-0 items-center justify-center gap-1 overflow-hidden">
                        <span className="min-w-0 truncate normal-case tracking-normal text-gray-700">{channel.name}</span>
                        {channel.is_program && <span className="rounded bg-amber-100 px-1 py-0.5 text-[8px] tracking-normal text-amber-700">Feed</span>}
                        {!editable ? null : confirmDelete === channel.id ? (
                          <button
                            onClick={() => void removeChannel(channel.id)}
                            className="flex-shrink-0 rounded bg-red-600 px-1.5 py-0.5 text-[9px] font-bold text-white">
                            Remove?
                          </button>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(channel.id)}
                            className="flex-shrink-0 rounded p-0.5 text-gray-300 hover:bg-red-50 hover:text-red-500"
                            aria-label={`Remove ${channel.name} from this event`}>
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </th>
                  ))}
                  <th className="min-w-24 px-3 py-3 text-center">Total channels</th>
                </tr>
              </thead>
              <tbody>
                {identities.map((identity, index) => {
                  const assignment = assignmentByCrew.get(identity.key)
                  const total = assignment?.pack_type
                    ? Object.values(assignment.channel_states).filter(state => state.talk_mode || state.listen_mode || state.program_enabled).length
                    : 0
                  return (
                    <tr key={identity.key} className="border-b border-gray-100 last:border-0 hover:bg-blue-50/30">
                      <td className="sticky left-0 z-10 border-r border-gray-100 bg-white px-2 py-2.5 text-center font-mono text-xs text-gray-400">{index + 1}</td>
                      <td className="sticky left-12 z-10 border-r border-gray-100 bg-white px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          {avatar(identity.name, identity.isOpen)}
                          <span className="font-semibold text-gray-900">
                            {identity.name}
                            {identity.isOpen && <span className="ml-1.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-700">Open</span>}
                          </span>
                        </div>
                      </td>
                      <td className="sticky left-60 z-10 border-r border-gray-100 bg-white px-3 py-2.5 text-xs text-gray-600">
                        {identity.roleNames.length ? identity.roleNames.join(' / ') : '—'}
                      </td>
                      <td className="sticky left-[27rem] z-10 border-r border-gray-100 bg-white px-2 py-2">
                        {assignment ? (
                          editable ? <div className="relative">
                            <select
                              value={assignment.pack_type ?? ''}
                              onChange={event => void changePack(assignment, (event.target.value || null) as IntercomPackTypeKey | null)}
                              className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs font-semibold text-gray-700 focus:border-blue-500 focus:outline-none">
                              <option value="">No intercom</option>
                              {packTypes.map(pack => <option key={pack.key} value={pack.key}>{pack.label}</option>)}
                            </select>
                            {savingKey === `pack:${assignment.id}` && <Loader2 className="absolute right-7 top-2 h-3 w-3 animate-spin text-blue-500" />}
                          </div> : (
                            <span className="block px-2 py-1.5 text-xs font-semibold text-gray-700">
                              {assignment.pack_type
                                ? packTypes.find(pack => pack.key === assignment.pack_type)?.label ?? assignment.pack_type
                                : 'No intercom'}
                            </span>
                          )
                        ) : <span className="text-xs text-gray-300">Preparing…</span>}
                      </td>
                      {data.channels.map(channel => {
                        const state = assignment?.channel_states[channel.id] ?? emptyChannelState()
                        const key = assignment ? `channel:${assignment.id}:${channel.id}` : ''
                        const disabled = !assignment?.pack_type || savingKey === key
                        return (
                          <td key={channel.id} className="border-r border-gray-100 px-2 py-2 text-center">
                            {channel.is_program ? (
                              editable ? (
                                <button
                                  type="button"
                                  disabled={disabled}
                                  onClick={() => assignment && void changeChannelState(assignment, channel.id, {
                                    talk_mode: null,
                                    listen_mode: null,
                                    program_enabled: !state.program_enabled,
                                  })}
                                  className={`mx-auto inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
                                    state.program_enabled
                                      ? 'border-amber-300 bg-amber-100 text-amber-800'
                                      : 'border-gray-200 bg-white text-gray-400 hover:border-gray-300'
                                  }`}
                                  aria-label={`${identity.name}, Program feed: ${state.program_enabled ? 'on' : 'off'}`}>
                                  {savingKey === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (
                                    <span className={`flex h-4 w-4 items-center justify-center rounded border ${state.program_enabled ? 'border-amber-600 bg-amber-600 text-white' : 'border-gray-300 bg-white'}`}>
                                      {state.program_enabled && <Check className="h-3 w-3" />}
                                    </span>
                                  )}
                                  Feed
                                </button>
                              ) : (
                                <span className={`mx-auto inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold ${state.program_enabled ? 'border-amber-300 bg-amber-100 text-amber-800' : 'border-gray-200 text-gray-300'}`}>
                                  <span className={`flex h-4 w-4 items-center justify-center rounded border ${state.program_enabled ? 'border-amber-600 bg-amber-600 text-white' : 'border-gray-300 bg-white'}`}>
                                    {state.program_enabled && <Check className="h-3 w-3" />}
                                  </span>
                                  Feed
                                </span>
                              )
                            ) : (
                              <div className="space-y-1">
                                {editable ? (
                                  <>
                                    <button
                                      type="button"
                                      disabled={disabled}
                                      onClick={() => assignment && void changeChannelState(assignment, channel.id, {
                                        ...state,
                                        talk_mode: nextTalkMode(state.talk_mode),
                                        program_enabled: false,
                                      })}
                                      className={`flex w-full items-center justify-between rounded-md border px-2 py-1 text-[10px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${talkModeClass(state.talk_mode)}`}
                                      aria-label={`${identity.name}, ${channel.name} talk: ${state.talk_mode ?? 'off'}`}>
                                      <span>Talk</span><span>{savingKey === key ? '…' : talkModeLabel(state.talk_mode)}</span>
                                    </button>
                                    <button
                                      type="button"
                                      disabled={disabled}
                                      onClick={() => assignment && void changeChannelState(assignment, channel.id, {
                                        ...state,
                                        listen_mode: nextListenMode(state.listen_mode),
                                        program_enabled: false,
                                      })}
                                      className={`flex w-full items-center justify-between rounded-md border px-2 py-1 text-[10px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${listenModeClass(state.listen_mode)}`}
                                      aria-label={`${identity.name}, ${channel.name} listen: ${state.listen_mode ?? 'off'}`}>
                                      <span>Listen</span><span>{savingKey === key ? '…' : listenModeLabel(state.listen_mode)}</span>
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <span className={`flex w-full items-center justify-between rounded-md border px-2 py-1 text-[10px] font-bold ${talkModeClass(state.talk_mode)}`}>
                                      <span>Talk</span><span>{talkModeLabel(state.talk_mode)}</span>
                                    </span>
                                    <span className={`flex w-full items-center justify-between rounded-md border px-2 py-1 text-[10px] font-bold ${listenModeClass(state.listen_mode)}`}>
                                      <span>Listen</span><span>{listenModeLabel(state.listen_mode)}</span>
                                    </span>
                                  </>
                                )}
                              </div>
                            )}
                          </td>
                        )
                      })}
                      <td className="px-3 py-2.5 text-center font-mono font-semibold text-gray-700">{total}</td>
                    </tr>
                  )
                })}
              </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {editable && <Card className="p-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Add from master list</p>
            <div className="mt-2 flex gap-2">
              <select
                value={unusedMasterId}
                onChange={event => setUnusedMasterId(event.target.value)}
                disabled={unusedMasterChannels.length === 0}
                className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-50">
                <option value="">{unusedMasterChannels.length ? 'Choose a master channel' : 'All master channels are present'}</option>
                {unusedMasterChannels.map(channel => <option key={channel.id} value={channel.id}>{channel.name}</option>)}
              </select>
              <button
                onClick={() => void addMasterColumn()}
                disabled={!unusedMasterId || savingKey === 'add-channel'}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40">
                <Plus className="h-4 w-4" /> Add
              </button>
            </div>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Add only to this module</p>
            <div className="mt-2 flex gap-2">
              <input
                value={eventChannelName}
                onChange={event => setEventChannelName(event.target.value)}
                onKeyDown={event => { if (event.key === 'Enter' && eventChannelName.trim()) void addEventColumn() }}
                placeholder="Module channel, e.g. Translation"
                className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
              <button
                onClick={() => void addEventColumn()}
                disabled={!eventChannelName.trim() || savingKey === 'add-channel'}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40">
                {savingKey === 'add-channel' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
              </button>
            </div>
          </div>
        </div>
        {error && (
          <p className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            <AlertTriangle className="h-3.5 w-3.5" /> {error}
          </p>
        )}
        {!error && data.channels.length > 0 && (
          <p className="mt-3 flex items-center gap-2 text-xs text-gray-400">
            <Check className="h-3.5 w-3.5 text-emerald-500" /> Changes save immediately. Removing a column affects only this module.
          </p>
        )}
      </Card>}
    </div>
  )
}
