// deno-lint-ignore-file no-import-prefix
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

const PCO_API_BASE = 'https://api.planningcenteronline.com/services/v2'

interface JsonApiPage<T> {
  data: T[]
  links?: { next?: string | null }
}

interface PcoFolderResource {
  id: string
  attributes: { name: string }
  relationships?: {
    parent?: { data?: { id: string } | null }
  }
}

interface PcoServiceTypeResource {
  id: string
  relationships?: {
    parent?: { data?: { id: string } | null }
  }
}

// This Planning Center account uses these top-level Service Types as the
// operational "folders" for Sunday Ops. PCO's Folder endpoint currently
// returns no resources for the account, so stable Service Type IDs are used as
// deterministic fallback grouping keys.
const PRIMARY_SERVICE_TYPE_LABELS: Record<string, string> = {
  'sunday-9am': '9:00 Service',
  'sunday-11am': '11:00 Service',
  special: 'Special Events',
}

async function fetchAll<T>(url: string, pcoToken: string): Promise<T[]> {
  const rows: T[] = []
  let nextUrl: string | null = url

  for (let page = 0; nextUrl && page < 50; page += 1) {
    const response = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${pcoToken}` },
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`Planning Center folder sync failed (${response.status})${detail ? `: ${detail}` : ''}`)
    }

    const payload = await response.json() as JsonApiPage<T>
    rows.push(...(payload.data ?? []))
    nextUrl = payload.links?.next ?? null
  }

  if (nextUrl) throw new Error('Planning Center folder sync exceeded the pagination limit')
  return rows
}

export interface PcoFolderSyncResult {
  folders: number
  linked_service_types: number
  unmatched_service_type_ids: string[]
}

export async function syncPcoFolders(
  supabase: SupabaseClient,
  pcoToken: string,
): Promise<PcoFolderSyncResult> {
  const [folders, serviceTypes] = await Promise.all([
    fetchAll<PcoFolderResource>(`${PCO_API_BASE}/folders?per_page=100&order=name`, pcoToken),
    fetchAll<PcoServiceTypeResource>(`${PCO_API_BASE}/service_types?per_page=100&order=name`, pcoToken),
  ])

  const now = new Date().toISOString()
  const folderIds = new Set(folders.map(folder => folder.id))

  // A successful full fetch is authoritative. Keep disappeared folders for
  // historical/default references, but remove them from active configuration.
  const { error: deactivateError } = await supabase
    .from('pco_folders')
    .update({ is_active: false, synced_at: now, updated_at: now })
    .neq('is_active', false)
  if (deactivateError) throw deactivateError

  if (folders.length > 0) {
    const { error: baseUpsertError } = await supabase
      .from('pco_folders')
      .upsert(folders.map((folder, index) => ({
        pco_folder_id: folder.id,
        name: folder.attributes.name,
        parent_pco_folder_id: null,
        is_active: true,
        sort_order: index,
        synced_at: now,
        updated_at: now,
      })), { onConflict: 'pco_folder_id' })
    if (baseUpsertError) throw baseUpsertError

    const withParents = folders.map((folder, index) => {
      const parentId = folder.relationships?.parent?.data?.id ?? null
      return {
        pco_folder_id: folder.id,
        name: folder.attributes.name,
        parent_pco_folder_id: parentId && folderIds.has(parentId) ? parentId : null,
        is_active: true,
        sort_order: index,
        synced_at: now,
        updated_at: now,
      }
    })
    const { error: parentUpsertError } = await supabase
      .from('pco_folders')
      .upsert(withParents, { onConflict: 'pco_folder_id' })
    if (parentUpsertError) throw parentUpsertError
  }

  const { data: localServiceTypes, error: localError } = await supabase
    .from('service_types')
    .select('id, name, slug, pco_service_type_id')
    .not('pco_service_type_id', 'is', null)
  if (localError) throw localError

  const remoteById = new Map(serviceTypes.map(serviceType => [serviceType.id, serviceType]))
  const fallbackGroups = (localServiceTypes ?? []).flatMap(row => {
    const pcoServiceTypeId = String(row.pco_service_type_id)
    const remote = remoteById.get(pcoServiceTypeId)
    const parentId = remote?.relationships?.parent?.data?.id ?? null
    const label = PRIMARY_SERVICE_TYPE_LABELS[String(row.slug)]
    if (!remote || (parentId && folderIds.has(parentId)) || !label) return []
    return [{
      pco_folder_id: `service-type:${pcoServiceTypeId}`,
      name: label,
      parent_pco_folder_id: null,
      is_active: true,
      sort_order: folders.length + Object.keys(PRIMARY_SERVICE_TYPE_LABELS).indexOf(String(row.slug)),
      synced_at: now,
      updated_at: now,
    }]
  })
  if (fallbackGroups.length > 0) {
    const { error: fallbackError } = await supabase
      .from('pco_folders')
      .upsert(fallbackGroups, { onConflict: 'pco_folder_id' })
    if (fallbackError) throw fallbackError
  }

  const fallbackByServiceTypeId = new Map(
    fallbackGroups.map(group => [group.pco_folder_id.slice('service-type:'.length), group.pco_folder_id]),
  )

  const localByPcoId = new Map(
    (localServiceTypes ?? []).map(row => [String(row.pco_service_type_id), String(row.id)]),
  )
  const unmatched: string[] = []
  let linked = 0

  for (const serviceType of serviceTypes) {
    const localId = localByPcoId.get(serviceType.id)
    if (!localId) {
      unmatched.push(serviceType.id)
      continue
    }

    const parentId = serviceType.relationships?.parent?.data?.id ?? null
    const groupingId = parentId && folderIds.has(parentId)
      ? parentId
      : fallbackByServiceTypeId.get(serviceType.id) ?? null
    const { error } = await supabase
      .from('service_types')
      .update({ pco_folder_id: groupingId })
      .eq('id', localId)
    if (error) throw error
    if (groupingId) linked += 1
  }

  return {
    folders: folders.length + fallbackGroups.length,
    linked_service_types: linked,
    unmatched_service_type_ids: unmatched,
  }
}
