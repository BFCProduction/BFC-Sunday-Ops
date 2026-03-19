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
}

export async function loadOrSeedChecklistItems() {
  const { data, error } = await supabase
    .from('checklist_items')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true })

  if (error) throw error

  if (data && data.length > 0) {
    return data as ChecklistItemRecord[]
  }

  const seedData = CHECKLIST_ITEMS.map((item, idx) => ({
    task: item.task,
    role: item.role,
    section: item.section,
    subsection: item.subsection || null,
    note: item.note || null,
    sort_order: idx,
  }))

  const { data: seeded, error: seedError } = await supabase
    .from('checklist_items')
    .insert(seedData)
    .select('*')
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true })

  if (seedError) throw seedError

  return (seeded || []) as ChecklistItemRecord[]
}
