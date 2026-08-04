// deno-lint-ignore-file no-import-prefix
import { createClient } from 'npm:@supabase/supabase-js@2'
import { hasAccessLevel, verifyAppSession } from '../_shared/app-auth.ts'

const ALLOWED_ORIGINS = [
  'https://bfcproduction.github.io',
  'http://localhost:5173',
]

const DOCUMENT_TYPES = new Set(['stage_plot', 'input_list', 'run_sheet', 'other'])

function corsHeaders(request: Request) {
  const origin = request.headers.get('Origin') ?? ''
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-token',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  }
}

function json(cors: Record<string, string>, status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function safeFilename(filename: string) {
  const normalized = filename.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return normalized.slice(-120) || 'document.pdf'
}

function isSafeDocumentUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
      && (url.hostname === 'docs.google.com' || url.hostname === 'drive.google.com')
  } catch {
    return false
  }
}

Deno.serve(async request => {
  const cors = corsHeaders(request)
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'GET' && request.method !== 'POST') {
    return json(cors, 405, { error: 'Method not allowed' })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_KEY')
  if (!supabaseUrl || !serviceKey) return json(cors, 500, { error: 'Missing Supabase function secrets' })

  const supabase = createClient(supabaseUrl, serviceKey)
  const user = await verifyAppSession(supabase, request.headers.get('x-session-token'))
  if (!user) return json(cors, 401, { error: 'Invalid or expired session' })

  try {
    const url = new URL(request.url)
    const body = request.method === 'POST'
      ? await request.json().catch(() => ({})) as Record<string, unknown>
      : {}
    const moduleId = request.method === 'GET' ? url.searchParams.get('module_id') : body.module_id
    if (!isUuid(moduleId)) return json(cors, 400, { error: 'A valid module_id is required' })

    const { data: module, error: moduleError } = await supabase
      .from('module_instances')
      .select('id, module_key, title, event_id, workbook_id, location_id, status, sort_order, created_at, updated_at')
      .eq('id', moduleId)
      .maybeSingle()
    if (moduleError) throw moduleError
    if (!module) return json(cors, 404, { error: 'Module not found' })
    if (module.status === 'archived' && !hasAccessLevel(user, 'manager')) {
      return json(cors, 403, { error: 'Manager access required to view archived modules' })
    }

    if (request.method === 'GET') {
      if (module.module_key === 'input_list') {
        const { data, error } = await supabase
          .from('module_input_list_values')
          .select('module_instance_id, row_id, column_id, value, updated_at')
          .eq('module_instance_id', module.id)
        if (error) throw error
        return json(cors, 200, { module, input_list_values: data ?? [], documents: [] })
      }

      if (module.module_key === 'production_documents') {
        const { data, error } = await supabase
          .from('production_docs')
          .select('*')
          .eq('module_instance_id', module.id)
          .order('uploaded_at')
        if (error) throw error
        return json(cors, 200, { module, input_list_values: [], documents: data ?? [] })
      }

      return json(cors, 200, { module, input_list_values: [], documents: [] })
    }

    if (module.status !== 'active') {
      return json(cors, 409, { error: 'Archived modules are read-only until restored' })
    }

    const action = typeof body.action === 'string' ? body.action : ''

    if (action === 'save_input_list_values') {
      if (module.module_key !== 'input_list') return json(cors, 400, { error: 'This is not an Input List module' })
      const cells = Array.isArray(body.cells) ? body.cells : null
      if (!cells || cells.length > 10_000) return json(cors, 400, { error: 'A valid cells array is required' })
      if (cells.some(value => {
        const cell = value as Record<string, unknown>
        return !isUuid(cell.row_id) || !isUuid(cell.column_id)
          || typeof cell.value !== 'string' || cell.value.length > 2_000
      })) return json(cors, 400, { error: 'Every cell requires valid row, column, and value fields' })
      const { error } = await supabase.rpc('save_module_input_list_values_bulk', {
        target_module_instance_id: module.id,
        cells,
      })
      if (error) throw error
      return json(cors, 200, { ok: true })
    }

    if (action === 'save_input_list_links') {
      if (module.module_key !== 'input_list') return json(cors, 400, { error: 'This is not an Input List module' })
      if (!isUuid(body.location_id)) return json(cors, 400, { error: 'A valid location_id is required' })
      const cells = Array.isArray(body.cells) ? body.cells : null
      if (!cells || cells.length > 10_000) return json(cors, 400, { error: 'A valid cells array is required' })
      if (module.location_id && module.location_id !== body.location_id) {
        return json(cors, 400, { error: 'Links must use the module location' })
      }
      const { error } = await supabase.rpc('save_input_list_cell_links_bulk', {
        target_location_id: body.location_id,
        cells,
      })
      if (error) throw error
      return json(cors, 200, { ok: true })
    }

    if (module.module_key !== 'production_documents') {
      return json(cors, 400, { error: 'Unknown action for this module type' })
    }

    if (action === 'add_document_link') {
      const title = typeof body.title === 'string' ? body.title.trim() : ''
      const docType = typeof body.doc_type === 'string' ? body.doc_type : ''
      const driveUrl = typeof body.gdrive_url === 'string' ? body.gdrive_url.trim() : ''
      const driveFileId = typeof body.gdrive_file_id === 'string' ? body.gdrive_file_id.trim() : null
      if (!title || !isSafeDocumentUrl(driveUrl) || !DOCUMENT_TYPES.has(docType)) {
        return json(cors, 400, { error: 'Title, document type, and URL are required' })
      }
      const { data, error } = await supabase
        .from('production_docs')
        .insert({
          module_instance_id: module.id,
          doc_type: docType,
          title,
          gdrive_file_id: driveFileId || null,
          gdrive_url: driveUrl,
          source: 'manual',
        })
        .select('*')
        .single()
      if (error) throw error
      return json(cors, 201, { document: data })
    }

    if (action === 'prepare_document_upload') {
      const filename = typeof body.filename === 'string' ? safeFilename(body.filename) : ''
      if (!filename.toLowerCase().endsWith('.pdf')) return json(cors, 400, { error: 'Production Document uploads must be PDF files' })
      const path = `${module.id}/${crypto.randomUUID()}-${filename}`
      const { data, error } = await supabase.storage
        .from('production-docs')
        .createSignedUploadUrl(path)
      if (error) throw error
      return json(cors, 200, { path, token: data.token })
    }

    if (action === 'finalize_document_upload') {
      const title = typeof body.title === 'string' ? body.title.trim() : ''
      const docType = typeof body.doc_type === 'string' ? body.doc_type : ''
      const path = typeof body.storage_path === 'string' ? body.storage_path : ''
      if (!title || !DOCUMENT_TYPES.has(docType) || !path.startsWith(`${module.id}/`)) {
        return json(cors, 400, { error: 'Title, document type, and a prepared upload path are required' })
      }
      const filename = path.slice(`${module.id}/`.length)
      const { data: uploadedFiles, error: listError } = await supabase.storage
        .from('production-docs')
        .list(module.id, { limit: 2, search: filename })
      if (listError) throw listError
      if (!(uploadedFiles ?? []).some(file => file.name === filename)) {
        return json(cors, 409, { error: 'The prepared PDF upload has not completed' })
      }
      const { data, error } = await supabase
        .from('production_docs')
        .insert({
          module_instance_id: module.id,
          doc_type: docType,
          title,
          storage_path: path,
          source: 'manual',
        })
        .select('*')
        .single()
      if (error) {
        await supabase.storage.from('production-docs').remove([path])
        throw error
      }
      return json(cors, 201, { document: data })
    }

    if (action === 'delete_document') {
      if (!hasAccessLevel(user, 'manager')) return json(cors, 403, { error: 'Manager access required' })
      if (!isUuid(body.document_id)) return json(cors, 400, { error: 'A valid document_id is required' })
      const { data: document, error: documentError } = await supabase
        .from('production_docs')
        .select('id, storage_path')
        .eq('id', body.document_id)
        .eq('module_instance_id', module.id)
        .maybeSingle()
      if (documentError) throw documentError
      if (!document) return json(cors, 404, { error: 'Document not found' })
      if (document.storage_path) {
        const { error: storageError } = await supabase.storage
          .from('production-docs')
          .remove([document.storage_path])
        if (storageError) throw storageError
      }
      const { error } = await supabase.from('production_docs').delete().eq('id', document.id)
      if (error) throw error
      return json(cors, 200, { ok: true })
    }

    return json(cors, 400, { error: 'Unknown module content action' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return json(cors, 500, { error: message })
  }
})
