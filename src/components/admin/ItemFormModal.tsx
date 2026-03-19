import { useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { ROLE_COLORS } from '../../data/checklist'
import type { ChecklistItemRecord } from '../../lib/checklist'

interface Props {
  item?: ChecklistItemRecord
  defaultSection?: string
  sectionOptions?: string[]
  onClose: () => void
  onSaved: () => void
}

const ROLES_LIST = ['A1', 'Video', 'Graphics', 'Lighting', 'Stage']

export function ItemFormModal({ item, defaultSection, sectionOptions = [], onClose, onSaved }: Props) {
  const [task, setTask] = useState(item?.task || '')
  const [role, setRole] = useState(item?.role || 'A1')
  const [section, setSection] = useState(item?.section || defaultSection || sectionOptions[0] || '')
  const [subsection, setSubsection] = useState(item?.subsection || '')
  const [note, setNote] = useState(item?.note || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (!task.trim()) { setError('Task description is required'); return }
    if (!section.trim()) { setError('Section is required'); return }
    setSaving(true)
    const payload = {
      task: task.trim(),
      role,
      section: section.trim(),
      subsection: subsection.trim() || null,
      note: note.trim() || null,
      sort_order: item?.sort_order ?? 999,
    }
    let err: { message: string } | null = null
    if (item) {
      const result = await supabase.from('checklist_items').update(payload).eq('id', item.id)
      err = result.error
    } else {
      const result = await supabase.from('checklist_items').insert(payload)
      err = result.error
    }
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <h3 className="text-gray-900 font-bold">{item ? 'Edit Item' : 'Add Item'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Task *</label>
            <textarea
              rows={2}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 text-sm focus:outline-none focus:border-blue-500 resize-none"
              value={task} onChange={e => setTask(e.target.value)} placeholder="Task description"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Role *</label>
            <div className="flex flex-wrap gap-2">
              {ROLES_LIST.map(r => (
                <button key={r} onClick={() => setRole(r)}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                  style={role === r
                    ? { background: ROLE_COLORS[r], color: '#fff' }
                    : { background: '#f3f4f6', color: '#6b7280' }}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Section *</label>
            <input
              list="section-options"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 text-sm focus:outline-none focus:border-blue-500"
              value={section} onChange={e => setSection(e.target.value)} placeholder="Choose or type a section name"
            />
            <datalist id="section-options">
              {sectionOptions.map(s => <option key={s} value={s} />)}
            </datalist>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Subsection <span className="text-gray-400 normal-case font-normal">(optional)</span>
            </label>
            <input
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 text-sm focus:outline-none focus:border-blue-500"
              value={subsection} onChange={e => setSubsection(e.target.value)} placeholder="e.g. DiGiCo SD12"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Note <span className="text-gray-400 normal-case font-normal">(optional)</span>
            </label>
            <textarea
              rows={2}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 text-sm focus:outline-none focus:border-blue-500 resize-none"
              value={note} onChange={e => setNote(e.target.value)} placeholder="Additional context shown below the task"
            />
          </div>

          {error && <p className="text-red-500 text-xs">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button onClick={onClose}
              className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-60">
              {saving ? 'Saving...' : (item ? 'Save Changes' : 'Add Item')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
