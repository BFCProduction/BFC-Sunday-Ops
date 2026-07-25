import { useEffect, useState } from 'react'
import { Check, Loader2, MapPin, Pencil, Plus, Tag, Trash2, Users, X } from 'lucide-react'
import { Card } from '../ui/Card'
import type { Department, Location, CrewRole, ScheduleItemType } from '../../types'
import {
  loadLocations, createLocation, renameLocation, deleteLocation,
  loadDepartments, createDepartment, renameDepartment, deleteDepartment,
  loadScheduleItemTypes, createScheduleItemType, renameScheduleItemType, deleteScheduleItemType,
  loadRoles, createRole, updateRole, deleteRole,
  type RoleInput,
} from '../../lib/productionConfig'

interface NamedRow { id: string; name: string }

interface ListManagerProps {
  title: string
  description: string
  icon: React.ReactNode
  addPlaceholder: string
  rows: NamedRow[]
  onAdd: (name: string) => Promise<void>
  onRename: (id: string, name: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

function ListManager({ title, description, icon, addPlaceholder, rows, onAdd, onRename, onDelete }: ListManagerProps) {
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError('')
    try { await fn() }
    catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong.') }
    finally { setBusy(false) }
  }

  return (
    <Card className="p-5 mb-3">
      <p className="text-gray-900 text-sm font-semibold flex items-center gap-2 mb-1">{icon}{title}</p>
      <p className="text-gray-400 text-xs mb-4 leading-relaxed">{description}</p>

      <div className="space-y-2">
        {rows.map(row => (
          <div key={row.id} className="flex items-center gap-2 p-2 rounded-lg border border-gray-100 bg-gray-50">
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
          </div>
        ))}
        {rows.length === 0 && (
          <p className="text-gray-400 text-xs px-1 py-2">Nothing here yet — add the first one below.</p>
        )}
      </div>

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

function RolesManager({ roles, departments, reload }: { roles: CrewRole[]; departments: Department[]; reload: () => Promise<void> }) {
  const [draft, setDraft] = useState<RoleDraft>(emptyRole)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<RoleDraft>(emptyRole)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

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

  return (
    <Card className="p-5 mb-3">
      <p className="text-gray-900 text-sm font-semibold flex items-center gap-2 mb-1"><Users className="w-4 h-4 text-blue-600" />Roles</p>
      <p className="text-gray-400 text-xs mb-4 leading-relaxed">
        Crew roles, their department, and their hourly rate. Rates and pay are admin-only and are not shown to volunteers.
      </p>

      <div className="space-y-2">
        {roles.map(role => (
          <div key={role.id} className="flex items-center gap-2 p-2 rounded-lg border border-gray-100 bg-gray-50 flex-wrap">
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
          </div>
        ))}
        {roles.length === 0 && <p className="text-gray-400 text-xs px-1 py-2">No roles yet — add the first one below.</p>}
      </div>

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
        <button onClick={() => void run(async () => { await createRole(toInput(draft), roles.length); setDraft(emptyRole) })}
          disabled={busy || !draft.name.trim()}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add
        </button>
      </div>
      {error && <p className="text-red-600 text-xs mt-2">{error}</p>}
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
        onAdd={async name => { await createLocation(name, locations.length); await reloadLocations() }}
        onRename={async (id, name) => { await renameLocation(id, name); await reloadLocations() }}
        onDelete={async id => { await deleteLocation(id); await reloadLocations() }}
      />
      <ListManager
        title="Departments"
        description="Production departments used to tag schedule items and (later) crew."
        icon={<Users className="w-4 h-4 text-blue-600" />}
        addPlaceholder="Add a department, e.g. Audio"
        rows={departments}
        onAdd={async name => { await createDepartment(name, departments.length); await reloadDepartments() }}
        onRename={async (id, name) => { await renameDepartment(id, name); await reloadDepartments() }}
        onDelete={async id => { await deleteDepartment(id); await reloadDepartments() }}
      />
      <ListManager
        title="Schedule item types"
        description="The kinds of activity you can put on a schedule (call, rehearsal, meal, …). Add your own; each new type gets a default icon you can refine later."
        icon={<Tag className="w-4 h-4 text-blue-600" />}
        addPlaceholder="Add a type, e.g. Soundcheck"
        rows={types.map(t => ({ id: t.id, name: t.label }))}
        onAdd={async label => { await createScheduleItemType(label, types.length); await reloadTypes() }}
        onRename={async (id, label) => { await renameScheduleItemType(id, label); await reloadTypes() }}
        onDelete={async id => { await deleteScheduleItemType(id); await reloadTypes() }}
      />
      <RolesManager roles={roles} departments={departments} reload={reloadRoles} />
    </div>
  )
}
