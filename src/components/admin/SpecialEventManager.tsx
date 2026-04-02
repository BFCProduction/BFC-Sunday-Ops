import { useEffect, useState } from 'react'
import {
  CalendarDays, ChevronDown, ChevronRight, Copy, Pencil, Plus,
  Save, Trash2, X, GripVertical, Check,
} from 'lucide-react'
import { supabase, loadAllSessions } from '../../lib/supabase'
import type {
  EventTemplate, EventTemplateItem, SpecialEvent,
  EventChecklistItem, ChecklistItem, Session,
} from '../../types'

interface Props {
  onSessionsChange: (sessions: Session[]) => void
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function inputCls(extra = '') {
  return `w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${extra}`
}

function btnCls(variant: 'primary' | 'secondary' | 'danger' | 'ghost', extra = '') {
  const base = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50'
  const variants = {
    primary:   'bg-blue-600 text-white hover:bg-blue-700',
    secondary: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
    danger:    'bg-red-50 text-red-600 hover:bg-red-100',
    ghost:     'text-gray-500 hover:text-gray-700 hover:bg-gray-100',
  }
  return `${base} ${variants[variant]} ${extra}`
}

// ── Section header ─────────────────────────────────────────────────────────────

function SectionHeader({ label, onAdd, addLabel }: { label: string; onAdd: () => void; addLabel: string }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
        <CalendarDays className="w-4 h-4 text-purple-500" />
        {label}
      </h3>
      <button onClick={onAdd} className={btnCls('secondary')}>
        <Plus className="w-3.5 h-3.5" /> {addLabel}
      </button>
    </div>
  )
}

// ── Item editor (shared by templates and events) ──────────────────────────────

interface ItemEditorProps {
  items: Array<{ id: string; label: string; section: string; subsection: string | null; item_notes: string | null; sort_order: number; source_checklist_item_id?: number | null }>
  sundayItems: ChecklistItem[]
  onAddSundayItem: (item: ChecklistItem) => void
  onAddCustom: () => void
  onDelete: (id: string) => void
  onLabelChange: (id: string, label: string) => void
  onNotesChange: (id: string, notes: string) => void
}

function ItemEditor({
  items, sundayItems, onAddSundayItem, onAddCustom, onDelete,
  onLabelChange, onNotesChange,
}: ItemEditorProps) {
  const [showPicker, setShowPicker] = useState(false)
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // IDs already present (either sourced from Sunday checklist or matched by label)
  const addedSourceIds = new Set(items.map(i => i.source_checklist_item_id).filter(Boolean))

  const availableSundayItems = sundayItems.filter(i => !addedSourceIds.has(i.id))

  const filteredSundayItems = availableSundayItems.filter(i =>
    i.task.toLowerCase().includes(search.toLowerCase()) ||
    i.section.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-2">
      {items.length === 0 && (
        <p className="text-gray-400 text-sm text-center py-4">No items yet. Add from the Sunday checklist or create a custom item.</p>
      )}
      {items.map(item => (
        <div key={item.id} className="border border-gray-200 rounded-lg">
          <div className="flex items-center gap-2 px-3 py-2">
            <GripVertical className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
            <input
              className="flex-1 text-sm border-none outline-none bg-transparent text-gray-800"
              value={item.label}
              onChange={e => onLabelChange(item.id, e.target.value)}
              placeholder="Item label"
            />
            <button
              onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
              className="text-gray-400 hover:text-gray-600 p-0.5"
              title="Edit notes"
            >
              {expandedId === item.id ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
            <button onClick={() => onDelete(item.id)} className="text-gray-400 hover:text-red-500 p-0.5">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {expandedId === item.id && (
            <div className="px-3 pb-2 pt-0 border-t border-gray-100">
              <input
                className="w-full text-xs border border-gray-200 rounded px-2 py-1 mt-1 text-gray-600 placeholder-gray-400 focus:outline-none"
                placeholder="Notes (optional)"
                value={item.item_notes ?? ''}
                onChange={e => onNotesChange(item.id, e.target.value)}
              />
              <p className="text-[10px] text-gray-400 mt-0.5">Section: {item.section}{item.subsection ? ` › ${item.subsection}` : ''}</p>
            </div>
          )}
        </div>
      ))}

      <div className="flex gap-2 pt-1">
        <button onClick={() => setShowPicker(p => !p)} className={btnCls('secondary', 'text-xs')}>
          <Plus className="w-3 h-3" /> From Sunday checklist
        </button>
        <button onClick={onAddCustom} className={btnCls('ghost', 'text-xs')}>
          <Plus className="w-3 h-3" /> Custom item
        </button>
      </div>

      {showPicker && (
        <div className="border border-gray-200 rounded-lg p-2 bg-gray-50">
          <div className="flex gap-2 mb-2">
            <input
              className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none"
              placeholder="Search Sunday checklist..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
            />
            {availableSundayItems.length > 0 && (
              <button
                onClick={() => { availableSundayItems.forEach(si => onAddSundayItem(si)) }}
                className={btnCls('primary', 'text-xs whitespace-nowrap')}
                title={`Add all ${availableSundayItems.length} remaining items`}
              >
                Add all ({availableSundayItems.length})
              </button>
            )}
          </div>
          <div className="max-h-48 overflow-y-auto space-y-0.5">
            {filteredSundayItems.map(si => (
              <button
                key={si.id}
                onClick={() => onAddSundayItem(si)}
                className="w-full text-left px-2 py-1.5 rounded hover:bg-white hover:shadow-sm text-xs text-gray-700 flex items-start gap-2"
              >
                <span className="text-gray-400 flex-shrink-0 mt-0.5">{si.section}</span>
                <span className="flex-1">{si.task}</span>
              </button>
            ))}
            {filteredSundayItems.length === 0 && availableSundayItems.length === 0 && (
              <p className="text-gray-400 text-xs text-center py-2">All Sunday checklist items have been added</p>
            )}
            {filteredSundayItems.length === 0 && availableSundayItems.length > 0 && (
              <p className="text-gray-400 text-xs text-center py-2">No matches</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Template editor modal ─────────────────────────────────────────────────────

interface TemplateModalProps {
  template?: EventTemplate
  sundayItems: ChecklistItem[]
  onClose: () => void
  onSaved: () => void
}

function TemplateModal({ template, sundayItems, onClose, onSaved }: TemplateModalProps) {
  const [name, setName] = useState(template?.name ?? '')
  const [notes, setNotes] = useState(template?.notes ?? '')
  const [items, setItems] = useState<EventTemplateItem[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!template) return
    supabase.from('event_template_items')
      .select('*')
      .eq('template_id', template.id)
      .order('sort_order')
      .then(({ data }) => setItems(data || []))
  }, [template?.id])

  async function save() {
    if (!name.trim()) { setError('Name is required'); return }
    setSaving(true)
    setError('')
    try {
      let tId = template?.id
      if (!tId) {
        const { data, error: e } = await supabase
          .from('event_templates')
          .insert({ name: name.trim(), notes: notes.trim() || null })
          .select()
          .single()
        if (e) throw e
        tId = data.id
      } else {
        const { error: e } = await supabase
          .from('event_templates')
          .update({ name: name.trim(), notes: notes.trim() || null })
          .eq('id', tId)
        if (e) throw e
      }
      // Upsert items
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item.id.startsWith('new-')) {
          const { error: e } = await supabase.from('event_template_items').insert({
            template_id: tId,
            source_checklist_item_id: item.source_checklist_item_id,
            label: item.label,
            section: item.section,
            subsection: item.subsection,
            item_notes: item.item_notes,
            sort_order: i,
          })
          if (e) throw e
        } else {
          const { error: e } = await supabase.from('event_template_items').update({
            label: item.label,
            item_notes: item.item_notes,
            sort_order: i,
          }).eq('id', item.id)
          if (e) throw e
        }
      }
      onSaved()
      onClose()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : (e as { message?: string })?.message
      setError(msg || JSON.stringify(e))
    } finally {
      setSaving(false)
    }
  }

  function addSundayItem(si: ChecklistItem) {
    setItems(prev => [...prev, {
      id: `new-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      template_id: template?.id ?? '',
      source_checklist_item_id: si.id,
      label: si.task,
      section: si.section,
      subsection: si.subsection ?? null,
      item_notes: null,
      sort_order: prev.length,
      created_at: '',
    }])
  }

  function addCustom() {
    setItems(prev => [...prev, {
      id: `new-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      template_id: template?.id ?? '',
      source_checklist_item_id: null,
      label: '',
      section: 'General',
      subsection: null,
      item_notes: null,
      sort_order: prev.length,
      created_at: '',
    }])
  }

  async function deleteItem(id: string) {
    if (id.startsWith('new-')) {
      setItems(prev => prev.filter(i => i.id !== id))
      return
    }
    await supabase.from('event_template_items').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            {template ? 'Edit Template' : 'New Template'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Template Name</label>
            <input className={inputCls()} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Good Friday" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
            <input className={inputCls()} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any notes about this template" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Checklist Items</label>
            <ItemEditor
              items={items}
              sundayItems={sundayItems}
              onAddSundayItem={addSundayItem}
              onAddCustom={addCustom}
              onDelete={deleteItem}
              onLabelChange={(id, label) => setItems(prev => prev.map(i => i.id === id ? { ...i, label } : i))}
              onNotesChange={(id, notes) => setItems(prev => prev.map(i => i.id === id ? { ...i, item_notes: notes || null } : i))}
            />
          </div>
        </div>
        {error && <p className="text-red-600 text-sm px-5 py-2 border-t border-red-100 bg-red-50">{error}</p>}
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className={btnCls('secondary')}>Cancel</button>
          <button onClick={save} disabled={saving} className={btnCls('primary')}>
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Saving…' : 'Save Template'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Event checklist items editor modal ───────────────────────────────────────

interface EventItemsModalProps {
  event: SpecialEvent
  sundayItems: ChecklistItem[]
  onClose: () => void
}

function EventItemsModal({ event, sundayItems, onClose }: EventItemsModalProps) {
  const [items, setItems] = useState<EventChecklistItem[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    supabase.from('event_checklist_items')
      .select('*')
      .eq('event_id', event.id)
      .order('sort_order')
      .then(({ data }) => setItems(data || []))
  }, [event.id])

  async function save() {
    setSaving(true)
    setError('')
    try {
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item.id.startsWith('new-')) {
          const { error: e } = await supabase.from('event_checklist_items').insert({
            event_id: event.id,
            source_checklist_item_id: item.source_checklist_item_id,
            label: item.label,
            section: item.section,
            subsection: item.subsection,
            item_notes: item.item_notes,
            sort_order: i,
          })
          if (e) throw e
        } else {
          const { error: e } = await supabase.from('event_checklist_items').update({
            label: item.label,
            item_notes: item.item_notes,
            sort_order: i,
          }).eq('id', item.id)
          if (e) throw e
        }
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : (e as { message?: string })?.message
      setError(msg || JSON.stringify(e))
    } finally {
      setSaving(false)
    }
  }

  function addSundayItem(si: ChecklistItem) {
    setItems(prev => [...prev, {
      id: `new-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      event_id: event.id,
      source_template_item_id: null,
      source_checklist_item_id: si.id,
      label: si.task,
      section: si.section,
      subsection: si.subsection ?? null,
      item_notes: null,
      sort_order: prev.length,
      created_at: '',
    }])
  }

  function addCustom() {
    setItems(prev => [...prev, {
      id: `new-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      event_id: event.id,
      source_template_item_id: null,
      source_checklist_item_id: null,
      label: '',
      section: 'General',
      subsection: null,
      item_notes: null,
      sort_order: prev.length,
      created_at: '',
    }])
  }

  async function deleteItem(id: string) {
    if (id.startsWith('new-')) {
      setItems(prev => prev.filter(i => i.id !== id))
      return
    }
    await supabase.from('event_checklist_items').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Edit Checklist Items</h2>
            <p className="text-xs text-gray-500 mt-0.5">{event.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <ItemEditor
            items={items}
            sundayItems={sundayItems}
            onAddSundayItem={addSundayItem}
            onAddCustom={addCustom}
            onDelete={deleteItem}
            onLabelChange={(id, label) => setItems(prev => prev.map(i => i.id === id ? { ...i, label } : i))}
            onNotesChange={(id, notes) => setItems(prev => prev.map(i => i.id === id ? { ...i, item_notes: notes || null } : i))}
          />
        </div>
        {error && <p className="text-red-600 text-sm px-5 py-2 border-t border-red-100 bg-red-50">{error}</p>}
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className={btnCls('secondary')}>Close</button>
          <button onClick={save} disabled={saving} className={btnCls('primary')}>
            {saved ? <><Check className="w-3.5 h-3.5" /> Saved</> : <><Save className="w-3.5 h-3.5" /> {saving ? 'Saving…' : 'Save Items'}</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Create/Edit Event modal ───────────────────────────────────────────────────

interface EventModalProps {
  event?: SpecialEvent
  templates: EventTemplate[]
  onClose: () => void
  onSaved: (event: SpecialEvent) => void
}

function EventModal({ event, templates, onClose, onSaved }: EventModalProps) {
  const [name, setName] = useState(event?.name ?? '')
  const [date, setDate] = useState(event?.event_date ?? '')
  const [time, setTime] = useState(event?.event_time ?? '')
  const [templateId, setTemplateId] = useState(event?.template_id ?? '')
  const [notes, setNotes] = useState(event?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Preview of what items will be created from template
  const [previewItems, setPreviewItems] = useState<EventTemplateItem[]>([])
  useEffect(() => {
    if (!templateId) { setPreviewItems([]); return }
    supabase.from('event_template_items')
      .select('*')
      .eq('template_id', templateId)
      .order('sort_order')
      .then(({ data }) => setPreviewItems(data || []))
  }, [templateId])

  async function save() {
    if (!name.trim()) { setError('Event name is required'); return }
    if (!date) { setError('Date is required'); return }
    setSaving(true)
    setError('')
    try {
      let savedEvent: SpecialEvent
      if (event) {
        const { data, error: e } = await supabase
          .from('special_events')
          .update({ name: name.trim(), event_date: date, event_time: time || null, template_id: templateId || null, notes: notes.trim() || null })
          .eq('id', event.id)
          .select()
          .single()
        if (e) throw e
        savedEvent = data
      } else {
        const { data, error: e } = await supabase
          .from('special_events')
          .insert({ name: name.trim(), event_date: date, event_time: time || null, template_id: templateId || null, notes: notes.trim() || null })
          .select()
          .single()
        if (e) throw e
        savedEvent = data

        // Snapshot template items to event_checklist_items
        if (templateId && previewItems.length > 0) {
          const rows = previewItems.map((ti, i) => ({
            event_id: savedEvent.id,
            source_template_item_id: ti.id,
            source_checklist_item_id: ti.source_checklist_item_id,
            label: ti.label,
            section: ti.section,
            subsection: ti.subsection,
            item_notes: ti.item_notes,
            sort_order: i,
          }))
          const { error: e2 } = await supabase.from('event_checklist_items').insert(rows)
          if (e2) throw e2
        }
      }
      onSaved(savedEvent)
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            {event ? 'Edit Event' : 'New Special Event'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Event Name</label>
            <input className={inputCls()} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Good Friday Service" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
              <input type="date" className={inputCls()} value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Time (optional)</label>
              <input type="time" className={inputCls()} value={time} onChange={e => setTime(e.target.value)} />
            </div>
          </div>
          {!event && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Template (optional)</label>
              <select className={inputCls()} value={templateId} onChange={e => setTemplateId(e.target.value)}>
                <option value="">— No template (start blank) —</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              {previewItems.length > 0 && (
                <div className="mt-2 bg-purple-50 rounded-lg px-3 py-2">
                  <p className="text-xs font-medium text-purple-700 mb-1">{previewItems.length} items will be added from template:</p>
                  <ul className="text-xs text-purple-600 space-y-0.5">
                    {previewItems.slice(0, 5).map(i => <li key={i.id}>• {i.label}</li>)}
                    {previewItems.length > 5 && <li className="text-purple-400">…and {previewItems.length - 5} more</li>}
                  </ul>
                </div>
              )}
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
            <input className={inputCls()} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any notes about this event" />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className={btnCls('secondary')}>Cancel</button>
          <button onClick={save} disabled={saving} className={btnCls('primary')}>
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Saving…' : event ? 'Save Changes' : 'Create Event'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Save-as-template modal ────────────────────────────────────────────────────

interface SaveAsTemplateModalProps {
  event: SpecialEvent
  eventItems: EventChecklistItem[]
  onClose: () => void
  onSaved: () => void
}

function SaveAsTemplateModal({ event, eventItems, onClose, onSaved }: SaveAsTemplateModalProps) {
  const [name, setName] = useState(event.name)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!name.trim()) { setError('Name is required'); return }
    setSaving(true)
    try {
      const { data: tmpl, error: e } = await supabase
        .from('event_templates')
        .insert({ name: name.trim() })
        .select()
        .single()
      if (e) throw e
      if (eventItems.length > 0) {
        const rows = eventItems.map((item, i) => ({
          template_id: tmpl.id,
          source_checklist_item_id: item.source_checklist_item_id,
          label: item.label,
          section: item.section,
          subsection: item.subsection,
          item_notes: item.item_notes,
          sort_order: i,
        }))
        const { error: e2 } = await supabase.from('event_template_items').insert(rows)
        if (e2) throw e2
      }
      onSaved()
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Save as Template</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-gray-600">Creates a new template from this event's checklist items ({eventItems.length} items).</p>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Template Name</label>
            <input className={inputCls()} value={name} onChange={e => setName(e.target.value)} />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className={btnCls('secondary')}>Cancel</button>
          <button onClick={save} disabled={saving} className={btnCls('primary')}>
            <Save className="w-3.5 h-3.5" /> {saving ? 'Saving…' : 'Save Template'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main SpecialEventManager ──────────────────────────────────────────────────

export function SpecialEventManager({ onSessionsChange }: Props) {
  const [tab, setTab] = useState<'events' | 'templates'>('events')
  const [events, setEvents] = useState<SpecialEvent[]>([])
  const [templates, setTemplates] = useState<EventTemplate[]>([])
  const [sundayItems, setSundayItems] = useState<ChecklistItem[]>([])
  const [loading, setLoading] = useState(true)

  // Modal state
  const [showEventModal, setShowEventModal] = useState(false)
  const [editingEvent, setEditingEvent] = useState<SpecialEvent | undefined>()
  const [editingEventItems, setEditingEventItems] = useState<SpecialEvent | undefined>()
  const [savingAsTemplateEvent, setSavingAsTemplateEvent] = useState<{ event: SpecialEvent; items: EventChecklistItem[] } | null>(null)
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<EventTemplate | undefined>()

  useEffect(() => {
    Promise.all([
      supabase.from('special_events').select('*').order('event_date', { ascending: false }),
      supabase.from('event_templates').select('*').order('name'),
      supabase.from('checklist_items').select('*').order('sort_order'),
    ]).then(([evRes, tmRes, ciRes]) => {
      setEvents(evRes.data || [])
      setTemplates(tmRes.data || [])
      setSundayItems(ciRes.data || [])
      setLoading(false)
    })
  }, [])

  async function reload() {
    const [evRes, tmRes] = await Promise.all([
      supabase.from('special_events').select('*').order('event_date', { ascending: false }),
      supabase.from('event_templates').select('*').order('name'),
    ])
    setEvents(evRes.data || [])
    setTemplates(tmRes.data || [])
    const sessions = await loadAllSessions()
    onSessionsChange(sessions)
  }

  async function deleteEvent(id: string) {
    if (!confirm('Delete this event? All checklist items and completions will be lost.')) return
    await supabase.from('special_events').delete().eq('id', id)
    await reload()
  }

  async function deleteTemplate(id: string) {
    if (!confirm('Delete this template?')) return
    await supabase.from('event_templates').delete().eq('id', id)
    await reload()
  }

  async function openSaveAsTemplate(event: SpecialEvent) {
    const { data } = await supabase.from('event_checklist_items').select('*').eq('event_id', event.id).order('sort_order')
    setSavingAsTemplateEvent({ event, items: data || [] })
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  }

  if (loading) return <p className="text-sm text-gray-400 py-4">Loading…</p>

  return (
    <div>
      {/* Tab switcher */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        {(['events', 'templates'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'events' ? 'Events' : 'Templates'}
          </button>
        ))}
      </div>

      {tab === 'events' && (
        <div>
          <SectionHeader label="Special Events" onAdd={() => { setEditingEvent(undefined); setShowEventModal(true) }} addLabel="New Event" />
          {events.length === 0 && (
            <p className="text-sm text-gray-400 py-4">No special events yet. Create one to get started.</p>
          )}
          <div className="space-y-2">
            {events.map(ev => (
              <div key={ev.id} className="border border-gray-200 rounded-lg px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{ev.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {formatDate(ev.event_date)}
                      {ev.event_time && ` · ${ev.event_time}`}
                    </p>
                    {ev.notes && <p className="text-xs text-gray-400 mt-0.5">{ev.notes}</p>}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={() => openSaveAsTemplate(ev)}
                      className={btnCls('ghost', 'text-xs')}
                      title="Save as template"
                    >
                      <Copy className="w-3 h-3" /> Template
                    </button>
                    <button
                      onClick={() => setEditingEventItems(ev)}
                      className={btnCls('secondary', 'text-xs')}
                    >
                      <Pencil className="w-3 h-3" /> Items
                    </button>
                    <button
                      onClick={() => { setEditingEvent(ev); setShowEventModal(true) }}
                      className={btnCls('ghost', 'text-xs')}
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button onClick={() => deleteEvent(ev.id)} className={btnCls('danger', 'text-xs')}>
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'templates' && (
        <div>
          <SectionHeader label="Event Templates" onAdd={() => { setEditingTemplate(undefined); setShowTemplateModal(true) }} addLabel="New Template" />
          {templates.length === 0 && (
            <p className="text-sm text-gray-400 py-4">No templates yet. Create a template to reuse checklist items across events.</p>
          )}
          <div className="space-y-2">
            {templates.map(t => (
              <div key={t.id} className="border border-gray-200 rounded-lg px-4 py-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-gray-900">{t.name}</p>
                  {t.notes && <p className="text-xs text-gray-400 mt-0.5">{t.notes}</p>}
                </div>
                <div className="flex gap-1">
                  <button onClick={() => { setEditingTemplate(t); setShowTemplateModal(true) }} className={btnCls('secondary', 'text-xs')}>
                    <Pencil className="w-3 h-3" /> Edit
                  </button>
                  <button onClick={() => deleteTemplate(t.id)} className={btnCls('danger', 'text-xs')}>
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      {showEventModal && (
        <EventModal
          event={editingEvent}
          templates={templates}
          onClose={() => setShowEventModal(false)}
          onSaved={() => reload()}
        />
      )}
      {editingEventItems && (
        <EventItemsModal
          event={editingEventItems}
          sundayItems={sundayItems}
          onClose={() => setEditingEventItems(undefined)}
        />
      )}
      {showTemplateModal && (
        <TemplateModal
          template={editingTemplate}
          sundayItems={sundayItems}
          onClose={() => setShowTemplateModal(false)}
          onSaved={() => reload()}
        />
      )}
      {savingAsTemplateEvent && (
        <SaveAsTemplateModal
          event={savingAsTemplateEvent.event}
          eventItems={savingAsTemplateEvent.items}
          onClose={() => setSavingAsTemplateEvent(null)}
          onSaved={() => { reload(); setSavingAsTemplateEvent(null) }}
        />
      )}
    </div>
  )
}
