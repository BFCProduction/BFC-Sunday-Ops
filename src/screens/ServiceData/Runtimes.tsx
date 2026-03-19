import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, Server, Clock, CheckCircle2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAdmin } from '../../context/adminState'
import { RuntimeFieldModal } from '../../components/admin/RuntimeFieldModal'
import type { RuntimeField } from '../../components/admin/RuntimeFieldModal'

interface RuntimesProps { sundayId: string }

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

interface RuntimeValue {
  field_id: number
  value: string | null
  captured_at: string | null
}

export function Runtimes({ sundayId }: RuntimesProps) {
  const { isAdmin } = useAdmin()
  const [allFields, setAllFields] = useState<RuntimeField[]>([])
  const [values, setValues] = useState<Record<number, string>>({})
  const [captured, setCaptured] = useState<Record<number, string>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editField, setEditField] = useState<RuntimeField | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<RuntimeField | null>(null)

  const loadFields = useCallback(async () => {
    const { data } = await supabase
      .from('runtime_fields')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('pull_time', { ascending: true })
    setAllFields(data || [])
  }, [])

  const loadValues = useCallback(async () => {
    const { data } = await supabase
      .from('runtime_values')
      .select('field_id, value, captured_at')
      .eq('sunday_id', sundayId)
    if (data) {
      const vals: Record<number, string> = {}
      const caps: Record<number, string> = {}
      data.forEach((r: RuntimeValue) => {
        vals[r.field_id] = r.value || ''
        if (r.captured_at) {
          caps[r.field_id] = new Date(r.captured_at).toLocaleTimeString('en-US', {
            hour: 'numeric', minute: '2-digit'
          })
        }
      })
      setValues(vals)
      setCaptured(caps)
    }
  }, [sundayId])

  useEffect(() => {
    let active = true

    async function hydrate() {
      await Promise.all([loadFields(), loadValues()])
      if (active) setLoading(false)
    }

    hydrate()

    return () => {
      active = false
    }
  }, [loadFields, loadValues])

  const save = async () => {
    setSaving(true)
    const upserts = allFields
      .filter(f => values[f.id] !== undefined)
      .map(f => ({
        sunday_id: sundayId,
        field_id: f.id,
        value: values[f.id] || null,
        captured_at: new Date().toISOString(),
      }))
    if (upserts.length > 0) {
      await supabase.from('runtime_values').upsert(upserts, { onConflict: 'sunday_id,field_id' })
    }
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const deleteField = async (field: RuntimeField) => {
    await supabase.from('runtime_fields').delete().eq('id', field.id)
    setAllFields(prev => prev.filter(f => f.id !== field.id))
    setConfirmDelete(null)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-32">
      <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-4 fade-in">

      {/* Today's runtime values */}
      {allFields.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center">
          <p className="text-gray-500 text-sm">No runtime fields configured for today.</p>
          {isAdmin && (
            <p className="text-gray-400 text-xs mt-1">Use the admin panel below to add runtime fields.</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {allFields.map(field => (
            <div key={field.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-gray-900 text-sm font-medium">{field.label}</p>
                {isAdmin && (
                  <p className="text-gray-400 text-[10px] mt-0.5">
                    {field.host
                      ? `Pull at ${field.pull_time} · ${field.host}:${field.port} · clock index ${field.clock_number}`
                      : 'Manual entry only'}
                  </p>
                )}
                {!isAdmin && !field.host && (
                  <p className="text-gray-400 text-[10px] mt-0.5">Manual entry only</p>
                )}
                {captured[field.id] && (
                  <div className="flex items-center gap-1 mt-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                    <p className="text-emerald-600 text-[10px] font-medium">Auto-captured at {captured[field.id]}</p>
                  </div>
                )}
              </div>
              <input
                type="text"
                placeholder="H:MM:SS"
                value={values[field.id] ?? ''}
                onChange={e => setValues(p => ({ ...p, [field.id]: e.target.value }))}
                className="w-28 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-sm font-mono placeholder-gray-400 focus:outline-none focus:border-blue-500 text-center"
              />
            </div>
          ))}
        </div>
      )}

      {allFields.length > 0 && (
        <button onClick={save} disabled={saving}
          className={`px-8 py-2.5 rounded-lg font-semibold text-sm transition-all ${saved ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95 disabled:opacity-60'}`}>
          {saving ? 'Saving...' : saved ? 'Saved' : 'Save Runtimes'}
        </button>
      )}

      {/* Relay script note */}
      {!isAdmin && allFields.length > 0 && (
        <p className="text-gray-400 text-xs">
          Values auto-populate when the relay script runs for connected fields. Manual-only fields are entered directly here.
        </p>
      )}

      {/* Admin panel */}
      {isAdmin && (
        <div className="border border-amber-200 rounded-xl overflow-hidden">
          <div className="bg-amber-50 px-4 py-3 flex items-center justify-between border-b border-amber-200">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-amber-600" />
              <p className="text-gray-900 text-sm font-semibold">Runtime Field Definitions</p>
              <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">Admin</span>
            </div>
            <button
              onClick={() => { setEditField(null); setShowModal(true) }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors">
              <Plus className="w-3.5 h-3.5" />
              Add Field
            </button>
          </div>

          {allFields.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-gray-400 text-sm">No runtime fields yet. Add one to get started.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {allFields.map(field => (
                <div key={field.id} className="px-4 py-3 flex items-start gap-3 bg-white hover:bg-gray-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-gray-900 text-sm font-medium">{field.label}</p>
                      <span className="bg-gray-100 text-gray-500 text-[10px] font-semibold px-1.5 py-0.5 rounded">
                        {DAYS[field.pull_day]}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      <span className="flex items-center gap-1 text-gray-400 text-[11px]">
                        <Clock className="w-3 h-3" />{field.pull_time}
                      </span>
                      {field.host ? (
                        <span className="text-gray-400 text-[11px] font-mono">
                          {field.host}:{field.port} · clock index {field.clock_number}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-[11px]">Manual entry only</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => { setEditField(field); setShowModal(true) }}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setConfirmDelete(field)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="bg-gray-50 border-t border-gray-200 px-4 py-3">
            <p className="text-gray-500 text-xs font-semibold mb-1">Running the relay script</p>
            <p className="text-gray-400 text-[11px] leading-relaxed mb-2">
              Run on any Mac on the same network. It will wait and pull each field at its configured time.
            </p>
            <code className="block bg-gray-900 text-green-400 text-[11px] rounded px-3 py-2 font-mono">
              node scripts/propresenter-relay.js
            </code>
            <p className="text-gray-400 text-[10px] mt-1.5">
              Add <span className="font-mono">--now</span> to pull all connected fields immediately for testing. ProPresenter timer indexes are zero-based.
            </p>
          </div>
        </div>
      )}

      {/* Add/Edit modal */}
      {showModal && (
        <RuntimeFieldModal
          field={editField || undefined}
          onClose={() => { setShowModal(false); setEditField(null) }}
          onSaved={loadFields}
        />
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-gray-900 font-bold mb-2">Delete Field</h3>
            <p className="text-gray-500 text-sm mb-4">
              Delete "<span className="font-medium text-gray-700">{confirmDelete.label}</span>"?
              Captured values for this field will also be removed.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors">
                Cancel
              </button>
              <button onClick={() => deleteField(confirmDelete)}
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
