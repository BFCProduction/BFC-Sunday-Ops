import type {
  ModuleDefinition,
  ModuleFolderDefault,
  ModuleInstance,
  ModuleKey,
  PcoFolder,
} from '../types'

function getFunctionUrl() {
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/module-admin`
}

async function moduleRequest<T>(
  sessionToken: string,
  options: { query?: URLSearchParams; body?: Record<string, unknown> } = {},
): Promise<T> {
  const query = options.query?.toString()
  const response = await fetch(`${getFunctionUrl()}${query ? `?${query}` : ''}`, {
    method: options.body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'x-session-token': sessionToken,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = typeof payload?.error === 'string' ? payload.error : `Module request failed (${response.status})`
    throw new Error(message)
  }
  return payload as T
}

export interface ModuleConfiguration {
  definitions: ModuleDefinition[]
  folders: PcoFolder[]
  defaults: ModuleFolderDefault[]
  service_types: Array<{
    id: string
    name: string
    pco_service_type_id: string | null
    pco_folder_id: string | null
  }>
}

export interface WorkbookModuleEvent {
  id: string
  name: string
  event_date: string
  event_time: string | null
}

export interface ModuleScopeResponse {
  definitions: ModuleDefinition[]
  workbook_modules: ModuleInstance[]
  event_modules: ModuleInstance[]
  events?: WorkbookModuleEvent[]
}

export function fetchModuleConfiguration(sessionToken: string) {
  return moduleRequest<ModuleConfiguration>(sessionToken, {
    query: new URLSearchParams({ configuration: 'true' }),
  })
}

export function syncModulePcoFolders(sessionToken: string) {
  return moduleRequest<{
    folders: number
    linked_service_types: number
    unmatched_service_type_ids: string[]
  }>(sessionToken, { body: { action: 'sync_pco_folders' } })
}

export function saveModuleFolderDefaults(
  sessionToken: string,
  pcoFolderId: string,
  moduleKeys: ModuleKey[],
) {
  return moduleRequest<{ ok: true }>(sessionToken, {
    body: {
      action: 'set_folder_defaults',
      pco_folder_id: pcoFolderId,
      defaults: moduleKeys.map(module_key => ({ module_key })),
    },
  })
}

export function applyEventModuleDefaults(sessionToken: string, eventId: string) {
  return moduleRequest<{ modules: ModuleInstance[] }>(sessionToken, {
    body: { action: 'apply_event_defaults', event_id: eventId },
  })
}

export function fetchEventModules(sessionToken: string, eventId: string, includeArchived = false) {
  return moduleRequest<ModuleScopeResponse>(sessionToken, {
    query: new URLSearchParams({
      event_id: eventId,
      ...(includeArchived ? { include_archived: 'true' } : {}),
    }),
  })
}

export function fetchWorkbookModules(sessionToken: string, workbookId: string, includeArchived = false) {
  return moduleRequest<ModuleScopeResponse>(sessionToken, {
    query: new URLSearchParams({
      workbook_id: workbookId,
      ...(includeArchived ? { include_archived: 'true' } : {}),
    }),
  })
}

export function createModule(
  sessionToken: string,
  input: {
    moduleKey: ModuleKey
    eventId?: string
    workbookId?: string
    locationId?: string | null
    title?: string
  },
) {
  return moduleRequest<{ module: ModuleInstance }>(sessionToken, {
    body: {
      action: 'create',
      module_key: input.moduleKey,
      event_id: input.eventId,
      workbook_id: input.workbookId,
      location_id: input.locationId,
      title: input.title,
    },
  })
}

export function setModuleArchived(sessionToken: string, moduleId: string, archived: boolean) {
  return moduleRequest<{ module: ModuleInstance }>(sessionToken, {
    body: { action: archived ? 'archive' : 'restore', module_id: moduleId },
  })
}

export function renameModule(sessionToken: string, moduleId: string, title: string) {
  return moduleRequest<{ module: ModuleInstance }>(sessionToken, {
    body: { action: 'rename', module_id: moduleId, title },
  })
}

export function reorderModules(sessionToken: string, orderedIds: string[]) {
  return moduleRequest<{ ok: true }>(sessionToken, {
    body: { action: 'reorder', ordered_ids: orderedIds },
  })
}
