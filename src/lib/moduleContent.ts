import { supabase } from './supabase'
import type { ModuleInputListValue, ModuleInstance, ProductionDoc } from '../types'
import type { InputListCellLinkChange, WorkbookInputListValueChange } from './inputLists'

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
