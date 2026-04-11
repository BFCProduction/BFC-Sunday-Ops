import { useEffect, useState, useCallback, useRef, useMemo, Fragment } from 'react'
import { CheckCircle2, ChevronDown, ChevronRight, GripVertical, Pencil, Trash2, Plus, Settings2, X } from 'lucide-react'
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
import type { EventChecklistItem, EventChecklistCompletion, Role } from '../types'

// ── Sunday completion map ────────────────────────────────────────────────────

interface SundayCompletionMap {
  [itemId: number]: { initials: string; time: string }
}

interface EventCompletionMap {
  [itemId: string]: { initials: string; time: string }
}

// ── Row interface — unified display model ────────────────────────────────────

interface Row {
  uid: string
  text: string
  note: string | null
  section: string
  subsection: string | null
  role?: string
  sort_order: number
}

// ── ADD_NEW constant for dropdowns ───────────────────────────────────────────

const ADD_NEW = '__add_new__'

// ── EventItemFormModal (inline — copied from EventChecklist) ─────────────────

interface EventItemFormProps {
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
}: EventItemFormProps) {
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

// ── SortableRow — unified row component ──────────────────────────────────────

interface SortableRowProps {
  uid: string
  text: string
  note: string | null
  role?: string
  editMode: boolean
  isLast: boolean
  chk?: { initials: string; time: string }
  expandedNote: boolean
  onToggleNote: () => void
  onToggleCheck: () => void
  onEdit: () => void
  onDelete: () => void
}

function SortableRow({
  uid, text, note, role, editMode, isLast, chk, expandedNote,
  onToggleNote, onToggleCheck, onEdit, onDelete,
}: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: uid })

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

      {/* Text + note */}
      <div className="flex-1 min-w-0">
        {note ? (
          <button
            onClick={onToggleNote}
            className="flex items-start gap-1 text-left w-full group"
          >
            <span className={`text-sm leading-snug ${chk && !editMode ? 'line-through text-gray-400' : 'text-gray-800'}`}>
              {text}
            </span>
            <ChevronRight className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-gray-300 group-hover:text-gray-400 transition-transform duration-200 ${expandedNote ? 'rotate-90' : ''}`} />
          </button>
        ) : (
          <p className={`text-sm leading-snug ${chk && !editMode ? 'line-through text-gray-400' : 'text-gray-800'}`}>
            {text}
          </p>
        )}
        {note && (
          <div className={`grid transition-all duration-200 ease-in-out ${expandedNote ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
            <div className="overflow-hidden">
              <p className="text-gray-400 text-[11px] mt-1 leading-snug pb-0.5">{note}</p>
            </div>
          </div>
        )}
        {chk && !editMode && (
          <p className="text-emerald-600 text-[10px] mt-0.5 font-medium">{chk.initials} · {chk.time}</p>
        )}
      </div>

      {/* Role badge + edit actions */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {role !== undefined && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
            style={{ background: ROLE_COLORS[role] + '20', color: ROLE_COLORS[role] }}
          >
            {role}
          </span>
        )}
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

// ── Main component ────────────────────────────────────────────────────────────

export function Checklist() {
  const { isAdmin } = useAdmin()
  const { user } = useAuth()
  const {
    activeEventId, sundayId, serviceTypeSlug, serviceTypeName, serviceTypeColor,
    sessionType, eventId,
  } = useSunday()

  const isEvent = sessionType === 'event'

  const [editMode, setEditMode] = useState(false)

  // Sunday mode state
  const [sundayItems, setSundayItems] = useState<ChecklistItemRecord[]>([])
  const [sundayCompletions, setSundayCompletions] = useState<SundayCompletionMap>({})
  const [role, setRole] = useState<Role>('All')

  // Event mode state
  const [eventItems, setEventItems] = useState<EventChecklistItem[]>([])
  const [eventCompletions, setEventCompletions] = useState<EventCompletionMap>({})

  // Shared state
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({})

  // Sunday edit state
  const [editSundayItem, setEditSundayItem] = useState<ChecklistItemRecord | null>(null)
  const [addSection, setAddSection] = useState<string | null>(null)
  const [showItemForm, setShowItemForm] = useState(false)
  const [confirmDeleteSunday, setConfirmDeleteSunday] = useState<ChecklistItemRecord | null>(null)

  // Event edit state
  const [editEventItem, setEditEventItem] = useState<EventChecklistItem | null>(null)
  const [showEventItemForm, setShowEventItemForm] = useState(false)
  const [confirmDeleteEvent, setConfirmDeleteEvent] = useState<EventChecklistItem | null>(null)

  // Drag sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  )

  // Refs so real-time callbacks always see current values
  const activeEventIdRef = useRef(activeEventId)
  const sundayIdRef = useRef(sundayId)
  const serviceTypeSlugRef = useRef(serviceTypeSlug)
  const eventIdRef = useRef(eventId)
  useEffect(() => { activeEventIdRef.current = activeEventId }, [activeEventId])
  useEffect(() => { sundayIdRef.current = sundayId }, [sundayId])
  useEffect(() => { serviceTypeSlugRef.current = serviceTypeSlug }, [serviceTypeSlug])
  useEffect(() => { eventIdRef.current = eventId }, [eventId])

  // ── Full reload on service/event switch ──────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setSundayCompletions({})
    setEventCompletions({})

    async function load() {
      if (isEvent) {
        // Event mode: load event_checklist_items + event_checklist_completions
        if (!eventId) { setLoading(false); return }

        const [itemsRes, completionsRes] = await Promise.all([
          supabase.from('event_checklist_items').select('*').eq('event_id', eventId).order('sort_order'),
          supabase.from('event_checklist_completions').select('*').eq('event_id', eventId),
        ])
        if (cancelled) return

        const newItems: EventChecklistItem[] = itemsRes.data || []
        setEventItems(newItems)
        setExpanded(prev => {
          const updated = { ...prev }
          Array.from(new Set(newItems.map(i => i.section))).forEach(sec => {
            if (!(sec in updated)) updated[sec] = true
          })
          return updated
        })

        const map: EventCompletionMap = {}
        for (const c of (completionsRes.data || []) as EventChecklistCompletion[]) {
          const t = new Date(c.completed_at).toLocaleTimeString('en-US', {
            hour: 'numeric', minute: '2-digit', hour12: true,
          })
          map[c.item_id] = { initials: c.initials, time: t }
        }
        setEventCompletions(map)
      } else {
        // Sunday mode: load checklist_items + completions
        const data = await loadOrSeedChecklistItems(serviceTypeSlug)
        if (cancelled) return
        setSundayItems(data)
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
          const map: SundayCompletionMap = {}
          rawData.forEach((r: { item_id: number; initials: string; completed_at: string }) => {
            map[r.item_id] = {
              initials: r.initials,
              time: new Date(r.completed_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
            }
          })
          setSundayCompletions(map)
        }
      }

      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [isEvent, eventId, activeEventId, sundayId, serviceTypeSlug])

  // ── Refresh callbacks (use refs — never go stale) ────────────────────────────

  const refreshSundayItems = useCallback(async () => {
    const data = await loadOrSeedChecklistItems(serviceTypeSlugRef.current)
    setSundayItems(data)
    setExpanded(prev => {
      const updated = { ...prev }
      Array.from(new Set(data.map(i => i.section))).forEach(section => {
        if (!(section in updated)) updated[section] = true
      })
      return updated
    })
  }, [])

  const refreshSundayCompletions = useCallback(async () => {
    const targetEventId = activeEventIdRef.current
    const { data: eventData } = await supabase
      .from('checklist_completions')
      .select('item_id, initials, completed_at')
      .eq('event_id', targetEventId)
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
      const map: SundayCompletionMap = {}
      rawData.forEach((r: { item_id: number; initials: string; completed_at: string }) => {
        map[r.item_id] = {
          initials: r.initials,
          time: new Date(r.completed_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
        }
      })
      setSundayCompletions(map)
    } else {
      setSundayCompletions({})
    }
  }, [])

  const refreshEventItems = useCallback(async () => {
    const curEventId = eventIdRef.current
    if (!curEventId) return
    const { data } = await supabase
      .from('event_checklist_items')
      .select('*')
      .eq('event_id', curEventId)
      .order('sort_order')
    const newItems: EventChecklistItem[] = data || []
    setEventItems(newItems)
    setExpanded(prev => {
      const updated = { ...prev }
      Array.from(new Set(newItems.map(i => i.section))).forEach(sec => {
        if (!(sec in updated)) updated[sec] = true
      })
      return updated
    })
  }, [])

  const refreshEventCompletions = useCallback(async () => {
    const curEventId = eventIdRef.current
    if (!curEventId) return
    const { data } = await supabase
      .from('event_checklist_completions')
      .select('*')
      .eq('event_id', curEventId)
    const map: EventCompletionMap = {}
    for (const c of (data || []) as EventChecklistCompletion[]) {
      const t = new Date(c.completed_at).toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', hour12: true,
      })
      map[c.item_id] = { initials: c.initials, time: t }
    }
    setEventCompletions(map)
  }, [])

  // ── Real-time subscriptions ──────────────────────────────────────────────────
  useEffect(() => {
    if (isEvent) {
      if (!eventId) return
      const channel = supabase
        .channel(`event-checklist-realtime-${eventId}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'event_checklist_completions', filter: `event_id=eq.${eventId}` },
          () => refreshEventCompletions(),
        )
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'event_checklist_items', filter: `event_id=eq.${eventId}` },
          () => refreshEventItems(),
        )
        .subscribe()
      return () => { supabase.removeChannel(channel) }
    } else {
      if (!activeEventId) return
      const channel = supabase
        .channel(`checklist-realtime-${activeEventId}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'checklist_completions', filter: `event_id=eq.${activeEventId}` },
          () => refreshSundayCompletions(),
        )
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'checklist_items' },
          () => refreshSundayItems(),
        )
        .subscribe()
      return () => { supabase.removeChannel(channel) }
    }
  }, [isEvent, eventId, activeEventId, refreshEventCompletions, refreshEventItems, refreshSundayCompletions, refreshSundayItems])

  // ── Toggle completion ────────────────────────────────────────────────────────

  const toggleItem = async (uid: string) => {
    if (isEvent) {
      if (eventCompletions[uid]) {
        await supabase.from('event_checklist_completions')
          .delete().eq('event_id', eventId).eq('item_id', uid)
        setEventCompletions(p => { const n = { ...p }; delete n[uid]; return n })
      } else {
        const checkedBy = user?.name ?? 'Unknown'
        const now = new Date().toISOString()
        await supabase.from('event_checklist_completions')
          .upsert({ event_id: eventId, item_id: uid, initials: checkedBy, completed_at: now },
            { onConflict: 'event_id,item_id' })
        setEventCompletions(p => ({
          ...p,
          [uid]: {
            initials: checkedBy,
            time: new Date(now).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
          },
        }))
      }
    } else {
      const numId = Number(uid)
      if (sundayCompletions[numId]) {
        // Un-check — prefer event-native row; fall back to legacy
        const { data: eventRecord } = await supabase
          .from('checklist_completions')
          .select('id')
          .eq('event_id', activeEventId)
          .eq('item_id', numId)
          .maybeSingle()
        if (eventRecord) {
          await supabase.from('checklist_completions').delete().eq('id', eventRecord.id)
        } else if (sundayId) {
          await supabase.from('checklist_completions')
            .delete().eq('sunday_id', sundayId).eq('item_id', numId)
        }
        setSundayCompletions(p => { const n = { ...p }; delete n[numId]; return n })
      } else {
        const checkedBy = user?.name ?? 'Unknown'
        const now = new Date().toISOString()
        const { data: existing } = await supabase
          .from('checklist_completions')
          .select('id')
          .eq('event_id', activeEventId)
          .eq('item_id', numId)
          .maybeSingle()
        const payload = { event_id: activeEventId, item_id: numId, initials: checkedBy, completed_at: now }
        if (existing) {
          await supabase.from('checklist_completions').update(payload).eq('id', existing.id)
        } else {
          await supabase.from('checklist_completions').insert(payload)
        }
        setSundayCompletions(p => ({
          ...p,
          [numId]: {
            initials: checkedBy,
            time: new Date(now).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
          },
        }))
      }
    }
  }

  // ── Delete ───────────────────────────────────────────────────────────────────

  const deleteSundayItem = async (item: ChecklistItemRecord) => {
    await supabase.from('checklist_items').delete().eq('id', item.id)
    setSundayItems(prev => prev.filter(i => i.id !== item.id))
    setConfirmDeleteSunday(null)
  }

  const deleteEventItem = async (item: EventChecklistItem) => {
    await supabase.from('event_checklist_items').delete().eq('id', item.id)
    setEventItems(prev => prev.filter(i => i.id !== item.id))
    setConfirmDeleteEvent(null)
  }

  // ── Drag end ─────────────────────────────────────────────────────────────────

  const handleDragEnd = async (event: DragEndEvent, section: string) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    if (isEvent) {
      const allSections = Array.from(new Set(eventItems.map(i => i.section)))
      const newItems: EventChecklistItem[] = []
      for (const sec of allSections) {
        const secItems = eventItems.filter(i => i.section === sec)
        if (sec === section) {
          const oldIdx = secItems.findIndex(i => i.id === active.id)
          const newIdx = secItems.findIndex(i => i.id === over.id)
          newItems.push(...arrayMove(secItems, oldIdx, newIdx))
        } else {
          newItems.push(...secItems)
        }
      }
      const withOrder = newItems.map((item, idx) => ({ ...item, sort_order: idx }))
      setEventItems(withOrder)
      const changed = withOrder.filter((item, idx) =>
        eventItems[idx]?.id !== item.id || eventItems.find(i => i.id === item.id)?.sort_order !== item.sort_order
      )
      if (changed.length > 0) {
        await supabase.from('event_checklist_items').upsert(
          changed.map(i => ({ id: i.id, sort_order: i.sort_order })),
          { onConflict: 'id' }
        )
      }
    } else {
      const allSectionNames = Array.from(new Set(sundayItems.map(i => i.section)))
      const newItems: ChecklistItemRecord[] = []
      for (const sec of allSectionNames) {
        const secItems = sundayItems.filter(i => i.section === sec)
        if (sec === section) {
          const oldIdx = secItems.findIndex(i => String(i.id) === active.id)
          const newIdx = secItems.findIndex(i => String(i.id) === over.id)
          newItems.push(...arrayMove(secItems, oldIdx, newIdx))
        } else {
          newItems.push(...secItems)
        }
      }
      const withOrder = newItems.map((item, idx) => ({ ...item, sort_order: idx }))
      setSundayItems(withOrder)
      const changed = withOrder.filter((item, idx) =>
        sundayItems[idx]?.id !== item.id || sundayItems.find(i => i.id === item.id)?.sort_order !== item.sort_order
      )
      if (changed.length > 0) {
        await supabase.from('checklist_items').upsert(
          changed.map(i => ({ id: i.id, sort_order: i.sort_order })),
          { onConflict: 'id' }
        )
      }
    }
  }

  // ── Display rows ─────────────────────────────────────────────────────────────

  const displayRows: Row[] = useMemo(() => {
    if (isEvent) {
      return eventItems.map(i => ({
        uid: i.id,
        text: i.label,
        note: i.item_notes ?? null,
        section: i.section,
        subsection: i.subsection ?? null,
        sort_order: i.sort_order,
      }))
    }
    const filtered = editMode ? sundayItems : sundayItems.filter(i => role === 'All' || i.role === role)
    return filtered.map(i => ({
      uid: String(i.id),
      text: i.task,
      note: i.note ?? null,
      section: i.section,
      subsection: i.subsection ?? null,
      role: i.role,
      sort_order: i.sort_order,
    }))
  }, [isEvent, eventItems, sundayItems, editMode, role])

  // ── Section options (for forms) ──────────────────────────────────────────────

  const allSections = useMemo(() =>
    Array.from(new Set(displayRows.map(r => r.section))),
    [displayRows]
  )

  const sectionOptions = allSections

  const subsectionsBySection: Record<string, string[]> = useMemo(() => {
    const map: Record<string, string[]> = {}
    displayRows.forEach(r => {
      if (r.subsection) {
        if (!map[r.section]) map[r.section] = []
        if (!map[r.section].includes(r.subsection)) map[r.section].push(r.subsection)
      }
    })
    return map
  }, [displayRows])

  // ── Sectioned display ────────────────────────────────────────────────────────

  const sectionedRows = useMemo(() => {
    return allSections.map(section => {
      const rows = displayRows.filter(r => r.section === section)
      // Preserve subsection grouping order
      const subsectionOrder: string[] = []
      rows.forEach(r => {
        const key = r.subsection || ''
        if (!subsectionOrder.includes(key)) subsectionOrder.push(key)
      })
      const sorted = [...rows].sort(
        (a, b) => subsectionOrder.indexOf(a.subsection || '') - subsectionOrder.indexOf(b.subsection || '')
      )
      return { section, rows: sorted }
    })
  }, [allSections, displayRows])

  const displaySections = editMode
    ? sectionedRows
    : sectionedRows.filter(s => s.rows.length > 0)

  // ── Progress ─────────────────────────────────────────────────────────────────

  const visRows = sectionedRows.filter(s => s.rows.length > 0).flatMap(s => s.rows)
  const visDone = isEvent
    ? visRows.filter(r => eventCompletions[r.uid]).length
    : visRows.filter(r => sundayCompletions[Number(r.uid)]).length
  const pct = visRows.length ? Math.round(visDone / visRows.length * 100) : 0

  // ── Helpers for getting completions by uid ───────────────────────────────────

  const getChk = (uid: string) =>
    isEvent ? eventCompletions[uid] : sundayCompletions[Number(uid)]

  const getEventItemById = (uid: string) => eventItems.find(i => i.id === uid)
  const getSundayItemById = (uid: string) => sundayItems.find(i => String(i.id) === uid)

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
              <h2 className="text-gray-900 font-bold text-lg">
                {isEvent ? 'Event Checklist' : 'Gameday Checklist'}
              </h2>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: serviceTypeColor }} />
              <p className="text-gray-400 text-xs">{serviceTypeName} · {visDone} of {visRows.length} items completed</p>
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

        {/* Role pills — Sunday mode only */}
        {!isEvent && (
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
        )}

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

        {!editMode && visDone < visRows.length && visRows.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 flex items-center gap-2">
            <span className="text-amber-500 text-sm flex-shrink-0">!</span>
            <p className="text-amber-700 text-xs font-medium">
              {visRows.length - visDone} item{visRows.length - visDone !== 1 ? 's' : ''} remaining
              {!isEvent ? ' before service starts' : ''}
            </p>
          </div>
        )}

        {displaySections.length === 0 && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center">
            <p className="text-gray-600 text-sm font-medium">No checklist items configured yet.</p>
            <p className="text-gray-400 text-xs mt-1">
              {isAdmin ? 'Use Edit mode to add the first checklist item.' : 'Ask an admin to add checklist items.'}
            </p>
            {isAdmin && (
              <button
                onClick={() => {
                  setEditMode(true)
                  setAddSection(null)
                  if (isEvent) {
                    setEditEventItem(null)
                    setShowEventItemForm(true)
                  } else {
                    setEditSundayItem(null)
                    setShowItemForm(true)
                  }
                }}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors">
                <Plus className="w-4 h-4" />
                Add First Item
              </button>
            )}
          </div>
        )}

        {displaySections.length > 0 && (
          <div className="space-y-3 xl:space-y-0 xl:columns-2 xl:[column-gap:0.75rem]">
            {displaySections.map(({ section, rows: sectionRows }) => {
              const secDone = isEvent
                ? sectionRows.filter(r => eventCompletions[r.uid]).length
                : sectionRows.filter(r => sundayCompletions[Number(r.uid)]).length
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
                        {!editMode && secDone === sectionRows.length && sectionRows.length > 0 && (
                          <span className="flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded-full font-semibold border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" />Done
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400 text-xs">{secDone}/{sectionRows.length}</span>
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
                            items={sectionRows.map(r => r.uid)}
                            strategy={verticalListSortingStrategy}
                          >
                            {sectionRows.map((row, idx) => {
                              const chk = getChk(row.uid)
                              const prevSubsection = idx > 0 ? sectionRows[idx - 1].subsection : null
                              const showSubsection = row.subsection && row.subsection !== prevSubsection

                              return (
                                <Fragment key={row.uid}>
                                  {showSubsection && (
                                    <div className="px-4 py-1.5 bg-gray-50 border-t border-b border-gray-100">
                                      <p className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider">{row.subsection}</p>
                                    </div>
                                  )}
                                  <SortableRow
                                    uid={row.uid}
                                    text={row.text}
                                    note={row.note}
                                    role={row.role}
                                    editMode={editMode}
                                    isLast={idx === sectionRows.length - 1}
                                    chk={chk}
                                    expandedNote={!!expandedNotes[row.uid]}
                                    onToggleNote={() => setExpandedNotes(p => ({ ...p, [row.uid]: !p[row.uid] }))}
                                    onToggleCheck={() => toggleItem(row.uid)}
                                    onEdit={() => {
                                      if (isEvent) {
                                        const item = getEventItemById(row.uid)
                                        if (item) { setEditEventItem(item); setAddSection(null); setShowEventItemForm(true) }
                                      } else {
                                        const item = getSundayItemById(row.uid)
                                        if (item) { setEditSundayItem(item); setAddSection(null); setShowItemForm(true) }
                                      }
                                    }}
                                    onDelete={() => {
                                      if (isEvent) {
                                        const item = getEventItemById(row.uid)
                                        if (item) setConfirmDeleteEvent(item)
                                      } else {
                                        const item = getSundayItemById(row.uid)
                                        if (item) setConfirmDeleteSunday(item)
                                      }
                                    }}
                                  />
                                </Fragment>
                              )
                            })}
                          </SortableContext>
                        </DndContext>

                        {editMode && (
                          <button
                            onClick={() => {
                              setAddSection(section)
                              if (isEvent) {
                                setEditEventItem(null)
                                setShowEventItemForm(true)
                              } else {
                                setEditSundayItem(null)
                                setShowItemForm(true)
                              }
                            }}
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

      {/* Sunday item form modal */}
      {showItemForm && !isEvent && (
        <ItemFormModal
          item={editSundayItem || undefined}
          defaultSection={addSection || undefined}
          defaultServiceTypeSlug={editSundayItem ? undefined : serviceTypeSlug}
          sectionOptions={sectionOptions}
          subsectionsBySection={subsectionsBySection}
          onClose={() => { setShowItemForm(false); setEditSundayItem(null); setAddSection(null) }}
          onSaved={refreshSundayItems}
        />
      )}

      {/* Event item form modal */}
      {showEventItemForm && isEvent && eventId && (
        <EventItemFormModal
          eventId={eventId}
          item={editEventItem || undefined}
          defaultSection={addSection || undefined}
          sectionOptions={sectionOptions}
          subsectionsBySection={subsectionsBySection}
          onClose={() => { setShowEventItemForm(false); setEditEventItem(null); setAddSection(null) }}
          onSaved={refreshEventItems}
        />
      )}

      {/* Delete confirmation — Sunday */}
      {confirmDeleteSunday && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-gray-900 font-bold mb-2">Delete Item</h3>
            <p className="text-gray-500 text-sm mb-4">
              Delete "<span className="font-medium text-gray-700">{confirmDeleteSunday.task}</span>"? This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeleteSunday(null)}
                className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors">
                Cancel
              </button>
              <button onClick={() => deleteSundayItem(confirmDeleteSunday)}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 transition-colors">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation — Event */}
      {confirmDeleteEvent && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-gray-900 font-bold mb-2">Delete Item</h3>
            <p className="text-gray-500 text-sm mb-4">
              Delete "<span className="font-medium text-gray-700">{confirmDeleteEvent.label}</span>"? This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeleteEvent(null)}
                className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors">
                Cancel
              </button>
              <button onClick={() => deleteEventItem(confirmDeleteEvent)}
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
