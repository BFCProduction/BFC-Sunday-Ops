import { useEffect, useState, useCallback, useRef, Fragment } from 'react'
import { CheckCircle2, ChevronDown, ChevronRight, GripVertical, Pencil, Trash2, Plus, Settings2 } from 'lucide-react'
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '../lib/supabase'
import { ROLE_COLORS, ROLES } from '../data/checklist'
import { loadOrSeedChecklistItems } from '../lib/checklist'
import { useAdmin } from '../context/adminState'
import { useAuth } from '../context/authState'
import { useSunday } from '../context/SundayContext'
import { ItemFormModal } from '../components/admin/ItemFormModal'
import type { ChecklistItemRecord } from '../lib/checklist'
import type { Role } from '../types'

interface CompletionMap {
  [itemId: number]: { initials: string; time: string }
}

// ─── Sortable row ─────────────────────────────────────────────────────────────

interface SortableItemProps {
  item: ChecklistItemRecord
  isAdmin: boolean
  editMode: boolean
  isLast: boolean
  chk?: { initials: string; time: string }
  expandedNote: boolean
  onToggleNote: () => void
  onToggleCheck: () => void
  onEdit: () => void
  onDelete: () => void
}

function SortableChecklistItem({
  item, editMode, isLast, chk, expandedNote,
  onToggleNote, onToggleCheck, onEdit, onDelete,
}: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    position: isDragging ? ('relative' as const) : undefined,
    zIndex: isDragging ? 1 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-start gap-3 px-4 py-2.5 ${isLast ? '' : 'border-b border-gray-50'} ${chk && !editMode ? 'opacity-50' : ''} hover:bg-gray-50/50 transition-colors bg-white`}
    >
      {/* Drag handle — edit mode only */}
      {editMode && (
        <button
          {...attributes}
          {...listeners}
          className="flex-shrink-0 mt-0.5 p-0.5 text-gray-300 hover:text-gray-400 cursor-grab active:cursor-grabbing touch-none focus:outline-none"
          tabIndex={-1}
          aria-label="Drag to reorder"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Checkbox — shown when not in edit mode */}
      {!editMode && (
        <button
          onClick={onToggleCheck}
          className={`flex-shrink-0 mt-0.5 w-[18px] h-[18px] rounded border-2 flex items-center justify-center transition-all ${
            chk ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300 hover:border-gray-400'
          }`}
        >
          {chk && <CheckCircle2 className="w-3 h-3 text-white" strokeWidth={3} />}
        </button>
      )}

      {/* Task text + note */}
      <div className="flex-1 min-w-0">
        {item.note ? (
          <button
            onClick={onToggleNote}
            className="flex items-start gap-1 text-left w-full group"
          >
            <span className={`text-sm leading-snug ${chk && !editMode ? 'line-through text-gray-400' : 'text-gray-800'}`}>
              {item.task}
            </span>
            <ChevronRight className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-gray-300 group-hover:text-gray-400 transition-transform duration-200 ${expandedNote ? 'rotate-90' : ''}`} />
          </button>
        ) : (
          <p className={`text-sm leading-snug ${chk && !editMode ? 'line-through text-gray-400' : 'text-gray-800'}`}>
            {item.task}
          </p>
        )}
        {item.note && (
          <div className={`grid transition-all duration-200 ease-in-out ${expandedNote ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
            <div className="overflow-hidden">
              <p className="text-gray-400 text-[11px] mt-1 leading-snug pb-0.5">{item.note}</p>
            </div>
          </div>
        )}
        {chk && !editMode && (
          <p className="text-emerald-600 text-[10px] mt-0.5 font-medium">{chk.initials} · {chk.time}</p>
        )}
      </div>

      {/* Role badge + edit actions */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span
          className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
          style={{ background: ROLE_COLORS[item.role] + '20', color: ROLE_COLORS[item.role] }}
        >
          {item.role}
        </span>
        {editMode && (
          <>
            <button
              onClick={onEdit}
              className="p-1 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onDelete}
              className="p-1 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export function Checklist() {
  const { isAdmin } = useAdmin()
  const { user } = useAuth()
  const { activeEventId, sundayId, serviceTypeSlug, serviceTypeName, serviceTypeColor } = useSunday()

  const [editMode, setEditMode] = useState(false)

  const [items, setItems] = useState<ChecklistItemRecord[]>([])
  const [completions, setCompletions] = useState<CompletionMap>({})
  const [role, setRole] = useState<Role>('All')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [editItem, setEditItem] = useState<ChecklistItemRecord | null>(null)
  const [addSection, setAddSection] = useState<string | null>(null)
  const [showItemForm, setShowItemForm] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<ChecklistItemRecord | null>(null)
  const [expandedNotes, setExpandedNotes] = useState<Record<number, boolean>>({})

  // Drag sensors — require 8 px movement so clicks still register
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  )

  // Refs so real-time callbacks always see current values without needing to
  // re-subscribe every time the active event changes.
  const activeEventIdRef = useRef(activeEventId)
  const sundayIdRef      = useRef(sundayId)
  const serviceTypeSlugRef = useRef(serviceTypeSlug)
  useEffect(() => { activeEventIdRef.current = activeEventId },   [activeEventId])
  useEffect(() => { sundayIdRef.current = sundayId },             [sundayId])
  useEffect(() => { serviceTypeSlugRef.current = serviceTypeSlug }, [serviceTypeSlug])

  // ── Full reload on service/event switch (with cancellation guard) ────────────
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setCompletions({})

    async function load() {
      // Items
      const data = await loadOrSeedChecklistItems(serviceTypeSlug)
      if (cancelled) return
      setItems(data)
      setExpanded(prev => {
        const updated = { ...prev }
        Array.from(new Set(data.map(i => i.section))).forEach(section => {
          if (!(section in updated)) updated[section] = true
        })
        return updated
      })

      // Completions — event-native first, legacy fallback
      const { data: eventData } = await supabase
        .from('checklist_completions')
        .select('item_id, initials, completed_at')
        .eq('event_id', activeEventId)
      if (cancelled) return

      const rawData = eventData && eventData.length > 0
        ? eventData
        : sundayId
          ? (await supabase
              .from('checklist_completions')
              .select('item_id, initials, completed_at')
              .eq('sunday_id', sundayId)
            ).data
          : null
      if (cancelled) return

      if (rawData) {
        const map: CompletionMap = {}
        rawData.forEach((r: { item_id: number; initials: string; completed_at: string }) => {
          map[r.item_id] = {
            initials: r.initials,
            time: new Date(r.completed_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
          }
        })
        setCompletions(map)
      }

      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [activeEventId, sundayId, serviceTypeSlug])

  // ── Real-time refresh callbacks (use refs — never go stale, never re-subscribe) ──
  const refreshItems = useCallback(async () => {
    const data = await loadOrSeedChecklistItems(serviceTypeSlugRef.current)
    setItems(data)
    setExpanded(prev => {
      const updated = { ...prev }
      Array.from(new Set(data.map(i => i.section))).forEach(section => {
        if (!(section in updated)) updated[section] = true
      })
      return updated
    })
  }, [])

  const refreshCompletions = useCallback(async () => {
    const targetEventId = activeEventIdRef.current
    const { data: eventData } = await supabase
      .from('checklist_completions')
      .select('item_id, initials, completed_at')
      .eq('event_id', targetEventId)
    // Discard if the user switched services while this was in flight
    if (activeEventIdRef.current !== targetEventId) return

    const rawData = eventData && eventData.length > 0
      ? eventData
      : sundayIdRef.current
        ? (await supabase
            .from('checklist_completions')
            .select('item_id, initials, completed_at')
            .eq('sunday_id', sundayIdRef.current)
          ).data
        : null
    if (activeEventIdRef.current !== targetEventId) return

    if (rawData) {
      const map: CompletionMap = {}
      rawData.forEach((r: { item_id: number; initials: string; completed_at: string }) => {
        map[r.item_id] = {
          initials: r.initials,
          time: new Date(r.completed_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
        }
      })
      setCompletions(map)
    } else {
      setCompletions({})
    }
  }, [])

  // ── Real-time subscription (stable — only re-subscribes when event changes) ──
  useEffect(() => {
    if (!activeEventId) return
    const channel = supabase
      .channel(`checklist-realtime-${activeEventId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'checklist_completions', filter: `event_id=eq.${activeEventId}` },
        () => refreshCompletions(),
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'checklist_items' },
        () => refreshItems(),
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [activeEventId, refreshCompletions, refreshItems])

  // ── Write a completion (always event-native, identified by PCO name) ─────────
  const completeItem = async (id: number) => {
    const checkedBy = user?.name ?? 'Unknown'
    const now = new Date().toISOString()

    // Manual upsert to avoid partial unique index conflicts
    const { data: existing } = await supabase
      .from('checklist_completions')
      .select('id')
      .eq('event_id', activeEventId)
      .eq('item_id', id)
      .maybeSingle()

    const payload = { event_id: activeEventId, item_id: id, initials: checkedBy, completed_at: now }
    if (existing) {
      await supabase.from('checklist_completions').update(payload).eq('id', existing.id)
    } else {
      await supabase.from('checklist_completions').insert(payload)
    }

    setCompletions(p => ({
      ...p,
      [id]: {
        initials: checkedBy,
        time: new Date(now).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      },
    }))
  }

  // ── Toggle a completion (check or un-check) ──────────────────────────────────
  const toggleItem = async (id: number) => {
    if (completions[id]) {
      // Un-check — prefer deleting the event-native row; fall back to legacy
      const { data: eventRecord } = await supabase
        .from('checklist_completions')
        .select('id')
        .eq('event_id', activeEventId)
        .eq('item_id', id)
        .maybeSingle()

      if (eventRecord) {
        await supabase.from('checklist_completions').delete().eq('id', eventRecord.id)
      } else if (sundayId) {
        await supabase.from('checklist_completions')
          .delete().eq('sunday_id', sundayId).eq('item_id', id)
      }
      setCompletions(p => { const n = { ...p }; delete n[id]; return n })
    } else {
      await completeItem(id)
    }
  }

  const deleteItem = async (item: ChecklistItemRecord) => {
    await supabase.from('checklist_items').delete().eq('id', item.id)
    setItems(prev => prev.filter(i => i.id !== item.id))
    setConfirmDelete(null)
  }

  // ── Drag end: reorder within section, persist new sort_orders ───────────────
  const handleDragEnd = async (event: DragEndEvent, section: string) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const allSectionNames = Array.from(new Set(items.map(i => i.section)))
    const newItems: ChecklistItemRecord[] = []

    for (const sec of allSectionNames) {
      const secItems = items.filter(i => i.section === sec)
      if (sec === section) {
        const oldIdx = secItems.findIndex(i => i.id === active.id)
        const newIdx = secItems.findIndex(i => i.id === over.id)
        newItems.push(...arrayMove(secItems, oldIdx, newIdx))
      } else {
        newItems.push(...secItems)
      }
    }

    const withOrder = newItems.map((item, idx) => ({ ...item, sort_order: idx }))
    setItems(withOrder)

    const changed = withOrder.filter((item, idx) => items[idx]?.id !== item.id || items.find(i => i.id === item.id)?.sort_order !== item.sort_order)
    if (changed.length > 0) {
      await supabase.from('checklist_items').upsert(
        changed.map(i => ({ id: i.id, sort_order: i.sort_order })),
        { onConflict: 'id' }
      )
    }
  }

  const allSections = Array.from(new Set(items.map(i => i.section)))
  const sectionOptions = [...allSections]

  const subsectionsBySection: Record<string, string[]> = {}
  items.forEach(i => {
    if (i.subsection) {
      if (!subsectionsBySection[i.section]) subsectionsBySection[i.section] = []
      if (!subsectionsBySection[i.section].includes(i.subsection)) {
        subsectionsBySection[i.section].push(i.subsection)
      }
    }
  })

  const sectionedItems = allSections.map(section => {
    const sectionItems = items.filter(i => i.section === section && (role === 'All' || i.role === role))
    const subsectionOrder: string[] = []
    sectionItems.forEach(item => {
      const key = item.subsection || ''
      if (!subsectionOrder.includes(key)) subsectionOrder.push(key)
    })
    const sorted = [...sectionItems].sort(
      (a, b) => subsectionOrder.indexOf(a.subsection || '') - subsectionOrder.indexOf(b.subsection || '')
    )
    return { section, items: sorted }
  })

  const displaySections = editMode
    ? sectionedItems
    : sectionedItems.filter(s => s.items.length > 0)

  const visItems = sectionedItems.filter(s => s.items.length > 0).flatMap(s => s.items)
  const visDone = visItems.filter(i => completions[i.id]).length
  const pct = visItems.length ? Math.round(visDone / visItems.length * 100) : 0

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="fade-in">
      {/* Sticky header */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 px-5 pt-4 pb-3">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-gray-900 font-bold text-lg">Gameday Checklist</h2>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: serviceTypeColor }} />
              <p className="text-gray-400 text-xs">{serviceTypeName} · {visDone} of {visItems.length} items completed</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-sm font-bold ${pct === 100 ? 'text-emerald-600' : 'text-gray-400'}`}>{pct}%</span>
            {isAdmin && (
              <button
                onClick={() => setEditMode(m => !m)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  editMode
                    ? 'bg-amber-500 text-white hover:bg-amber-600'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <Settings2 className="w-3.5 h-3.5" />
                {editMode ? 'Done Editing' : 'Edit'}
              </button>
            )}
          </div>
        </div>
        {/* Role pills */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {ROLES.map(r => {
            const active = role === r
            return (
              <button key={r} onClick={() => setRole(r as Role)}
                className="px-3 py-1 rounded-full text-xs font-semibold transition-all"
                style={active
                  ? { background: r === 'All' ? '#2563eb' : ROLE_COLORS[r], color: '#fff' }
                  : { background: '#f3f4f6', color: '#6b7280' }}>
                {r}
              </button>
            )
          })}
        </div>
        <div className="bg-gray-100 rounded-full h-1">
          <div className="bg-blue-600 h-1 rounded-full progress-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="p-5 space-y-3">
        {editMode && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
            <p className="text-amber-700 text-xs font-medium">
              Edit mode — drag <GripVertical className="inline w-3 h-3" /> to reorder, pencil to edit, trash to delete, or "Add item" within each section.
            </p>
          </div>
        )}

        {!editMode && visDone < visItems.length && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 flex items-center gap-2">
            <span className="text-amber-500 text-sm flex-shrink-0">!</span>
            <p className="text-amber-700 text-xs font-medium">
              {visItems.length - visDone} item{visItems.length - visDone !== 1 ? 's' : ''} remaining before service starts
            </p>
          </div>
        )}

        {displaySections.length === 0 && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center">
            <p className="text-gray-600 text-sm font-medium">No checklist items are configured yet.</p>
            <p className="text-gray-400 text-xs mt-1">
              {isAdmin ? 'Use Edit mode to add the first checklist item.' : 'Ask an admin to add checklist items.'}
            </p>
            {isAdmin && (
              <button
                onClick={() => { setEditMode(true); setAddSection(null); setEditItem(null); setShowItemForm(true) }}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors">
                <Plus className="w-4 h-4" />
                Add First Item
              </button>
            )}
          </div>
        )}

        {displaySections.length > 0 && (
          <div className="space-y-3 xl:space-y-0 xl:columns-2 xl:[column-gap:0.75rem]">
            {displaySections.map(({ section, items: sectionItems }) => {
              const secDone = sectionItems.filter(i => completions[i.id]).length
              const isOpen = expanded[section] !== false
              return (
                <div key={section} className="xl:inline-block xl:w-full xl:break-inside-avoid xl:mb-3">
                  <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                    <button
                      onClick={() => setExpanded(p => ({ ...p, [section]: !p[section] }))}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-gray-900 font-semibold text-sm">{section}</span>
                        {!editMode && secDone === sectionItems.length && sectionItems.length > 0 && (
                          <span className="flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded-full font-semibold border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" />Done
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400 text-xs">{secDone}/{sectionItems.length}</span>
                        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </div>
                    </button>

                    {isOpen && (
                      <div className="border-t border-gray-100">
                        <DndContext
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          onDragEnd={e => handleDragEnd(e, section)}
                        >
                          <SortableContext
                            items={sectionItems.map(i => i.id)}
                            strategy={verticalListSortingStrategy}
                          >
                            {sectionItems.map((item, idx) => {
                              const chk = completions[item.id]
                              const prevSubsection = idx > 0 ? sectionItems[idx - 1].subsection : null
                              const showSubsection = item.subsection && item.subsection !== prevSubsection
                              return (
                                <Fragment key={item.id}>
                                  {showSubsection && (
                                    <div className="px-4 py-1.5 bg-gray-50 border-t border-b border-gray-100">
                                      <p className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider">{item.subsection}</p>
                                    </div>
                                  )}
                                  <SortableChecklistItem
                                    item={item}
                                    isAdmin={isAdmin}
                                    editMode={editMode}
                                    isLast={idx === sectionItems.length - 1}
                                    chk={chk}
                                    expandedNote={!!expandedNotes[item.id]}
                                    onToggleNote={() => setExpandedNotes(p => ({ ...p, [item.id]: !p[item.id] }))}
                                    onToggleCheck={() => toggleItem(item.id)}
                                    onEdit={() => { setEditItem(item); setAddSection(null); setShowItemForm(true) }}
                                    onDelete={() => setConfirmDelete(item)}
                                  />
                                </Fragment>
                              )
                            })}
                          </SortableContext>
                        </DndContext>

                        {editMode && (
                          <button
                            onClick={() => { setAddSection(section); setEditItem(null); setShowItemForm(true) }}
                            className="w-full flex items-center gap-2 px-4 py-2.5 text-blue-600 hover:bg-blue-50 transition-colors border-t border-gray-100 text-xs font-medium"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Add item to {section}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Item form modal */}
      {showItemForm && (
        <ItemFormModal
          item={editItem || undefined}
          defaultSection={addSection || undefined}
          defaultServiceTypeSlug={editItem ? undefined : serviceTypeSlug}
          sectionOptions={sectionOptions}
          subsectionsBySection={subsectionsBySection}
          onClose={() => { setShowItemForm(false); setEditItem(null); setAddSection(null) }}
          onSaved={refreshItems}
        />
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-gray-900 font-bold mb-2">Delete Item</h3>
            <p className="text-gray-500 text-sm mb-4">
              Delete "<span className="font-medium text-gray-700">{confirmDelete.task}</span>"? This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors">
                Cancel
              </button>
              <button onClick={() => deleteItem(confirmDelete)}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 transition-colors">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
