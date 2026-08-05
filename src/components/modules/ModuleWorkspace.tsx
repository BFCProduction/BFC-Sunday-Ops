import { useEffect, useMemo, useState } from 'react'
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronRight,
  FileText,
  Headphones,
  Loader2,
  PackageOpen,
  Pencil,
  Plus,
  RadioTower,
  Settings2,
  TableProperties,
  Users,
} from 'lucide-react'
import { Card } from '../ui/Card'
import { InputListTab } from '../workbook/InputListTab'
import { OperationalModuleContent } from './OperationalModuleContent'
import { ProductionDocumentsModule } from '../../screens/ProductionDocs'
import {
  applyEventModuleDefaults,
  createModule,
  fetchEventModules,
  fetchWorkbookModules,
  renameModule,
  reorderModules,
  setModuleArchived,
  type ModuleScopeResponse,
} from '../../lib/modules'
import type {
  Location,
  ModuleDefinition,
  ModuleInstance,
  ModuleKey,
  Session,
  Workbook,
} from '../../types'

interface ModuleWorkspaceProps {
  sessionToken: string
  isManager: boolean
  isAdmin: boolean
  locations: Location[]
  event?: Session
  workbook?: Workbook
  linkedEvents?: Session[]
  onOperationalChanged?: () => Promise<void>
}

interface OwnerGroup {
  key: string
  type: 'event' | 'workbook'
  id: string
  label: string
  subtitle: string
  preferredLocationIds: string[]
  activeModules: ModuleInstance[]
  archivedModules: ModuleInstance[]
}

const MODULE_ICONS: Record<ModuleKey, typeof TableProperties> = {
  input_list: TableProperties,
  production_documents: FileText,
  crew: Users,
  supplies: PackageOpen,
  intercom: RadioTower,
}

function formatEventDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function moduleLabel(module: ModuleInstance, definitions: ModuleDefinition[]) {
  return module.title?.trim()
    || module.module_definitions?.label
    || definitions.find(definition => definition.key === module.module_key)?.label
    || module.module_key.replaceAll('_', ' ')
}

function useMobileViewport() {
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 767px)').matches)
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)')
    const update = () => setMobile(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  return mobile
}

export function ModuleWorkspace({
  sessionToken,
  isManager,
  isAdmin,
  locations,
  event,
  workbook,
  linkedEvents = [],
  onOperationalChanged,
}: ModuleWorkspaceProps) {
  const isMobile = useMobileViewport()
  const [data, setData] = useState<ModuleScopeResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [managing, setManaging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [selectedOwnerKey, setSelectedOwnerKey] = useState('')
  const [selectedModuleId, setSelectedModuleId] = useState('')
  const [newModuleKey, setNewModuleKey] = useState<ModuleKey>('input_list')
  const [newModuleTitle, setNewModuleTitle] = useState('')

  const scopeId = event?.id ?? workbook?.id ?? ''
  const scopeType = event ? 'event' : 'workbook'

  async function load() {
    if (!scopeId) return
    setError('')
    const result = scopeType === 'event'
      ? await fetchEventModules(sessionToken, scopeId, isManager)
      : await fetchWorkbookModules(sessionToken, scopeId, isManager)
    setData(result)
  }

  useEffect(() => {
    let active = true
    setLoading(true)
    const request = scopeType === 'event'
      ? fetchEventModules(sessionToken, scopeId, isManager)
      : fetchWorkbookModules(sessionToken, scopeId, isManager)
    request
      .then(result => { if (active) setData(result) })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : 'Unable to load modules.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [isManager, scopeId, scopeType, sessionToken])

  const groups = useMemo<OwnerGroup[]>(() => {
    if (!data) return []
    const split = (modules: ModuleInstance[], ownerType: 'event' | 'workbook', ownerId: string) => {
      const owned = modules
        .filter(module => ownerType === 'event' ? module.event_id === ownerId : module.workbook_id === ownerId)
        .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
      return {
        activeModules: owned.filter(module => module.status === 'active'),
        archivedModules: owned.filter(module => module.status === 'archived'),
      }
    }

    if (event) {
      const owned = split(data.event_modules, 'event', event.id)
      return [{
        key: `event:${event.id}`,
        type: 'event',
        id: event.id,
        label: event.name,
        subtitle: formatEventDate(event.date),
        preferredLocationIds: event.workbookLocationId ? [event.workbookLocationId] : [],
        ...owned,
      }]
    }

    if (!workbook) return []
    const shared = split(data.workbook_modules, 'workbook', workbook.id)
    return [
      {
        key: `workbook:${workbook.id}`,
        type: 'workbook',
        id: workbook.id,
        label: 'Workbook Shared',
        subtitle: workbook.name,
        preferredLocationIds: [...new Set(linkedEvents
          .map(linkedEvent => linkedEvent.workbookLocationId)
          .filter((id): id is string => Boolean(id)))],
        ...shared,
      },
      ...linkedEvents.map(linkedEvent => ({
        key: `event:${linkedEvent.id}`,
        type: 'event' as const,
        id: linkedEvent.id,
        label: linkedEvent.name,
        subtitle: formatEventDate(linkedEvent.date),
        preferredLocationIds: linkedEvent.workbookLocationId ? [linkedEvent.workbookLocationId] : [],
        ...split(data.event_modules, 'event', linkedEvent.id),
      })),
    ]
  }, [data, event, linkedEvents, workbook])

  useEffect(() => {
    if (groups.length === 0) return
    if (!groups.some(group => group.key === selectedOwnerKey)) setSelectedOwnerKey(groups[0].key)
  }, [groups, selectedOwnerKey])

  const selectedGroup = groups.find(group => group.key === selectedOwnerKey) ?? groups[0] ?? null

  useEffect(() => {
    if (!selectedGroup) return
    if (!selectedGroup.activeModules.some(module => module.id === selectedModuleId)) {
      setSelectedModuleId(selectedGroup.activeModules[0]?.id ?? '')
    }
  }, [selectedGroup, selectedModuleId])

  const selectedModule = selectedGroup?.activeModules.find(module => module.id === selectedModuleId)
    ?? selectedGroup?.activeModules[0]
    ?? null
  const definitions = data?.definitions ?? []
  const availableDefinitions = definitions.filter(definition => selectedGroup
    ? selectedGroup.type === 'event' ? definition.supports_event : definition.supports_workbook
    : false)

  useEffect(() => {
    if (availableDefinitions.some(definition => definition.key === newModuleKey)) return
    if (availableDefinitions[0]) setNewModuleKey(availableDefinitions[0].key)
  }, [availableDefinitions, newModuleKey])

  async function run(action: () => Promise<void>) {
    setBusy(true); setError('')
    try {
      await action()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update modules.')
    } finally {
      setBusy(false)
    }
  }

  async function addModule() {
    if (!selectedGroup) return
    await run(async () => {
      const result = await createModule(sessionToken, {
        moduleKey: newModuleKey,
        eventId: selectedGroup.type === 'event' ? selectedGroup.id : undefined,
        workbookId: selectedGroup.type === 'workbook' ? selectedGroup.id : undefined,
        title: newModuleTitle.trim() || undefined,
      })
      setSelectedModuleId(result.module.id)
      setNewModuleTitle('')
    })
  }

  async function moveModule(moduleId: string, offset: -1 | 1) {
    if (!selectedGroup) return
    const currentIndex = selectedGroup.activeModules.findIndex(module => module.id === moduleId)
    const nextIndex = currentIndex + offset
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= selectedGroup.activeModules.length) return
    const reordered = [...selectedGroup.activeModules]
    const [moved] = reordered.splice(currentIndex, 1)
    reordered.splice(nextIndex, 0, moved)
    await run(() => reorderModules(sessionToken, reordered.map(module => module.id)).then(() => undefined))
  }

  async function editTitle(module: ModuleInstance) {
    const title = window.prompt('Module title (leave blank to use the default label)', module.title ?? '')
    if (title === null) return
    await run(() => renameModule(sessionToken, module.id, title).then(() => undefined))
  }

  function renderContent(module: ModuleInstance, group: OwnerGroup) {
    const allowedLocations = module.location_id
      ? locations.filter(location => location.id === module.location_id)
      : group.type === 'event' && group.preferredLocationIds.length > 0
        ? locations.filter(location => group.preferredLocationIds.includes(location.id))
        : locations
    const contextLabel = `${group.label} · ${group.subtitle}`

    if (module.module_key === 'input_list') {
      return (
        <InputListTab
          moduleInstanceId={module.id}
          moduleTitle={module.title}
          locations={allowedLocations}
          preferredLocationIds={group.preferredLocationIds}
          editable={module.status === 'active'}
          sessionToken={sessionToken}
        />
      )
    }

    if (module.module_key === 'production_documents') {
      return (
        <ProductionDocumentsModule
          module={module}
          sessionToken={sessionToken}
          editable={module.status === 'active'}
          canManage={isManager}
          contextLabel={contextLabel}
        />
      )
    }

    if (module.module_key === 'crew' || module.module_key === 'supplies' || module.module_key === 'intercom') {
      const ownerEvent = group.type === 'event'
        ? event?.id === group.id ? event : linkedEvents.find(item => item.id === group.id) ?? null
        : null
      return (
        <OperationalModuleContent
          key={module.id}
          module={module}
          contextLabel={contextLabel}
          sessionToken={sessionToken}
          isAdmin={isAdmin}
          event={ownerEvent}
          workbook={workbook ?? null}
          linkedEvents={group.type === 'workbook' ? linkedEvents : ownerEvent ? [ownerEvent] : []}
          onOperationalChanged={onOperationalChanged}
        />
      )
    }

    const Icon: typeof TableProperties = Headphones
    return (
      <Card className="p-8 text-center">
        <Icon className="mx-auto h-9 w-9 text-gray-300" />
        <p className="mt-3 text-sm font-semibold text-gray-800">{moduleLabel(module, definitions)}</p>
        <p className="mt-1 text-xs text-gray-500">This module type is not available in the current application build.</p>
      </Card>
    )
  }

  if (loading) {
    return <Card className="flex items-center gap-2 p-6 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading modules…</Card>
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 p-4">
          <div>
            <p className="text-sm font-bold text-gray-950">Live Modules</p>
            <p className="mt-1 text-xs text-gray-500">Event modules stay with their Event; Workbook Shared modules apply to the whole production.</p>
          </div>
          {isManager && (
            <button
              type="button"
              onClick={() => setManaging(current => !current)}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              <Settings2 className="h-3.5 w-3.5" /> {managing ? 'Done' : 'Manage modules'}
            </button>
          )}
        </div>

        {!isMobile && groups.length > 1 && (
          <div className="flex gap-1 overflow-x-auto border-b border-gray-100 px-4 pt-3">
            {groups.map(group => (
              <button
                key={group.key}
                type="button"
                onClick={() => setSelectedOwnerKey(group.key)}
                className={`whitespace-nowrap rounded-t-lg px-3 py-2 text-xs font-semibold ${selectedGroup?.key === group.key ? 'bg-gray-100 text-gray-950' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {group.label} <span className="ml-1 text-[10px] text-gray-400">{group.activeModules.length}</span>
              </button>
            ))}
          </div>
        )}

        {!isMobile && selectedGroup && selectedGroup.activeModules.length > 0 && (
          <div className="flex gap-2 overflow-x-auto p-3">
            {selectedGroup.activeModules.map(module => {
              const Icon = MODULE_ICONS[module.module_key]
              return (
                <button
                  key={module.id}
                  type="button"
                  onClick={() => setSelectedModuleId(module.id)}
                  className={`inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold ${selectedModule?.id === module.id ? 'bg-gray-950 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  <Icon className="h-4 w-4" /> {moduleLabel(module, definitions)}
                </button>
              )
            })}
          </div>
        )}
      </Card>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {managing && isManager && selectedGroup && (
        <Card className="p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <label className="flex-1">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Add to {selectedGroup.label}</span>
              <select value={newModuleKey} onChange={changeEvent => setNewModuleKey(changeEvent.target.value as ModuleKey)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                {availableDefinitions.map(definition => <option key={definition.key} value={definition.key}>{definition.label}</option>)}
              </select>
            </label>
            <label className="flex-1">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Optional title</span>
              <input value={newModuleTitle} onChange={changeEvent => setNewModuleTitle(changeEvent.target.value)} placeholder="e.g. Orchestra Input List" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            </label>
            <button type="button" onClick={() => void addModule()} disabled={busy || availableDefinitions.length === 0} className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add module
            </button>
            {selectedGroup.type === 'event' && (
              <button type="button" onClick={() => void run(() => applyEventModuleDefaults(sessionToken, selectedGroup.id).then(() => undefined))} disabled={busy} className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                Apply folder defaults
              </button>
            )}
          </div>

          <div className="mt-4 divide-y divide-gray-100 rounded-xl border border-gray-200">
            {selectedGroup.activeModules.map((module, index) => (
              <div key={module.id} className="flex items-center gap-2 px-3 py-2.5">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-800">{moduleLabel(module, definitions)}</span>
                <button type="button" onClick={() => void editTitle(module)} disabled={busy} className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Rename"><Pencil className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => void moveModule(module.id, -1)} disabled={busy || index === 0} className="rounded px-2 py-1 text-xs font-bold text-gray-400 hover:bg-gray-100 disabled:opacity-25" title="Move left or up">←</button>
                <button type="button" onClick={() => void moveModule(module.id, 1)} disabled={busy || index === selectedGroup.activeModules.length - 1} className="rounded px-2 py-1 text-xs font-bold text-gray-400 hover:bg-gray-100 disabled:opacity-25" title="Move right or down">→</button>
                <button type="button" onClick={() => void run(() => setModuleArchived(sessionToken, module.id, true).then(() => undefined))} disabled={busy} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50"><Archive className="h-3.5 w-3.5" /> Archive</button>
              </div>
            ))}
            {selectedGroup.activeModules.length === 0 && <p className="px-4 py-5 text-center text-xs text-gray-400">No active modules for this owner.</p>}
          </div>

          {selectedGroup.archivedModules.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Archived · contents preserved</p>
              <div className="space-y-2">
                {selectedGroup.archivedModules.map(module => (
                  <div key={module.id} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-500">
                    <span className="truncate">{moduleLabel(module, definitions)}</span>
                    <button type="button" onClick={() => void run(() => setModuleArchived(sessionToken, module.id, false).then(() => undefined))} disabled={busy} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50"><ArchiveRestore className="h-3.5 w-3.5" /> Restore</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {!isMobile && selectedGroup && (
        selectedModule
          ? renderContent(selectedModule, selectedGroup)
          : <Card className="p-8 text-center text-sm text-gray-500">No active modules yet.{isManager ? ' Use Manage modules to add one.' : ''}</Card>
      )}

      {isMobile && (
        <div className="space-y-3">
          {groups.map(group => {
            const ownerOpen = selectedOwnerKey === group.key
            return (
              <Card key={group.key} className="overflow-hidden">
                <button type="button" onClick={() => setSelectedOwnerKey(ownerOpen && groups.length > 1 ? '' : group.key)} className="flex w-full items-center gap-2 px-4 py-3 text-left">
                  {ownerOpen ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-gray-900">{group.label}</span>
                    <span className="block text-[11px] text-gray-400">{group.subtitle}</span>
                  </span>
                  <span className="text-xs font-semibold text-gray-400">{group.activeModules.length}</span>
                </button>
                {ownerOpen && (
                  <div className="space-y-2 border-t border-gray-100 bg-gray-50 p-2">
                    {group.activeModules.map(module => {
                      const moduleOpen = selectedModuleId === module.id
                      const Icon = MODULE_ICONS[module.module_key]
                      return (
                        <div key={module.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                          <button type="button" onClick={() => setSelectedModuleId(moduleOpen ? '' : module.id)} className="flex w-full items-center gap-2 px-3 py-3 text-left">
                            {moduleOpen ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                            <Icon className="h-4 w-4 text-blue-600" />
                            <span className="flex-1 text-sm font-semibold text-gray-800">{moduleLabel(module, definitions)}</span>
                          </button>
                          {moduleOpen && <div className="border-t border-gray-100">{renderContent(module, group)}</div>}
                        </div>
                      )
                    })}
                    {group.activeModules.length === 0 && <p className="px-3 py-5 text-center text-xs text-gray-400">No active modules.</p>}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
