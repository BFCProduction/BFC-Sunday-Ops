import { CHECKLIST_ITEMS } from '../data/checklist'
import { supabase } from './supabase'

export interface ChecklistItemRecord {
  id: number
  task: string
  role: string
  section: string
  subsection: string | null
  note: string | null
  sort_order: number
  /** null = appears on all service types; slug = scoped to that service */
  service_type_slug: string | null
}

/**
 * Load checklist items from the DB, seeding from CHECKLIST_ITEMS if the table
 * is empty. Pass serviceTypeSlug to filter to items for that service (plus
 * items with null slug, which show everywhere).
 */
export async function loadOrSeedChecklistItems(serviceTypeSlug?: string | null) {
  const { data, error } = await supabase
    .from('checklist_items')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true })

  if (error) throw error

  if (data && data.length > 0) {
    const all = data as ChecklistItemRecord[]
    // Filter by service type when provided
    if (serviceTypeSlug) {
      return all.filter(i => i.service_type_slug === null || i.service_type_slug === serviceTypeSlug)
    }
    return all
  }

  // ── Seed (only when the table is completely empty) ─────────────────────────
  const seedData = CHECKLIST_ITEMS.map((item, idx) => ({
    task:              item.task,
    role:              item.role,
    section:           item.section,
    subsection:        item.subsection || null,
    note:              item.note || null,
    sort_order:        idx,
    service_type_slug: null,   // global by default
  }))

  const { data: seeded, error: seedError } = await supabase
    .from('checklist_items')
    .insert(seedData)
    .select('*')
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true })

  if (seedError) throw seedError

  const all = (seeded || []) as ChecklistItemRecord[]
  if (serviceTypeSlug) {
    return all.filter(i => i.service_type_slug === null || i.service_type_slug === serviceTypeSlug)
  }
  return all
}
