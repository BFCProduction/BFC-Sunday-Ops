import { useEffect, useState } from 'react'
import { AlertTriangle, ChevronLeft, Download, Pencil, Plus, Trash2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { EventTemplate, EventTemplateItem } from '../../types'

const ADD_NEW = '__add_new__'

// ── Template item form modal ──────────────────────────────────────────────────

interface TemplateItemFormModalProps {
  templateId: string
  item?: EventTemplateItem
  sectionOptions: string[]
  subsectionsBySection: Record<string, string[]>
  onClose: () => void
  onSaved: () => void
}

function TemplateItemFormModal({
  templateId, item, sectionOptions, subsectionsBySection, onClose, onSaved,
}: TemplateItemFormModalProps) {
  const [label, setLabel] = useState(item?.label ?? '')
  const [section, setSection] = useState(item?.section ?? sectionOptions[0] ?? '')
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
      const { error: e } = await supabase.from('event_template_items').update(payload).eq('id', item.id)
      if (e) { setError(e.message); setSaving(false); return }
    } else {
      const { error: e } = await supabase.from('event_template_items').insert({
        ...payload,
        template_id: templateId,
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
          <h3 className="text-gray-900 font-bold">{item ? 'Edit Template Item' : 'Add Template Item'}</h3>
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
                {sectionOptions.length === 0 && <option value="">No sections yet</option>}
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

// ── Template editor ───────────────────────────────────────────────────────────

interface TemplateWithCount extends EventTemplate {
  itemCount: number
}

interface TemplateEditorProps {
  template: TemplateWithCount
  onBack: () => void
}

function TemplateEditor({ template, onBack }: TemplateEditorProps) {
  const [items, setItems] = useState<EventTemplateItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showItemForm, setShowItemForm] = useState(false)
  const [editItem, setEditItem] = useState<EventTemplateItem | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<EventTemplateItem | null>(null)

  const loadItems = async () => {
    const { data } = await supabase
      .from('event_template_items')
      .select('*')
      .eq('template_id', template.id)
      .order('sort_order')
    setItems((data || []) as EventTemplateItem[])
    setLoading(false)
  }

  useEffect(() => { void loadItems() }, [template.id])

  const deleteItem = async (item: EventTemplateItem) => {
    await supabase.from('event_template_items').delete().eq('id', item.id)
    setItems(prev => prev.filter(i => i.id !== item.id))
    setConfirmDelete(null)
  }

  const allSections = Array.from(new Set(items.map(i => i.section)))
  const subsectionsBySection: Record<string, string[]> = {}
  items.forEach(i => {
    if (i.subsection) {
      if (!subsectionsBySection[i.section]) subsectionsBySection[i.section] = []
      if (!subsectionsBySection[i.section].includes(i.subsection))
        subsectionsBySection[i.section].push(i.subsection)
    }
  })

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          All Templates
        </button>
        <span className="text-gray-300 text-xs">/</span>
        <span className="text-gray-900 text-sm font-semibold">{template.name}</span>
      </div>

      {template.notes && (
        <p className="text-gray-500 text-xs mb-4 leading-relaxed">{template.notes}</p>
      )}

      <div className="flex items-center justify-between mb-3">
        <p className="text-gray-500 text-xs">{items.length} item{items.length !== 1 ? 's' : ''}</p>
        <button
          onClick={() => { setEditItem(null); setShowItemForm(true) }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Item
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="border border-dashed border-gray-200 rounded-xl px-4 py-8 text-center">
          <p className="text-gray-400 text-sm">No items in this template yet.</p>
          <p className="text-gray-300 text-xs mt-1">Click "Add Item" to add the first checklist item.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {items.map(item => (
            <div
              key={item.id}
              className="flex items-start justify-between gap-3 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-gray-900 text-sm leading-snug">{item.label}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-gray-400 text-[10px]">{item.section}</span>
                  {item.subsection && (
                    <>
                      <span className="text-gray-300 text-[10px]">·</span>
                      <span className="text-gray-400 text-[10px]">{item.subsection}</span>
                    </>
                  )}
                </div>
                {item.item_notes && (
                  <p className="text-gray-400 text-[11px] mt-1 leading-snug">{item.item_notes}</p>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => { setEditItem(item); setShowItemForm(true) }}
                  className="p-1 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setConfirmDelete(item)}
                  className="p-1 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showItemForm && (
        <TemplateItemFormModal
          templateId={template.id}
          item={editItem || undefined}
          sectionOptions={allSections}
          subsectionsBySection={subsectionsBySection}
          onClose={() => { setShowItemForm(false); setEditItem(null) }}
          onSaved={loadItems}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-gray-900 font-bold mb-2">Delete Item</h3>
            <p className="text-gray-500 text-sm mb-4">
              Delete "<span className="font-medium text-gray-700">{confirmDelete.label}</span>"? This cannot be undone.
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

// ── Template list ─────────────────────────────────────────────────────────────

interface TemplateListProps {
  templates: TemplateWithCount[]
  onEdit: (template: TemplateWithCount) => void
  onNew: () => void
  onDelete: (template: TemplateWithCount) => void
  onApply?: (templateId: string) => Promise<void>
  onRemove?: (templateId: string) => Promise<void>
  onClearAll?: () => Promise<void>
}

function TemplateList({ templates, onEdit, onNew, onDelete, onApply, onRemove, onClearAll }: TemplateListProps) {
  const [applying, setApplying] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [clearingAll, setClearingAll] = useState(false)
  const [actionError, setActionError] = useState('')
  const [confirmRemove, setConfirmRemove] = useState<TemplateWithCount | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  const handleApply = async (t: TemplateWithCount) => {
    if (!onApply) return
    setApplying(t.id)
    setActionError('')
    try {
      await onApply(t.id)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to apply template')
    }
    setApplying(null)
  }

  const handleRemove = async (t: TemplateWithCount) => {
    if (!onRemove) return
    setRemoving(t.id)
    setConfirmRemove(null)
    setActionError('')
    try {
      await onRemove(t.id)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to remove template items')
    }
    setRemoving(null)
  }

  const handleClearAll = async () => {
    if (!onClearAll) return
    setClearingAll(true)
    setConfirmClear(false)
    setActionError('')
    try {
      await onClearAll()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to clear checklist')
    }
    setClearingAll(false)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-gray-500 text-xs">{templates.length} template{templates.length !== 1 ? 's' : ''}</p>
        <div className="flex items-center gap-2">
          {onClearAll && (
            <button
              onClick={() => setConfirmClear(true)}
              disabled={clearingAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {clearingAll ? 'Clearing…' : 'Clear All Items'}
            </button>
          )}
          <button
            onClick={onNew}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New Template
          </button>
        </div>
      </div>

      {confirmClear && (
        <div className="mb-3 bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-start gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-red-800 text-sm font-medium">Delete all checklist items? This cannot be undone.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setConfirmClear(false)}
              className="flex-1 py-2 bg-white border border-gray-200 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button onClick={handleClearAll}
              className="flex-1 py-2 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 transition-colors">
              Delete All
            </button>
          </div>
        </div>
      )}

      {confirmRemove && (
        <div className="mb-3 bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-start gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-red-800 text-sm font-medium">
              Remove all items from "<span className="font-bold">{confirmRemove.name}</span>" from the checklist?
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setConfirmRemove(null)}
              className="flex-1 py-2 bg-white border border-gray-200 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button onClick={() => handleRemove(confirmRemove)}
              className="flex-1 py-2 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 transition-colors">
              Remove
            </button>
          </div>
        </div>
      )}

      {actionError && (
        <p className="text-red-500 text-xs mb-3">{actionError}</p>
      )}

      {templates.length === 0 ? (
        <div className="border border-dashed border-gray-200 rounded-xl px-4 py-8 text-center">
          <p className="text-gray-400 text-sm">No templates yet.</p>
          <p className="text-gray-300 text-xs mt-1">Create a template to quickly seed checklist items when creating a special event.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map(t => (
            <div
              key={t.id}
              className="flex items-center justify-between gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-gray-900 text-sm font-semibold">{t.name}</p>
                  <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.5 rounded-full font-semibold">
                    {t.itemCount} item{t.itemCount !== 1 ? 's' : ''}
                  </span>
                </div>
                {t.notes && (
                  <p className="text-gray-400 text-xs mt-0.5 truncate">{t.notes}</p>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {onApply && (
                  <button
                    onClick={() => handleApply(t)}
                    disabled={applying === t.id || removing === t.id}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 transition-colors disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {applying === t.id ? 'Applying…' : 'Apply'}
                  </button>
                )}
                {onRemove && (
                  <button
                    onClick={() => setConfirmRemove(t)}
                    disabled={removing === t.id || applying === t.id}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" />
                    {removing === t.id ? 'Removing…' : 'Remove'}
                  </button>
                )}
                <button
                  onClick={() => onEdit(t)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit
                </button>
                <button
                  onClick={() => onDelete(t)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main TemplateManager ──────────────────────────────────────────────────────

interface TemplateManagerProps {
  onApply?: (templateId: string) => Promise<void>
  onRemove?: (templateId: string) => Promise<void>
  onClearAll?: () => Promise<void>
}

export function TemplateManager({ onApply, onRemove, onClearAll }: TemplateManagerProps = {}) {
  const [templates, setTemplates] = useState<TemplateWithCount[]>([])
  const [loading, setLoading] = useState(true)
  const [editingTemplate, setEditingTemplate] = useState<TemplateWithCount | null>(null)
  const [showNewForm, setShowNewForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [confirmDeleteTemplate, setConfirmDeleteTemplate] = useState<TemplateWithCount | null>(null)

  const loadTemplates = async () => {
    const { data } = await supabase
      .from('event_templates')
      .select('id, name, notes, created_at, event_template_items(id)')
      .order('name')
    const rows = (data || []) as (EventTemplate & { event_template_items: { id: string }[] })[]
    setTemplates(rows.map(t => ({
      id: t.id,
      name: t.name,
      notes: t.notes,
      created_at: t.created_at,
      itemCount: t.event_template_items?.length ?? 0,
    })))
    setLoading(false)
  }

  useEffect(() => { void loadTemplates() }, [])

  const createTemplate = async () => {
    if (!newName.trim()) { setFormError('Template name is required'); return }
    setSaving(true)
    setFormError('')
    const { error } = await supabase.from('event_templates').insert({
      name: newName.trim(),
      notes: newNotes.trim() || null,
    })
    setSaving(false)
    if (error) { setFormError(error.message); return }
    setNewName('')
    setNewNotes('')
    setShowNewForm(false)
    await loadTemplates()
  }

  const deleteTemplate = async (t: TemplateWithCount) => {
    await supabase.from('event_templates').delete().eq('id', t.id)
    setTemplates(prev => prev.filter(x => x.id !== t.id))
    setConfirmDeleteTemplate(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (editingTemplate) {
    return (
      <TemplateEditor
        template={editingTemplate}
        onBack={() => { setEditingTemplate(null); void loadTemplates() }}
      />
    )
  }

  return (
    <div>
      {showNewForm ? (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4">
          <p className="text-gray-900 text-sm font-semibold mb-3">New Template</p>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Name *</label>
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Template name…"
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Notes <span className="text-gray-400 normal-case font-normal">(optional)</span>
              </label>
              <textarea
                rows={2}
                value={newNotes}
                onChange={e => setNewNotes(e.target.value)}
                placeholder="Describe when to use this template…"
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 text-sm focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>
            {formError && <p className="text-red-500 text-xs">{formError}</p>}
            <div className="flex gap-3">
              <button
                onClick={() => { setShowNewForm(false); setNewName(''); setNewNotes(''); setFormError('') }}
                className="flex-1 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createTemplate}
                disabled={saving}
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-60"
              >
                {saving ? 'Creating…' : 'Create Template'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <TemplateList
        templates={templates}
        onEdit={t => setEditingTemplate(t)}
        onNew={() => setShowNewForm(true)}
        onDelete={t => setConfirmDeleteTemplate(t)}
        onApply={onApply}
        onRemove={onRemove}
        onClearAll={onClearAll}
      />

      {confirmDeleteTemplate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-gray-900 font-bold mb-2">Delete Template</h3>
            <p className="text-gray-500 text-sm mb-4">
              Delete "<span className="font-medium text-gray-700">{confirmDeleteTemplate.name}</span>" and all its items? This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeleteTemplate(null)}
                className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors">
                Cancel
              </button>
              <button onClick={() => deleteTemplate(confirmDeleteTemplate)}
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
