import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, Loader2, Plus, RadioTower, Trash2 } from 'lucide-react'
import { Card } from '../ui/Card'
import {
  addEventIntercomChannel,
  addMasterChannelToEvent,
  buildIntercomCrewIdentities,
  deleteEventIntercomChannel,
  loadIntercomConfig,
  prepareWorkbookIntercomEvent,
  setIntercomChannelMode,
  setIntercomPackType,
  type IntercomConfig,
  type WorkbookIntercomEventData,
} from '../../lib/intercom'
import type { AppUser } from '../../lib/adminApi'
import type {
  CrewRole,
  IntercomButtonMode,
  IntercomPackTypeKey,
  Session,
  Workbook,
  WorkbookCrewMember,
  WorkbookIntercomAssignment,
} from '../../types'

interface IntercomGridProps {
  workbook: Workbook
  linkedEvents: Session[]
  users: AppUser[]
  roles: CrewRole[]
  crew: WorkbookCrewMember[]
}

function formatEvent(event: Session) {
  const day = new Date(`${event.date}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
  return `${day} · ${event.name}`
}

function nextMode(mode: IntercomButtonMode | null): IntercomButtonMode | null {
  if (!mode) return 'momentary'
  if (mode === 'momentary') return 'latch'
  return null
}

function modeClass(mode: IntercomButtonMode | null) {
  if (mode === 'momentary') return 'border-blue-300 bg-blue-100 text-blue-800'
  if (mode === 'latch') return 'border-violet-300 bg-violet-100 text-violet-800'
  return 'border-gray-200 bg-white text-gray-300 hover:border-gray-300 hover:text-gray-500'
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

export function IntercomGrid({ workbook, linkedEvents, users, roles, crew }: IntercomGridProps) {
  const sortedEvents = useMemo(
    () => [...linkedEvents].sort((a, b) => a.date.localeCompare(b.date) || (a.eventTime ?? '').localeCompare(b.eventTime ?? '')),
    [linkedEvents],
  )
  const [selectedEventId, setSelectedEventId] = useState('')
  const [config, setConfig] = useState<IntercomConfig | null>(null)
  const [data, setData] = useState<WorkbookIntercomEventData>({ channels: [], assignments: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingKey, setSavingKey] = useState('')
  const [unusedMasterId, setUnusedMasterId] = useState('')
  const [eventChannelName, setEventChannelName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const selectedEvent = sortedEvents.find(event => event.id === selectedEventId) ?? null
  const identities = useMemo(
    () => selectedEvent ? buildIntercomCrewIdentities(crew, selectedEvent, users, roles) : [],
    [crew, roles, selectedEvent, users],
  )
  const identityKey = identities.map(identity => `${identity.key}:${identity.primaryRoleId ?? ''}`).join('|')

  useEffect(() => {
    if (sortedEvents.some(event => event.id === selectedEventId)) return
    setSelectedEventId(sortedEvents[0]?.id ?? '')
  }, [selectedEventId, sortedEvents])

  useEffect(() => {
    let active = true
    setLoading(true)
    loadIntercomConfig()
      .then(next => { if (active) setConfig(next) })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : 'Unable to load Intercom configuration.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [workbook.id])

  const reload = useCallback(async () => {
    if (!selectedEvent || !config) return
    setLoading(true)
    setError('')
    try {
      const next = await prepareWorkbookIntercomEvent(workbook.id, selectedEvent.id, identities, config)
      setData(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load the Intercom Grid.')
    } finally {
      setLoading(false)
    }
    // identities captured through identityKey so new roster rows get seeded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, identityKey, selectedEvent, workbook.id])

  useEffect(() => { void reload() }, [reload])

  const assignmentByCrew = useMemo(
    () => new Map(data.assignments.map(assignment => [assignment.crew_key, assignment])),
    [data.assignments],
  )
  const unusedMasterChannels = (config?.masterChannels ?? []).filter(master =>
    !data.channels.some(channel => channel.master_channel_id === master.id),
  )
  const usage = (config?.packTypes ?? []).map(pack => ({
    ...pack,
    used: data.assignments.filter(assignment => assignment.pack_type === pack.key && identities.some(identity => identity.key === assignment.crew_key)).length,
  }))

  async function changePack(assignment: WorkbookIntercomAssignment, packType: IntercomPackTypeKey | null) {
    const key = `pack:${assignment.id}`
    setSavingKey(key)
    setError('')
    setData(current => ({
      ...current,
      assignments: current.assignments.map(item => item.id === assignment.id
        ? { ...item, pack_type: packType, channel_modes: packType ? item.channel_modes : {} }
        : item),
    }))
    try {
      await setIntercomPackType(assignment.id, packType)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update the pack type.')
      await reload()
    } finally {
      setSavingKey('')
    }
  }

  async function cycleChannel(assignment: WorkbookIntercomAssignment, channelId: string) {
    if (!assignment.pack_type) return
    const currentMode = assignment.channel_modes[channelId] ?? null
    const next = nextMode(currentMode)
    const key = `channel:${assignment.id}:${channelId}`
    setSavingKey(key)
    setError('')
    setData(current => ({
      ...current,
      assignments: current.assignments.map(item => {
        if (item.id !== assignment.id) return item
        const modes = { ...item.channel_modes }
        if (next) modes[channelId] = next
        else delete modes[channelId]
        return { ...item, channel_modes: modes }
      }),
    }))
    try {
      await setIntercomChannelMode(assignment.id, channelId, next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update the channel.')
      await reload()
    } finally {
      setSavingKey('')
    }
  }

  async function addMasterColumn() {
    if (!selectedEvent || !config || !unusedMasterId) return
    const master = config.masterChannels.find(channel => channel.id === unusedMasterId)
    if (!master) return
    setSavingKey('add-channel')
    setError('')
    try {
      await addMasterChannelToEvent(workbook.id, selectedEvent.id, master, data.channels.length)
      setUnusedMasterId('')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add the channel.')
    } finally {
      setSavingKey('')
    }
  }

  async function addEventColumn() {
    if (!selectedEvent || !eventChannelName.trim()) return
    setSavingKey('add-channel')
    setError('')
    try {
      await addEventIntercomChannel(workbook.id, selectedEvent.id, eventChannelName, data.channels.length)
      setEventChannelName('')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add the event channel.')
    } finally {
      setSavingKey('')
    }
  }

  async function removeChannel(channelId: string) {
    setSavingKey(`delete:${channelId}`)
    setError('')
    try {
      await deleteEventIntercomChannel(channelId)
      setConfirmDelete(null)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove the channel.')
    } finally {
      setSavingKey('')
    }
  }

  if (sortedEvents.length === 0) {
    return (
      <Card className="p-8 text-center">
        <RadioTower className="mx-auto h-7 w-7 text-gray-300" />
        <p className="mt-3 text-sm font-semibold text-gray-700">Attach an event first</p>
        <p className="mt-1 text-xs text-gray-400">Intercom assignments are event-specific, so the grid needs at least one workbook event.</p>
      </Card>
    )
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
              Assign each event crew member a wired or wireless pack, then click channel cells to cycle
              Off → Momentary → Latch. Role defaults are copied once and remain editable here.
            </p>
          </div>
          <label className="w-full xl:w-80">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Event</span>
            <select
              value={selectedEventId}
              onChange={event => setSelectedEventId(event.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
              {sortedEvents.map(event => <option key={event.id} value={event.id}>{formatEvent(event)}</option>)}
            </select>
          </label>
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
        </div>
      </Card>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Preparing event grid…
          </div>
        ) : identities.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-400">
            No crew are assigned to this event or its day yet. Add them in the Crew tab first.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm" style={{ minWidth: 590 + data.channels.length * 112 }}>
              <thead>
                <tr className="border-b border-gray-200 bg-gray-100 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                  <th className="sticky left-0 z-20 w-12 border-r border-gray-200 bg-gray-100 px-2 py-3 text-center">#</th>
                  <th className="sticky left-12 z-20 w-48 border-r border-gray-200 bg-gray-100 px-3 py-3 text-left">Crew member</th>
                  <th className="sticky left-60 z-20 w-48 border-r border-gray-200 bg-gray-100 px-3 py-3 text-left">Role</th>
                  <th className="sticky left-[27rem] z-20 w-32 border-r border-gray-200 bg-gray-100 px-3 py-3 text-left">Com pack</th>
                  {data.channels.map(channel => (
                    <th key={channel.id} className="min-w-28 border-r border-gray-200 px-2 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <span className="normal-case tracking-normal text-gray-700">{channel.name}</span>
                        {confirmDelete === channel.id ? (
                          <button
                            onClick={() => void removeChannel(channel.id)}
                            className="rounded bg-red-600 px-1.5 py-0.5 text-[9px] font-bold text-white">
                            Remove?
                          </button>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(channel.id)}
                            className="rounded p-0.5 text-gray-300 hover:bg-red-50 hover:text-red-500"
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
                  const total = assignment?.pack_type ? Object.keys(assignment.channel_modes).length : 0
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
                          <div className="relative">
                            <select
                              value={assignment.pack_type ?? ''}
                              onChange={event => void changePack(assignment, (event.target.value || null) as IntercomPackTypeKey | null)}
                              className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs font-semibold text-gray-700 focus:border-blue-500 focus:outline-none">
                              <option value="">No intercom</option>
                              {(config?.packTypes ?? []).map(pack => <option key={pack.key} value={pack.key}>{pack.label}</option>)}
                            </select>
                            {savingKey === `pack:${assignment.id}` && <Loader2 className="absolute right-7 top-2 h-3 w-3 animate-spin text-blue-500" />}
                          </div>
                        ) : <span className="text-xs text-gray-300">Preparing…</span>}
                      </td>
                      {data.channels.map(channel => {
                        const mode = assignment?.channel_modes[channel.id] ?? null
                        const key = assignment ? `channel:${assignment.id}:${channel.id}` : ''
                        return (
                          <td key={channel.id} className="border-r border-gray-100 px-2 py-2 text-center">
                            <button
                              type="button"
                              disabled={!assignment?.pack_type || savingKey === key}
                              onClick={() => assignment && void cycleChannel(assignment, channel.id)}
                              className={`mx-auto flex h-8 w-9 items-center justify-center rounded-lg border text-xs font-black transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${modeClass(mode)}`}
                              aria-label={`${identity.name}, ${channel.name}: ${mode ?? 'off'}`}>
                              {savingKey === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : mode === 'momentary' ? 'M' : mode === 'latch' ? 'L' : ''}
                            </button>
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

      <Card className="p-4">
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
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Add only to this event</p>
            <div className="mt-2 flex gap-2">
              <input
                value={eventChannelName}
                onChange={event => setEventChannelName(event.target.value)}
                onKeyDown={event => { if (event.key === 'Enter' && eventChannelName.trim()) void addEventColumn() }}
                placeholder="Event channel, e.g. Translation"
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
            <Check className="h-3.5 w-3.5 text-emerald-500" /> Changes save immediately. Removing a column affects only this event.
          </p>
        )}
      </Card>
    </div>
  )
}
