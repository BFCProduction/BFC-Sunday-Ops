import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { Check, GripVertical, Loader2, MapPin, Pencil, Plus, RadioTower, Save, Tag, Trash2, Users, X } from 'lucide-react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Card } from '../ui/Card'
import type {
  CrewRole,
  Department,
  IntercomButtonMode,
  IntercomPackTypeKey,
  Location,
  ScheduleItemType,
} from '../../types'
import {
  loadLocations, createLocation, renameLocation, deleteLocation, reorderLocations,
  loadDepartments, createDepartment, renameDepartment, deleteDepartment, reorderDepartments,
  loadScheduleItemTypes, createScheduleItemType, renameScheduleItemType, deleteScheduleItemType, reorderScheduleItemTypes,
  loadRoles, createRole, updateRole, deleteRole, reorderRoles,
  type RoleInput,
} from '../../lib/productionConfig'
import {
  createIntercomChannel,
  deleteIntercomChannel,
  loadIntercomConfig,
  renameIntercomChannel,
  saveRoleIntercomDefault,
  updateIntercomPackCapacity,
  type IntercomConfig,
} from '../../lib/intercom'

interface NamedRow { id: string; name: string }

function nextSortOrder(rows: Array<{ sort_order: number }>) {
  return rows.length > 0 ? Math.max(...rows.map(row => row.sort_order)) + 1 : 0
}

function SortableConfigRow({
  id,
  label,
  disabled,
  showHandle = true,
  wrap = false,
  children,
}: {
  id: string
  label: string
  disabled: boolean
  showHandle?: boolean
  wrap?: boolean
  children: ReactNode
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled })
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 p-2 ${wrap ? 'flex-wrap' : ''} ${
        isDragging ? 'relative z-10 border-blue-200 shadow-lg ring-2 ring-blue-100' : ''
      }`}
    >
      {showHandle && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          disabled={disabled}
          aria-label={`Drag to reorder ${label}`}
          className="touch-none cursor-grab rounded-md p-1 text-gray-300 hover:bg-white hover:text-gray-500 active:cursor-grabbing disabled:cursor-default disabled:opacity-40"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      {children}
    </div>
  )
}

interface ListManagerProps {
  title: string
  description: string
  icon: ReactNode
  addPlaceholder: string
  rows: NamedRow[]
  onAdd: (name: string) => Promise<void>
  onRename: (id: string, name: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onReorder?: (rows: NamedRow[]) => Promise<void>
}

function ListManager({ title, description, icon, addPlaceholder, rows, onAdd, onRename, onDelete, onReorder }: ListManagerProps) {
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError('')
    try { await fn() }
    catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong.') }
    finally { setBusy(false) }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !onReorder) return
    const oldIndex = rows.findIndex(row => row.id === active.id)
    const newIndex = rows.findIndex(row => row.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    await run(() => onReorder(arrayMove(rows, oldIndex, newIndex)))
  }

  return (
    <Card className="p-5 mb-3">
      <p className="text-gray-900 text-sm font-semibold flex items-center gap-2 mb-1">{icon}{title}</p>
      <p className="text-gray-400 text-xs mb-4 leading-relaxed">{description}</p>

      {rows.length > 0 ? (
        <>
          {onReorder && <p className="mb-2 text-[11px] text-gray-400">Drag the handle to set the order used throughout workbooks.</p>}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={rows.map(row => row.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {rows.map(row => (
                  <SortableConfigRow
                    key={row.id}
                    id={row.id}
                    label={row.name}
                    disabled={busy || editingId !== null || !onReorder}
                    showHandle={Boolean(onReorder)}
                  >
                    {editingId === row.id ? (
                      <>
                        <input
                          autoFocus
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter' && editName.trim()) { void run(async () => { await onRename(row.id, editName); setEditingId(null) }) } }}
                          className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-blue-500"
                        />
                        <button onClick={() => void run(async () => { await onRename(row.id, editName); setEditingId(null) })}
                          disabled={busy || !editName.trim()}
                          className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 disabled:opacity-40" aria-label="Save">
                          <Check className="w-4 h-4" />
                        </button>
                        <button onClick={() => setEditingId(null)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100" aria-label="Cancel">
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-sm text-gray-800">{row.name}</span>
                        <button onClick={() => { setEditingId(row.id); setEditName(row.name) }}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50" aria-label={`Edit ${row.name}`}>
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => void run(() => onDelete(row.id))} disabled={busy}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40" aria-label={`Delete ${row.name}`}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </SortableConfigRow>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </>
      ) : (
        <p className="text-gray-400 text-xs px-1 py-2">Nothing here yet — add the first one below.</p>
      )}

      <div className="flex gap-2 mt-3">
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && newName.trim()) { void run(async () => { await onAdd(newName); setNewName('') }) } }}
          placeholder={addPlaceholder}
          className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500"
        />
        <button
          onClick={() => void run(async () => { await onAdd(newName); setNewName('') })}
          disabled={busy || !newName.trim()}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add
        </button>
      </div>
      {error && <p className="text-red-600 text-xs mt-2">{error}</p>}
    </Card>
  )
}

interface RoleDraft { name: string; hourlyRate: string; departmentId: string }
const emptyRole: RoleDraft = { name: '', hourlyRate: '0', departmentId: '' }

function RolesManager({
  roles,
  departments,
  reload,
  onReorder,
}: {
  roles: CrewRole[]
  departments: Department[]
  reload: () => Promise<void>
  onReorder: (roles: CrewRole[]) => Promise<void>
}) {
  const [draft, setDraft] = useState<RoleDraft>(emptyRole)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<RoleDraft>(emptyRole)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError('')
    try { await fn(); await reload() }
    catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong.') }
    finally { setBusy(false) }
  }

  const toInput = (d: RoleDraft): RoleInput => ({
    name: d.name,
    hourlyRate: Math.round((parseFloat(d.hourlyRate) || 0) * 100) / 100,
    departmentId: d.departmentId || null,
  })
  const departmentName = (id: string | null) => (id ? departments.find(dep => dep.id === id)?.name ?? null : null)

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = roles.findIndex(role => role.id === active.id)
    const newIndex = roles.findIndex(role => role.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    await run(() => onReorder(arrayMove(roles, oldIndex, newIndex)))
  }

  return (
    <Card className="p-5 mb-3">
      <p className="text-gray-900 text-sm font-semibold flex items-center gap-2 mb-1"><Users className="w-4 h-4 text-blue-600" />Roles</p>
      <p className="text-gray-400 text-xs mb-4 leading-relaxed">
        Crew roles, their department, and their hourly rate. Rates and pay are admin-only and are not shown to volunteers.
      </p>

      {roles.length > 0 ? (
        <>
          <p className="mb-2 text-[11px] text-gray-400">Drag the handle to set the order used throughout workbooks.</p>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={roles.map(role => role.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {roles.map(role => (
                  <SortableConfigRow
                    key={role.id}
                    id={role.id}
                    label={role.name}
                    disabled={busy || editingId !== null}
                    wrap
                  >
                    {editingId === role.id ? (
                      <>
                        <input value={editDraft.name} onChange={e => setEditDraft({ ...editDraft, name: e.target.value })}
                          className="flex-1 min-w-[120px] bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500" placeholder="Role name" />
                        <select value={editDraft.departmentId} onChange={e => setEditDraft({ ...editDraft, departmentId: e.target.value })}
                          className="bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500">
                          <option value="">No department</option>
                          {departments.map(dep => <option key={dep.id} value={dep.id}>{dep.name}</option>)}
                        </select>
                        <div className="flex items-center gap-1">
                          <span className="text-gray-400 text-sm">$</span>
                          <input type="number" step="0.01" min="0" value={editDraft.hourlyRate} onChange={e => setEditDraft({ ...editDraft, hourlyRate: e.target.value })}
                            className="w-20 bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-mono focus:outline-none focus:border-blue-500" />
                          <span className="text-gray-400 text-xs">/hr</span>
                        </div>
                        <button onClick={() => void run(async () => { await updateRole(role.id, toInput(editDraft)); setEditingId(null) })}
                          disabled={busy || !editDraft.name.trim()} className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 disabled:opacity-40" aria-label="Save">
                          <Check className="w-4 h-4" />
                        </button>
                        <button onClick={() => setEditingId(null)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100" aria-label="Cancel">
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 min-w-[120px] text-sm text-gray-800">{role.name}</span>
                        {departmentName(role.department_id) && (
                          <span className="text-[11px] bg-blue-50 text-blue-700 rounded-full px-2 py-0.5">{departmentName(role.department_id)}</span>
                        )}
                        <span className="text-sm font-mono text-gray-600">${role.hourly_rate.toFixed(2)}/hr</span>
                        <button onClick={() => { setEditingId(role.id); setEditDraft({ name: role.name, hourlyRate: String(role.hourly_rate), departmentId: role.department_id ?? '' }) }}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50" aria-label={`Edit ${role.name}`}>
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => void run(() => deleteRole(role.id))} disabled={busy}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40" aria-label={`Delete ${role.name}`}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </SortableConfigRow>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </>
      ) : (
        <p className="text-gray-400 text-xs px-1 py-2">No roles yet — add the first one below.</p>
      )}

      <div className="flex gap-2 mt-3 flex-wrap items-center">
        <input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="Role name, e.g. A1"
          className="flex-1 min-w-[140px] bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm placeholder-gray-400 focus:outline-none focus:border-blue-500" />
        <select value={draft.departmentId} onChange={e => setDraft({ ...draft, departmentId: e.target.value })}
          className="bg-gray-50 border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-blue-500">
          <option value="">No department</option>
          {departments.map(dep => <option key={dep.id} value={dep.id}>{dep.name}</option>)}
        </select>
        <div className="flex items-center gap-1">
          <span className="text-gray-400 text-sm">$</span>
          <input type="number" step="0.01" min="0" value={draft.hourlyRate} onChange={e => setDraft({ ...draft, hourlyRate: e.target.value })}
            className="w-20 bg-gray-50 border border-gray-200 rounded-lg px-2 py-2 text-sm font-mono focus:outline-none focus:border-blue-500" />
          <span className="text-gray-400 text-xs">/hr</span>
        </div>
        <button onClick={() => void run(async () => { await createRole(toInput(draft), nextSortOrder(roles)); setDraft(emptyRole) })}
          disabled={busy || !draft.name.trim()}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add
        </button>
      </div>
      {error && <p className="text-red-600 text-xs mt-2">{error}</p>}
    </Card>
  )
}

function nextChannelMode(mode: IntercomButtonMode | null): IntercomButtonMode | null {
  if (!mode) return 'momentary'
  if (mode === 'momentary') return 'latch'
  return null
}

function modeLabel(mode: IntercomButtonMode | null) {
  if (mode === 'momentary') return 'M'
  if (mode === 'latch') return 'L'
  return '—'
}

function IntercomConfigManager({ roles }: { roles: CrewRole[] }) {
  const [config, setConfig] = useState<IntercomConfig | null>(null)
  const [selectedRoleId, setSelectedRoleId] = useState('')
  const [packType, setPackType] = useState<IntercomPackTypeKey | null>(null)
  const [channelModes, setChannelModes] = useState<Record<string, IntercomButtonMode>>({})
  const [capacityDrafts, setCapacityDrafts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  async function reload() {
    const next = await loadIntercomConfig()
    setConfig(next)
    setCapacityDrafts(Object.fromEntries(next.packTypes.map(pack => [pack.key, String(pack.available_count)])))
    return next
  }

  useEffect(() => {
    let active = true
    loadIntercomConfig()
      .then(next => {
        if (!active) return
        setConfig(next)
        setCapacityDrafts(Object.fromEntries(next.packTypes.map(pack => [pack.key, String(pack.available_count)])))
        setSelectedRoleId(previous => previous || roles[0]?.id || '')
      })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : 'Unable to load Intercom settings.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [roles])

  useEffect(() => {
    if (!config || !selectedRoleId) {
      setPackType(null)
      setChannelModes({})
      return
    }
    const roleDefault = config.roleDefaults.find(item => item.role_id === selectedRoleId)
    setPackType(roleDefault?.pack_type ?? null)
    setChannelModes(roleDefault?.channel_modes ?? {})
    setNotice('')
  }, [config, selectedRoleId])

  async function saveCapacity(key: IntercomPackTypeKey) {
    const count = Math.max(0, Math.floor(Number(capacityDrafts[key]) || 0))
    setSaving(true); setError(''); setNotice('')
    try {
      await updateIntercomPackCapacity(key, count)
      await reload()
      setNotice('Pack availability saved.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save pack availability.')
    } finally {
      setSaving(false)
    }
  }

  async function saveDefaults() {
    if (!selectedRoleId) return
    setSaving(true); setError(''); setNotice('')
    try {
      await saveRoleIntercomDefault(selectedRoleId, packType, channelModes)
      await reload()
      setNotice('Role defaults saved. Existing event grids were not changed.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save role defaults.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Card className="mb-3 flex items-center gap-2 p-5 text-sm text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading Intercom settings…
      </Card>
    )
  }
  if (!config) {
    return <Card className="mb-3 p-5 text-sm text-red-600">{error || 'Intercom settings are unavailable.'}</Card>
  }

  return (
    <Card className="mb-3 p-5">
      <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-gray-900">
        <RadioTower className="h-4 w-4 text-blue-600" /> Intercom
      </p>
      <p className="mb-5 text-xs leading-relaxed text-gray-400">
        Set available pack counts, the reusable master channel list, and role starting defaults.
        Defaults are copied only when a role first appears in an event grid.
      </p>

      <div className="grid gap-5 xl:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">Pack availability</p>
          <div className="grid grid-cols-2 gap-2">
            {config.packTypes.map(pack => (
              <label key={pack.key} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <span className="block text-xs font-semibold text-gray-600">{pack.label} packs</span>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    value={capacityDrafts[pack.key] ?? '0'}
                    onChange={event => setCapacityDrafts(current => ({ ...current, [pack.key]: event.target.value }))}
                    onKeyDown={event => { if (event.key === 'Enter') void saveCapacity(pack.key) }}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none"
                  />
                  <button
                    onClick={() => void saveCapacity(pack.key)}
                    disabled={saving}
                    className="rounded-lg border border-gray-200 bg-white p-2 text-gray-500 hover:text-blue-600 disabled:opacity-40"
                    aria-label={`Save ${pack.label} pack availability`}>
                    <Save className="h-4 w-4" />
                  </button>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">Master channels</p>
          <ListManager
            title="Channels"
            description="These become the starting columns for new event grids. Removing one here does not erase an existing event column."
            icon={<RadioTower className="h-4 w-4 text-blue-600" />}
            addPlaceholder="Add a channel, e.g. Security"
            rows={config.masterChannels}
            onAdd={async name => { await createIntercomChannel(name, config.masterChannels.length); await reload() }}
            onRename={async (id, name) => { await renameIntercomChannel(id, name); await reload() }}
            onDelete={async id => { await deleteIntercomChannel(id); await reload() }}
          />
        </div>
      </div>

      <div className="mt-5 border-t border-gray-100 pt-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 flex-1">
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Role defaults</label>
            <select
              value={selectedRoleId}
              onChange={event => setSelectedRoleId(event.target.value)}
              className="w-full max-w-sm rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
              <option value="">Choose a role</option>
              {roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
            </select>
          </div>
          <div className="w-full sm:w-48">
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Default pack</label>
            <select
              value={packType ?? ''}
              onChange={event => setPackType((event.target.value || null) as IntercomPackTypeKey | null)}
              disabled={!selectedRoleId}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-50">
              <option value="">No intercom</option>
              {config.packTypes.map(pack => <option key={pack.key} value={pack.key}>{pack.label}</option>)}
            </select>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {config.masterChannels.map(channel => {
            const mode = channelModes[channel.id] ?? null
            return (
              <button
                key={channel.id}
                type="button"
                disabled={!selectedRoleId || !packType}
                onClick={() => {
                  const next = nextChannelMode(mode)
                  setChannelModes(current => {
                    const updated = { ...current }
                    if (next) updated[channel.id] = next
                    else delete updated[channel.id]
                    return updated
                  })
                }}
                className={`rounded-lg border px-3 py-2 text-left disabled:opacity-40 ${
                  mode === 'momentary' ? 'border-blue-300 bg-blue-50 text-blue-800'
                    : mode === 'latch' ? 'border-violet-300 bg-violet-50 text-violet-800'
                      : 'border-gray-200 bg-white text-gray-500'
                }`}>
                <span className="block text-xs font-semibold">{channel.name}</span>
                <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-wide">
                  {mode ? (mode === 'momentary' ? 'M · Momentary' : 'L · Latch') : modeLabel(null)}
                </span>
              </button>
            )
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            onClick={() => void saveDefaults()}
            disabled={saving || !selectedRoleId}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save defaults
          </button>
          <span className="text-xs text-gray-400">Click a channel to cycle Off → Momentary → Latch.</span>
          {notice && <span className="text-xs font-medium text-emerald-700">{notice}</span>}
          {error && <span className="text-xs font-medium text-red-600">{error}</span>}
        </div>
      </div>
    </Card>
  )
}

export function ProductionConfig() {
  const [locations, setLocations] = useState<Location[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [types, setTypes] = useState<ScheduleItemType[]>([])
  const [roles, setRoles] = useState<CrewRole[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const reloadLocations = async () => setLocations(await loadLocations())
  const reloadDepartments = async () => setDepartments(await loadDepartments())
  const reloadTypes = async () => setTypes(await loadScheduleItemTypes())
  const reloadRoles = async () => setRoles(await loadRoles())

  async function saveLocationOrder(rows: NamedRow[]) {
    const previous = locations
    const byId = new Map(locations.map(location => [location.id, location]))
    const reordered = rows.map((row, index) => ({ ...byId.get(row.id)!, sort_order: index }))
    setLocations(reordered)
    try {
      await reorderLocations(reordered.map(location => location.id))
    } catch (err) {
      setLocations(previous)
      throw err
    }
  }

  async function saveDepartmentOrder(rows: NamedRow[]) {
    const previous = departments
    const byId = new Map(departments.map(department => [department.id, department]))
    const reordered = rows.map((row, index) => ({ ...byId.get(row.id)!, sort_order: index }))
    setDepartments(reordered)
    try {
      await reorderDepartments(reordered.map(department => department.id))
    } catch (err) {
      setDepartments(previous)
      throw err
    }
  }

  async function saveTypeOrder(rows: NamedRow[]) {
    const previous = types
    const byId = new Map(types.map(type => [type.id, type]))
    const reordered = rows.map((row, index) => ({ ...byId.get(row.id)!, sort_order: index }))
    setTypes(reordered)
    try {
      await reorderScheduleItemTypes(reordered.map(type => type.id))
    } catch (err) {
      setTypes(previous)
      throw err
    }
  }

  async function saveRoleOrder(nextRoles: CrewRole[]) {
    const previous = roles
    const reordered = nextRoles.map((role, index) => ({ ...role, sort_order: index }))
    setRoles(reordered)
    try {
      await reorderRoles(reordered.map(role => role.id))
    } catch (err) {
      setRoles(previous)
      throw err
    }
  }

  useEffect(() => {
    let active = true
    Promise.all([loadLocations(), loadDepartments(), loadScheduleItemTypes(), loadRoles()])
      .then(([loc, dep, typ, rol]) => {
        if (!active) return
        setLocations(loc); setDepartments(dep); setTypes(typ); setRoles(rol)
      })
      .catch(err => { if (active) setLoadError(err instanceof Error ? err.message : 'Failed to load production config.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-gray-400 text-sm py-4">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </div>
    )
  }
  if (loadError) return <p className="text-red-600 text-sm">{loadError}</p>

  return (
    <div>
      <ListManager
        title="Locations"
        description="Rooms and venues used across workbooks and events. Referenced when scheduling."
        icon={<MapPin className="w-4 h-4 text-blue-600" />}
        addPlaceholder="Add a location, e.g. Sanctuary"
        rows={locations}
        onAdd={async name => { await createLocation(name, nextSortOrder(locations)); await reloadLocations() }}
        onRename={async (id, name) => { await renameLocation(id, name); await reloadLocations() }}
        onDelete={async id => { await deleteLocation(id); await reloadLocations() }}
        onReorder={saveLocationOrder}
      />
      <ListManager
        title="Departments"
        description="Production departments used to tag schedule items and (later) crew."
        icon={<Users className="w-4 h-4 text-blue-600" />}
        addPlaceholder="Add a department, e.g. Audio"
        rows={departments}
        onAdd={async name => { await createDepartment(name, nextSortOrder(departments)); await reloadDepartments() }}
        onRename={async (id, name) => { await renameDepartment(id, name); await reloadDepartments() }}
        onDelete={async id => { await deleteDepartment(id); await reloadDepartments() }}
        onReorder={saveDepartmentOrder}
      />
      <ListManager
        title="Schedule item types"
        description="The kinds of activity you can put on a schedule (call, rehearsal, meal, …). Add your own; each new type gets a default icon you can refine later."
        icon={<Tag className="w-4 h-4 text-blue-600" />}
        addPlaceholder="Add a type, e.g. Soundcheck"
        rows={types.map(t => ({ id: t.id, name: t.label }))}
        onAdd={async label => { await createScheduleItemType(label, nextSortOrder(types)); await reloadTypes() }}
        onRename={async (id, label) => { await renameScheduleItemType(id, label); await reloadTypes() }}
        onDelete={async id => { await deleteScheduleItemType(id); await reloadTypes() }}
        onReorder={saveTypeOrder}
      />
      <RolesManager roles={roles} departments={departments} reload={reloadRoles} onReorder={saveRoleOrder} />
      <IntercomConfigManager roles={roles} />
    </div>
  )
}
