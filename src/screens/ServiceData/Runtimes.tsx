import { useState, useEffect, useCallback, type CSSProperties, type ReactNode } from 'react'
import { Plus, Pencil, Trash2, CheckCircle2, GripVertical } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAdmin } from '../../context/adminState'
import { useSunday } from '../../context/SundayContext'
import { syncToServiceRecords } from '../../lib/serviceRecords'
import { RuntimeFieldModal } from '../../components/admin/RuntimeFieldModal'
import type { RuntimeField } from '../../components/admin/RuntimeFieldModal'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface RuntimeValueRowProps {
  field: RuntimeField
  value: string
  capturedAt?: string
  isAdmin: boolean
  onValueChange: (value: string) => void
  onEdit: (f: RuntimeField) => void
  onDelete: (f: RuntimeField) => void
  dragHandle?: ReactNode
  rootRef?: (node: HTMLDivElement | null) => void
  style?: CSSProperties
  isDragging?: boolean
}

function RuntimeValueRow({
  field,
  value,
  capturedAt,
  isAdmin,
  onValueChange,
  onEdit,
  onDelete,
  dragHandle,
  rootRef,
  style,
  isDragging = false,
}: RuntimeValueRowProps) {
  return (
    <div
      ref={rootRef}
      style={style}
      className={`bg-white border border-gray-200 rounded-xl p-4 transition-all ${
        isDragging ? 'shadow-lg ring-2 ring-blue-100 opacity-90' : ''
      }`}
    >
      <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
        {isAdmin && dragHandle}
        <div className="flex-1 min-w-[180px]">
          <p className="text-gray-900 text-sm font-medium">{field.label}</p>
          {isAdmin && (
            <div className="flex items-center gap-2 flex-wrap text-gray-400 text-[10px] mt-0.5">
              {field.host ? (
                <>
                  <span>Pull {DAYS[field.pull_day]} at {field.pull_time}</span>
                  <span>{field.host}:{field.port} · clock index {field.clock_number}</span>
                </>
              ) : (
                <span>Manual entry only</span>
              )}
            </div>
          )}
          {!isAdmin && !field.host && (
            <p className="text-gray-400 text-[10px] mt-0.5">Manual entry only</p>
          )}
          {capturedAt && (
            <div className="flex items-center gap-1 mt-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              <p className="text-emerald-600 text-[10px] font-medium">Saved at {capturedAt}</p>
            </div>
          )}
        </div>
        <input
          type="text"
          placeholder="H:MM:SS"
          value={value}
          onChange={e => onValueChange(e.target.value)}
          className="w-28 max-sm:flex-1 max-sm:min-w-[120px] bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-sm font-mono placeholder-gray-400 focus:outline-none focus:border-blue-500 text-center"
        />
        {isAdmin && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              type="button"
              onClick={() => onEdit(field)}
              aria-label={`Edit ${field.label}`}
              className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(field)}
              aria-label={`Delete ${field.label}`}
              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function SortableRuntimeValueRow(props: RuntimeValueRowProps) {
  const { field } = props
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.9 : 1,
  }

  return (
    <RuntimeValueRow
      {...props}
      rootRef={setNodeRef}
      style={style}
      isDragging={isDragging}
      dragHandle={(
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Move ${field.label}`}
          className="p-1 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing touch-none flex-shrink-0"
        >
          <GripVertical className="w-4 h-4" />
        </button>
      )}
    />
  )
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Parse "H:MM:SS" or "M:SS" into total seconds. Returns null if unparseable. */
function parseTimeSecs(str: string): number | null {
  if (!str.trim()) return null
  const parts = str.trim().split(':').map(Number)
  if (parts.some(isNaN)) return null
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return null
}


interface RuntimeValue {
  field_id: number
  value: string | null
  captured_at: string | null
}

export function Runtimes() {
  const { isAdmin } = useAdmin()
  const { activeEventId, sundayId, sessionDate, eventName, timezone, serviceTypeSlug } = useSunday()
  const eventId = activeEventId   // alias for clarity
  const [allFields, setAllFields] = useState<RuntimeField[]>([])
  const [values, setValues] = useState<Record<number, string>>({})
  const [captured, setCaptured] = useState<Record<number, string>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editField, setEditField] = useState<RuntimeField | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<RuntimeField | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  )

  const loadFields = useCallback(async () => {
    // Show fields scoped to this service type, or global (null) fields
    const { data } = await supabase
      .from('runtime_fields')
      .select('*')
      .or(`service_type_slug.is.null,service_type_slug.eq.${serviceTypeSlug}`)
      .order('sort_order', { ascending: true })
      .order('pull_time', { ascending: true })
    setAllFields(data || [])
  }, [serviceTypeSlug])

  const loadValues = useCallback(async () => {
    const q = supabase.from('runtime_values').select('field_id, value, captured_at')
    // Try event-native first; fall back to legacy Sunday record
    const { data: eventData } = await q.eq('event_id', eventId)
    const data = eventData && eventData.length > 0
      ? eventData
      : sundayId
        ? (await supabase.from('runtime_values').select('field_id, value, captured_at').eq('sunday_id', sundayId)).data
        : null
    if (data) {
      const vals: Record<number, string> = {}
      const caps: Record<number, string> = {}
      data.forEach((r: RuntimeValue) => {
        vals[r.field_id] = r.value || ''
        if (r.captured_at) {
          caps[r.field_id] = new Date(r.captured_at).toLocaleTimeString('en-US', {
            hour: 'numeric', minute: '2-digit', timeZone: timezone,
          })
        }
      })
      setValues(vals)
      setCaptured(caps)
    }
  }, [sundayId, eventId, timezone])

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
    const fields = allFields.filter(f => values[f.id] !== undefined)
    if (fields.length > 0) {
      if (eventId) {
        // For events, use manual upsert to work around partial unique index
        for (const f of fields) {
          const { data: existing } = await supabase.from('runtime_values').select('id').eq('event_id', eventId).eq('field_id', f.id).maybeSingle()
          const payload = { event_id: eventId, field_id: f.id, value: values[f.id] || null, captured_at: new Date().toISOString() }
          if (existing) {
            await supabase.from('runtime_values').update(payload).eq('id', existing.id)
          } else {
            await supabase.from('runtime_values').insert(payload)
          }
        }
      } else {
        const upserts = fields.map(f => ({
          sunday_id: sundayId,
          field_id: f.id,
          value: values[f.id] || null,
          captured_at: new Date().toISOString(),
        }))
        await supabase.from('runtime_values').upsert(upserts, { onConflict: 'sunday_id,field_id' })
      }
    }
    // Sync tagged fields to service_records
    const colMap: Record<string, string> = {
      service_run_time: 'service_run_time_secs',
      message_run_time: 'message_run_time_secs',
      stage_flip_time:  'stage_flip_time_secs',
    }
    const analyticsFields: Record<string, number | null> = {}
    for (const f of allFields) {
      if (!f.analytics_key || values[f.id] === undefined) continue
      const col = colMap[f.analytics_key]
      if (col) analyticsFields[col] = parseTimeSecs(values[f.id] || '')
    }
    if (Object.keys(analyticsFields).length > 0) {
      await syncToServiceRecords({
        serviceTypeSlug,
        sundayId: sundayId ?? null,
        sessionDate,
        eventName: eventName ?? null,
        fields: analyticsFields,
      })
    }

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const deleteField = async (field: RuntimeField) => {
    await supabase.from('runtime_fields').delete().eq('id', field.id)
    setAllFields(prev => prev.filter(f => f.id !== field.id))
    setValues(prev => {
      const next = { ...prev }
      delete next[field.id]
      return next
    })
    setCaptured(prev => {
      const next = { ...prev }
      delete next[field.id]
      return next
    })
    setConfirmDelete(null)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = allFields.findIndex(f => f.id === active.id)
    const newIndex = allFields.findIndex(f => f.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(allFields, oldIndex, newIndex).map((f, i) => ({ ...f, sort_order: i }))
    setAllFields(reordered)
    await supabase.from('runtime_fields').upsert(reordered)
  }

  const openAddRuntime = () => {
    setEditField(null)
    setShowModal(true)
  }

  const openEditRuntime = (field: RuntimeField) => {
    setEditField(field)
    setShowModal(true)
  }

  const nextSortOrder = allFields.length > 0
    ? Math.max(...allFields.map(field => field.sort_order ?? 0)) + 1
    : 0

  if (loading) return (
    <div className="flex items-center justify-center h-32">
      <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-4 fade-in">

      {isAdmin && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-gray-500 text-xs">Drag runtimes to reorder. Use the pencil to edit a runtime.</p>
          <button
            type="button"
            onClick={openAddRuntime}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Runtime
          </button>
        </div>
      )}

      {/* Today's runtime values */}
      {allFields.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center">
          <p className="text-gray-500 text-sm">No runtimes configured for this service.</p>
          {isAdmin && (
            <button
              type="button"
              onClick={openAddRuntime}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Runtime
            </button>
          )}
        </div>
      ) : isAdmin ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={allFields.map(f => f.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {allFields.map(field => (
                <SortableRuntimeValueRow
                  key={field.id}
                  field={field}
                  value={values[field.id] ?? ''}
                  capturedAt={captured[field.id]}
                  isAdmin={isAdmin}
                  onValueChange={value => setValues(p => ({ ...p, [field.id]: value }))}
                  onEdit={openEditRuntime}
                  onDelete={setConfirmDelete}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="space-y-2">
          {allFields.map(field => (
            <RuntimeValueRow
              key={field.id}
              field={field}
              value={values[field.id] ?? ''}
              capturedAt={captured[field.id]}
              isAdmin={isAdmin}
              onValueChange={value => setValues(p => ({ ...p, [field.id]: value }))}
              onEdit={openEditRuntime}
              onDelete={setConfirmDelete}
            />
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

      {/* Add/Edit modal */}
      {showModal && (
        <RuntimeFieldModal
          field={editField || undefined}
          defaultServiceTypeSlug={editField ? undefined : serviceTypeSlug}
          defaultSortOrder={editField ? undefined : nextSortOrder}
          onClose={() => { setShowModal(false); setEditField(null) }}
          onSaved={loadFields}
        />
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-gray-900 font-bold mb-2">Delete Runtime</h3>
            <p className="text-gray-500 text-sm mb-4">
              Delete "<span className="font-medium text-gray-700">{confirmDelete.label}</span>"?
              Captured values for this runtime will also be removed.
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
