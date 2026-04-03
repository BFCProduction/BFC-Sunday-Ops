import { useEffect, useState, useCallback, Fragment } from 'react'
import {
  CheckCircle2, ChevronDown, X, Pencil, Trash2, Plus, GripVertical,
} from 'lucide-react'
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '../lib/supabase'
import { useAdmin } from '../context/adminState'
import type { EventChecklistItem, EventChecklistCompletion } from '../types'

interface Props {
  eventId: string
}

interface CompletionMap {
  [itemId: string]: { initials: string; time: string }
}

const INITIALS_KEY = 'bfc-checklist-initials'
const ADD_NEW = '__add_new__'

// ── Item form modal ───────────────────────────────────────────────────────────

interface ItemFormProps {
  eventId: string
  item?: EventChecklistItem
  defaultSection?: string
  sectionOptions: string[]
  subsectionsBySection: Record<string, string[]>
  onClose: () => void
  onSaved: () => void
}

function EventItemFormModal({
  eventId, item, defaultSection, sectionOptions, subsectionsBySection, onClose, onSaved,
}: ItemFormProps) {
  const [label, setLabel] = useState(item?.label ?? '')
  const [section, setSection] = useState(item?.section ?? defaultSection ?? sectionOptions[0] ?? '')
  const [subsection, setSubsection] = useState(item?.subsection ?? '')
  const [notes, setNotes] = useState(item?.item_notes ?? '')
  const [addingSection, setAddingSection] = useState(false)
  const [newSectionText, setNewSectionText] = useState('')
  const [addingSubsection, setAddingSubsection] = useState(false)
  const [newSubsectionText, setNewSubsectionText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const effectiveSection = addingSection ? newSectionText : section
  const effectiveSubsection = addingSubsection ? newSubsectionText : subsection
  const subsectionOptions = subsectionsBySection[effectiveSection] || []

  const handleSave = async () => {
    if (!label.trim()) { setError('Label is required'); return }
    if (!effectiveSection.trim()) { setError('Section is required'); return }
    setSaving(true)
    setError('')
    const payload = {
      label: label.trim(),
      section: effectiveSection.trim(),
      subsection: effectiveSubsection.trim() || null,
      item_notes: notes.trim() || null,
    }
    if (item) {
      const { error: e } = await supabase.from('event_checklist_items').update(payload).eq('id', item.id)
      if (e) { setError(e.message); setSaving(false); return }
    } else {
      const { error: e } = await supabase.from('event_checklist_items').insert({
        ...payload,
        event_id: eventId,
        sort_order: 9999,
      })
      if (e) { setError(e.message); setSaving(false); return }
    }
    setSaving(false)
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <h3 className="text-gray-900 font-bold">{item ? 'Edit Item' : 'Add Item'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Label *</label>
            <textarea
              rows={2} autoFocus
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 text-sm focus:outline-none focus:border-blue-500 resize-none"
              value={label} onChange={e => setLabel(e.target.value)} placeholder="Task description"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Section *</label>
            {addingSection ? (
              <div className="space-y-1.5">
                <input autoFocus
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 text-sm focus:outline-none focus:border-blue-500"
                  value={newSectionText} onChange={e => setNewSectionText(e.target.value)} placeholder="New section name"
                />
                {sectionOptions.length > 0 && (
                  <button onClick={() => { setAddingSection(false); setSection(sectionOptions[0]) }}
                    className="text-xs text-blue-600 hover:underline">← Choose existing</button>
                )}
              </div>
            ) : (
              <select
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 text-sm focus:outline-none focus:border-blue-500"
                value={section}
                onChange={e => {
                  if (e.target.value === ADD_NEW) { setAddingSection(true); setSection(''); setSubsection('') }
                  else { setSection(e.target.value); setSubsection('') }
                }}>
                {sectionOptions.map(s => <option key={s} value={s}>{s}</option>)}
                <option disabled>──────────</option>
                <option value={ADD_NEW}>＋ New section…</option>
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Subsection <span className="text-gray-400 normal-case font-normal">(optional)</span>
            </label>
            {addingSubsection ? (
              <div className="space-y-1.5">
                <input autoFocus
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 text-sm focus:outline-none focus:border-blue-500"
                  value={newSubsectionText} onChange={e => setNewSubsectionText(e.target.value)} placeholder="New subsection name"
                />
                <button onClick={() => { setAddingSubsection(false); setSubsection('') }}
                  className="text-xs text-blue-600 hover:underline">← Choose existing</button>
              </div>
            ) : (
              <select
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 text-sm focus:outline-none focus:border-blue-500"
                value={subsection}
                onChange={e => {
                  if (e.target.value === ADD_NEW) { setAddingSubsection(true); setSubsection('') }
                  else { setSubsection(e.target.value); setAddingSubsection(false) }
                }}>
                <option value="">(None)</option>
                {subsectionOptions.map(s => <option key={s} value={s}>{s}</option>)}
                <option disabled>──────────</option>
                <option value={ADD_NEW}>＋ New subsection…</option>
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Notes <span className="text-gray-400 normal-case font-normal">(optional)</span>
            </label>
            <textarea rows={2}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 text-sm focus:outline-none focus:border-blue-500 resize-none"
              value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional context shown below the item"
            />
          </div>

          {error && <p className="text-red-500 text-xs">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button onClick={onClose}
              className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-60">
              {saving ? 'Saving…' : (item ? 'Save Changes' : 'Add Item')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Sortable row ──────────────────────────────────────────────────────────────

interface RowProps {
  item: EventChecklistItem
  isAdmin: boolean
  isLast: boolean
  chk?: { initials: string; time: string }
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}

function SortableRow({ item, isAdmin, isLast, chk, onToggle, onEdit, onDelete }: RowProps) {
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
      className={`flex items-start gap-3 px-4 py-2.5 ${isLast ? '' : 'border-b border-gray-50'} ${chk && !isAdmin ? 'opacity-50' : ''} hover:bg-gray-50/50 transition-colors bg-white`}
    >
      {/* Drag handle — admin only */}
      {isAdmin && (
        <button
          {...attributes} {...listeners}
          className="flex-shrink-0 mt-0.5 p-0.5 text-gray-300 hover:text-gray-400 cursor-grab active:cursor-grabbing touch-none focus:outline-none"
          tabIndex={-1} aria-label="Drag to reorder"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Checkbox — non-admin only */}
      {!isAdmin && (
        <button
          onClick={onToggle}
          className={`flex-shrink-0 mt-0.5 w-[18px] h-[18px] rounded border-2 flex items-center justify-center transition-all ${
            chk ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300 hover:border-gray-400'
          }`}
        >
          {chk && <CheckCircle2 className="w-3 h-3 text-white" strokeWidth={3} />}
        </button>
      )}

      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug ${chk && !isAdmin ? 'line-through text-gray-400' : 'text-gray-800'}`}>
          {item.label}
        </p>
        {item.item_notes && (
          <p className="text-gray-400 text-[11px] mt-1 leading-snug">{item.item_notes}</p>
        )}
        {chk && !isAdmin && (
          <p className="text-emerald-600 text-[10px] mt-0.5 font-medium">{chk.initials} · {chk.time}</p>
        )}
      </div>

      {/* Admin actions */}
      {isAdmin && (
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={onEdit}
            className="p-1 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete}
            className="p-1 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function EventChecklist({ eventId }: Props) {
  const { isAdmin } = useAdmin()
  const [items, setItems] = useState<EventChecklistItem[]>([])
  const [completions, setCompletions] = useState<CompletionMap>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [operatorInitials, setOperatorInitials] = useState(
    () => window.localStorage.getItem(INITIALS_KEY) || ''
  )
  const [modal, setModal] = useState<string | null>(null)
  const [modalInitials, setModalInitials] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [timezone, setTimezone] = useState('America/Chicago')
  const [editItem, setEditItem] = useState<EventChecklistItem | null>(null)
  const [addSection, setAddSection] = useState<string | null>(null)
  const [showItemForm, setShowItemForm] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<EventChecklistItem | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  )

  useEffect(() => {
    supabase.from('app_config').select('value').eq('key', 'church_timezone').maybeSingle()
      .then(({ data }) => { if (data?.value) setTimezone(data.value) })
  }, [])

  useEffect(() => {
    const v = operatorInitials.trim().toUpperCase()
    if (v) window.localStorage.setItem(INITIALS_KEY, v)
    else window.localStorage.removeItem(INITIALS_KEY)
  }, [operatorInitials])

  const loadData = useCallback(async () => {
    const [itemsRes, completionsRes] = await Promise.all([
      supabase.from('event_checklist_items').select('*').eq('event_id', eventId).order('sort_order'),
      supabase.from('event_checklist_completions').select('*').eq('event_id', eventId),
    ])

    const newItems: EventChecklistItem[] = itemsRes.data || []
    setItems(newItems)

    setExpanded(prev => {
      const updated = { ...prev }
      Array.from(new Set(newItems.map(i => i.section))).forEach(sec => {
        if (!(sec in updated)) updated[sec] = true
      })
      return updated
    })

    const map: CompletionMap = {}
    for (const c of (completionsRes.data || []) as EventChecklistCompletion[]) {
      const t = new Date(c.completed_at).toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', hour12: true, timeZone: timezone,
      })
      map[c.item_id] = { initials: c.initials, time: t }
    }
    setCompletions(map)
    setLoading(false)
  }, [eventId, timezone])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    const channel = supabase
      .channel(`event_completions:${eventId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'event_checklist_completions',
        filter: `event_id=eq.${eventId}`,
      }, () => loadData())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [eventId, loadData])

  async function completeItem(itemId: string, ini: string) {
    const initials = ini.trim().toUpperCase() || 'N/A'
    const now = new Date().toISOString()
    setSaving(true)
    await supabase.from('event_checklist_completions')
      .upsert({ event_id: eventId, item_id: itemId, initials, completed_at: now },
        { onConflict: 'event_id,item_id' })
    setCompletions(p => ({
      ...p,
      [itemId]: {
        initials,
        time: new Date(now).toLocaleTimeString('en-US', {
          hour: 'numeric', minute: '2-digit', hour12: true, timeZone: timezone,
        }),
      },
    }))
    setSaving(false)
  }

  async function toggleItem(item: EventChecklistItem) {
    if (completions[item.id]) {
      await supabase.from('event_checklist_completions')
        .delete().eq('event_id', eventId).eq('item_id', item.id)
      setCompletions(p => { const n = { ...p }; delete n[item.id]; return n })
    } else if (operatorInitials.trim()) {
      await completeItem(item.id, operatorInitials)
    } else {
      setModalInitials('')
      setModal(item.id)
    }
  }

  async function confirmCheck() {
    if (!modal) return
    const ini = modalInitials.trim().toUpperCase()
    await completeItem(modal, ini)
    if (ini) setOperatorInitials(ini)
    setModal(null)
    setModalInitials('')
  }

  async function deleteItem(item: EventChecklistItem) {
    await supabase.from('event_checklist_items').delete().eq('id', item.id)
    setItems(prev => prev.filter(i => i.id !== item.id))
    setConfirmDelete(null)
  }

  const handleDragEnd = async (event: DragEndEvent, section: string) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const allSections = Array.from(new Set(items.map(i => i.section)))
    const newItems: EventChecklistItem[] = []
    for (const sec of allSections) {
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

    const changed = withOrder.filter((item, idx) =>
      items[idx]?.id !== item.id || items.find(i => i.id === item.id)?.sort_order !== item.sort_order
    )
    if (changed.length > 0) {
      await supabase.from('event_checklist_items').upsert(
        changed.map(i => ({ id: i.id, sort_order: i.sort_order })),
        { onConflict: 'id' }
      )
    }
  }

  const allSections = Array.from(new Set(items.map(i => i.section)))
  const sectionedItems = allSections.map(section => ({
    section,
    items: items.filter(i => i.section === section),
  }))

  const subsectionsBySection: Record<string, string[]> = {}
  items.forEach(i => {
    if (i.subsection) {
      if (!subsectionsBySection[i.section]) subsectionsBySection[i.section] = []
      if (!subsectionsBySection[i.section].includes(i.subsection))
        subsectionsBySection[i.section].push(i.subsection)
    }
  })

  const displaySections = isAdmin ? sectionedItems : sectionedItems.filter(s => s.items.length > 0)
  const allVisibleItems = displaySections.flatMap(s => s.items)
  const totalDone = allVisibleItems.filter(i => completions[i.id]).length
  const pct = allVisibleItems.length ? Math.round(totalDone / allVisibleItems.length * 100) : 0

  const modalItem = modal ? items.find(i => i.id === modal) : null

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
              <h2 className="text-gray-900 font-bold text-lg">Event Checklist</h2>
              {isAdmin && (
                <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
                  Admin
                </span>
              )}
            </div>
            <p className="text-gray-400 text-xs mt-0.5">{totalDone} of {allVisibleItems.length} items completed</p>
          </div>
          <span className={`text-sm font-bold ${pct === 100 ? 'text-emerald-600' : 'text-gray-400'}`}>{pct}%</span>
        </div>

        {!isAdmin && (
          <div className="mb-3">
            <label className="block text-gray-500 text-[11px] font-medium mb-1.5">Your Initials</label>
            <div className="flex items-center gap-2">
              <input
                maxLength={3}
                value={operatorInitials}
                onChange={e => setOperatorInitials(e.target.value.toUpperCase())}
                placeholder="AB"
                className="w-20 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-sm font-bold tracking-widest uppercase text-center focus:outline-none focus:border-blue-500"
              />
              <p className="text-gray-400 text-[11px]">
                These initials will be applied automatically to every item you check off.
              </p>
            </div>
          </div>
        )}

        <div className="bg-gray-100 rounded-full h-1">
          <div className="bg-blue-600 h-1 rounded-full progress-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="p-5 space-y-3">
        {isAdmin && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
            <p className="text-amber-700 text-xs font-medium">
              Admin mode active — drag <GripVertical className="inline w-3 h-3" /> to reorder, pencil to edit, trash to delete, or "Add item" within each section.
            </p>
          </div>
        )}

        {!isAdmin && allVisibleItems.length > 0 && totalDone < allVisibleItems.length && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 flex items-center gap-2">
            <span className="text-amber-500 text-sm flex-shrink-0">!</span>
            <p className="text-amber-700 text-xs font-medium">
              {allVisibleItems.length - totalDone} item{allVisibleItems.length - totalDone !== 1 ? 's' : ''} remaining
            </p>
          </div>
        )}

        {displaySections.length === 0 && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center">
            <p className="text-gray-600 text-sm font-medium">No checklist items configured yet.</p>
            <p className="text-gray-400 text-xs mt-1">
              {isAdmin ? 'Use admin mode to add the first checklist item.' : 'Ask an admin to add checklist items.'}
            </p>
            {isAdmin && (
              <button
                onClick={() => { setAddSection(null); setEditItem(null); setShowItemForm(true) }}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors">
                <Plus className="w-4 h-4" /> Add First Item
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
                        {!isAdmin && secDone === sectionItems.length && sectionItems.length > 0 && (
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
                              const prevSubsection = idx > 0 ? sectionItems[idx - 1].subsection : null
                              const showSubsection = item.subsection && item.subsection !== prevSubsection
                              const isLast = idx === sectionItems.length - 1

                              return (
                                <Fragment key={item.id}>
                                  {showSubsection && (
                                    <div className="px-4 py-1.5 bg-gray-50 border-t border-b border-gray-100">
                                      <p className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider">{item.subsection}</p>
                                    </div>
                                  )}
                                  <SortableRow
                                    item={item}
                                    isAdmin={isAdmin}
                                    isLast={isLast}
                                    chk={completions[item.id]}
                                    onToggle={() => toggleItem(item)}
                                    onEdit={() => { setEditItem(item); setAddSection(null); setShowItemForm(true) }}
                                    onDelete={() => setConfirmDelete(item)}
                                  />
                                </Fragment>
                              )
                            })}
                          </SortableContext>
                        </DndContext>

                        {isAdmin && (
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

      {/* Sign-off modal */}
      {modal && modalItem && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm slide-up shadow-2xl">
            <div className="flex items-start justify-between mb-1">
              <h3 className="text-gray-900 font-bold">Sign Off</h3>
              <button onClick={() => { setModal(null); setModalInitials('') }} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-gray-500 text-sm mb-1">{modalItem.label}</p>
            <p className="text-gray-400 text-xs mb-4">Enter your initials to confirm.</p>
            <input
              autoFocus maxLength={3}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 text-center text-2xl font-bold tracking-widest uppercase focus:outline-none focus:border-blue-500"
              placeholder="AB"
              value={modalInitials}
              onChange={e => setModalInitials(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && confirmCheck()}
            />
            <div className="flex gap-3 mt-4">
              <button onClick={() => { setModal(null); setModalInitials('') }}
                className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors">Cancel</button>
              <button onClick={confirmCheck} disabled={saving}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-60">
                {saving ? 'Saving…' : 'Check Off'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Item form modal */}
      {showItemForm && (
        <EventItemFormModal
          eventId={eventId}
          item={editItem || undefined}
          defaultSection={addSection || undefined}
          sectionOptions={allSections}
          subsectionsBySection={subsectionsBySection}
          onClose={() => { setShowItemForm(false); setEditItem(null); setAddSection(null) }}
          onSaved={loadData}
        />
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-gray-900 font-bold mb-2">Delete Item</h3>
            <p className="text-gray-500 text-sm mb-4">
              Delete "<span className="font-medium text-gray-700">{confirmDelete.label}</span>"? This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors">Cancel</button>
              <button onClick={() => deleteItem(confirmDelete)}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
