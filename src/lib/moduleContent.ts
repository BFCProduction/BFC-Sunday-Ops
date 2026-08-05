import { supabase } from './supabase'
import type {
  CrewRole,
  Department,
  IntercomChannel,
  IntercomChannelState,
  IntercomPackType,
  IntercomPackTypeKey,
  ModuleInputListValue,
  ModuleInstance,
  ModulePerson,
  ProductionDoc,
  WorkbookCrewMember,
  WorkbookIntercomAssignment,
  WorkbookIntercomChannel,
  WorkbookSupplyItem,
} from '../types'
import type { InputListCellLinkChange, WorkbookInputListValueChange } from './inputLists'
import { fetchWorkbookModules } from './modules'

function functionUrl() {
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/module-content`
}

async function request<T>(
  sessionToken: string,
  options: { moduleId: string; body?: Record<string, unknown> },
): Promise<T> {
  const response = await fetch(options.body
    ? functionUrl()
    : `${functionUrl()}?${new URLSearchParams({ module_id: options.moduleId })}`, {
    method: options.body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'x-session-token': sessionToken,
    },
    body: options.body ? JSON.stringify({ module_id: options.moduleId, ...options.body }) : undefined,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(typeof payload?.error === 'string' ? payload.error : `Module content request failed (${response.status})`)
  }
  return payload as T
}

export interface ModuleContentResponse {
  module: ModuleInstance
  input_list_values: ModuleInputListValue[]
  documents: ProductionDoc[]
  crew: WorkbookCrewMember[]
  supplies: WorkbookSupplyItem[]
  roles: CrewRole[]
  people: ModulePerson[]
  departments: Department[]
  intercom_channels: WorkbookIntercomChannel[]
  intercom_assignments: WorkbookIntercomAssignment[]
  intercom_config: {
    pack_types: IntercomPackType[]
    master_channels: IntercomChannel[]
  }
}

export function fetchModuleContent(sessionToken: string, moduleId: string) {
  return request<ModuleContentResponse>(sessionToken, { moduleId })
}

export function saveModuleInputListValues(
  sessionToken: string,
  moduleId: string,
  cells: WorkbookInputListValueChange[],
) {
  return request<{ ok: true }>(sessionToken, {
    moduleId,
    body: { action: 'save_input_list_values', cells },
  })
}

export function saveModuleInputListLinks(
  sessionToken: string,
  moduleId: string,
  locationId: string,
  cells: InputListCellLinkChange[],
) {
  return request<{ ok: true }>(sessionToken, {
    moduleId,
    body: { action: 'save_input_list_links', location_id: locationId, cells },
  })
}

export function addModuleDocumentLink(
  sessionToken: string,
  moduleId: string,
  input: {
    title: string
    docType: ProductionDoc['doc_type']
    driveUrl: string
    driveFileId: string | null
  },
) {
  return request<{ document: ProductionDoc }>(sessionToken, {
    moduleId,
    body: {
      action: 'add_document_link',
      title: input.title,
      doc_type: input.docType,
      gdrive_url: input.driveUrl,
      gdrive_file_id: input.driveFileId,
    },
  }).then(result => result.document)
}

export async function uploadModuleDocument(
  sessionToken: string,
  moduleId: string,
  input: { title: string; docType: ProductionDoc['doc_type']; file: File },
) {
  const prepared = await request<{ path: string; token: string }>(sessionToken, {
    moduleId,
    body: { action: 'prepare_document_upload', filename: input.file.name },
  })
  const { error: uploadError } = await supabase.storage
    .from('production-docs')
    .uploadToSignedUrl(prepared.path, prepared.token, input.file, {
      contentType: input.file.type || 'application/pdf',
    })
  if (uploadError) throw uploadError

  return request<{ document: ProductionDoc }>(sessionToken, {
    moduleId,
    body: {
      action: 'finalize_document_upload',
      title: input.title,
      doc_type: input.docType,
      storage_path: prepared.path,
    },
  }).then(result => result.document)
}

export function deleteModuleDocument(sessionToken: string, moduleId: string, documentId: string) {
  return request<{ ok: true }>(sessionToken, {
    moduleId,
    body: { action: 'delete_document', document_id: documentId },
  })
}

export function addModuleCrewMember(
  sessionToken: string,
  moduleId: string,
  input: {
    scheduledDate: string
    personName: string | null
    isOpen: boolean
    roleId: string | null
    callTime: string | null
    releaseTime: string | null
    isPaid: boolean
  },
) {
  return request<{ crew_member: WorkbookCrewMember }>(sessionToken, {
    moduleId,
    body: {
      action: 'add_crew',
      scheduled_date: input.scheduledDate,
      person_name: input.personName,
      is_open: input.isOpen,
      role_id: input.roleId,
      call_time: input.callTime,
      release_time: input.releaseTime,
      is_paid: input.isPaid,
    },
  }).then(result => result.crew_member)
}

export function updateModuleCrewMember(
  sessionToken: string,
  moduleId: string,
  crewId: string,
  updates: {
    roleId?: string | null
    callTime?: string | null
    releaseTime?: string | null
    isPaid?: boolean
  },
) {
  return request<{ ok: true }>(sessionToken, {
    moduleId,
    body: {
      action: 'update_crew',
      crew_id: crewId,
      ...('roleId' in updates ? { role_id: updates.roleId } : {}),
      ...('callTime' in updates ? { call_time: updates.callTime } : {}),
      ...('releaseTime' in updates ? { release_time: updates.releaseTime } : {}),
      ...('isPaid' in updates ? { is_paid: updates.isPaid } : {}),
    },
  })
}

export function reorderModuleCrew(sessionToken: string, moduleId: string, orderedIds: string[]) {
  return request<{ ok: true }>(sessionToken, {
    moduleId,
    body: { action: 'reorder_crew', ordered_ids: orderedIds },
  })
}

export function deleteModuleCrewMember(sessionToken: string, moduleId: string, crewId: string) {
  return request<{ ok: true }>(sessionToken, {
    moduleId,
    body: { action: 'delete_crew', crew_id: crewId },
  })
}

export function saveModuleSupply(
  sessionToken: string,
  moduleId: string,
  input: {
    supplyId: string | null
    departmentId: string | null
    itemName: string
    description: string | null
    quantity: number
    unitPrice: number
    purchaseUrl: string | null
  },
) {
  return request<{ supply_id: string }>(sessionToken, {
    moduleId,
    body: {
      action: 'save_supply',
      supply_id: input.supplyId,
      department_id: input.departmentId,
      item_name: input.itemName,
      description: input.description,
      quantity: input.quantity,
      unit_price: input.unitPrice,
      purchase_url: input.purchaseUrl,
    },
  })
}

export function deleteModuleSupply(sessionToken: string, moduleId: string, supplyId: string) {
  return request<{ ok: true }>(sessionToken, {
    moduleId,
    body: { action: 'delete_supply', supply_id: supplyId },
  })
}

export function prepareModuleIntercom(sessionToken: string, moduleId: string) {
  return request<ModuleContentResponse>(sessionToken, {
    moduleId,
    body: { action: 'prepare_intercom' },
  })
}

export function setModuleIntercomPack(
  sessionToken: string,
  moduleId: string,
  assignmentId: string,
  packType: IntercomPackTypeKey | null,
) {
  return request<{ ok: true }>(sessionToken, {
    moduleId,
    body: { action: 'set_intercom_pack', assignment_id: assignmentId, pack_type: packType },
  })
}

export function setModuleIntercomChannelState(
  sessionToken: string,
  moduleId: string,
  assignmentId: string,
  channelId: string,
  state: IntercomChannelState,
) {
  return request<{ ok: true }>(sessionToken, {
    moduleId,
    body: {
      action: 'set_intercom_channel_state',
      assignment_id: assignmentId,
      channel_id: channelId,
      talk_mode: state.talk_mode,
      listen_mode: state.listen_mode,
      program_enabled: state.program_enabled,
    },
  })
}

export function addModuleIntercomChannel(
  sessionToken: string,
  moduleId: string,
  input: { masterChannelId: string | null; name: string },
) {
  return request<{ ok: true }>(sessionToken, {
    moduleId,
    body: {
      action: 'add_intercom_channel',
      master_channel_id: input.masterChannelId,
      name: input.name,
    },
  })
}

export function deleteModuleIntercomChannel(sessionToken: string, moduleId: string, channelId: string) {
  return request<{ ok: true }>(sessionToken, {
    moduleId,
    body: { action: 'delete_intercom_channel', channel_id: channelId },
  })
}

export interface WorkbookOperationalModuleData {
  crew: WorkbookCrewMember[]
  supplies: WorkbookSupplyItem[]
  intercom: Array<{ module: ModuleInstance; content: ModuleContentResponse }>
}

export async function loadWorkbookOperationalModuleData(
  sessionToken: string,
  workbookId: string,
): Promise<WorkbookOperationalModuleData> {
  const scope = await fetchWorkbookModules(sessionToken, workbookId)
  const operationalModules = [...scope.workbook_modules, ...scope.event_modules]
    .filter(module => module.module_key === 'crew' || module.module_key === 'supplies' || module.module_key === 'intercom')
  const entries = await Promise.all(operationalModules.map(async module => ({
    module,
    content: module.module_key === 'intercom'
      ? await prepareModuleIntercom(sessionToken, module.id)
      : await fetchModuleContent(sessionToken, module.id),
  })))
  return {
    crew: entries.filter(entry => entry.module.module_key === 'crew').flatMap(entry => entry.content.crew),
    supplies: entries.filter(entry => entry.module.module_key === 'supplies').flatMap(entry => entry.content.supplies),
    intercom: entries.filter(entry => entry.module.module_key === 'intercom'),
  }
}
