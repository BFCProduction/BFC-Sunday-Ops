import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useSunday } from '../../context/SundayContext'
import { Card } from '../../components/ui/Card'

export function Attendance() {
  const {
    activeEventId, serviceTypeName, serviceTypeColor,
    serviceTypeSlug, sundayId,
  } = useSunday()

  const [count,   setCount]   = useState('')
  const [notes,   setNotes]   = useState('')
  const [saved,   setSaved]   = useState(false)
  const [saving,  setSaving]  = useState(false)

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeEventId) return
    setCount('')
    setNotes('')
    let cancelled = false

    async function load() {
      // 1. Event-native record (new model)
      const { data: eventRow } = await supabase
        .from('attendance')
        .select('service_1_count, notes')
        .eq('event_id', activeEventId)
        .maybeSingle()

      if (cancelled) return
      if (eventRow) {
        setCount(eventRow.service_1_count?.toString() ?? '')
        setNotes(eventRow.notes ?? '')
        return
      }

      // 2. Legacy Sunday fallback
      if (sundayId) {
        const { data: sundayRow } = await supabase
          .from('attendance')
          .select('service_1_count, service_2_count, notes')
          .eq('sunday_id', sundayId)
          .maybeSingle()

        if (!cancelled && sundayRow) {
          const col = serviceTypeSlug === 'sunday-11am' ? 'service_2_count' : 'service_1_count'
          setCount((sundayRow[col] as number | null)?.toString() ?? '')
          setNotes(sundayRow.notes ?? '')
        }
      }
    }

    load()
    return () => { cancelled = true }
  }, [activeEventId, sundayId, serviceTypeSlug])

  // ── Save ──────────────────────────────────────────────────────────────────
  const submit = async () => {
    setSaving(true)

    const { data: existing } = await supabase
      .from('attendance')
      .select('id')
      .eq('event_id', activeEventId)
      .maybeSingle()

    const payload = {
      event_id:        activeEventId,
      service_1_count: count ? parseInt(count) : null,
      notes:           notes || null,
      submitted_at:    new Date().toISOString(),
    }

    if (existing) {
      await supabase.from('attendance').update(payload).eq('id', existing.id)
    } else {
      await supabase.from('attendance').insert(payload)
    }

    // Reload from DB so the displayed value always reflects what was saved
    const { data: reloaded } = await supabase
      .from('attendance')
      .select('service_1_count, notes')
      .eq('event_id', activeEventId)
      .maybeSingle()
    if (reloaded) {
      setCount(reloaded.service_1_count?.toString() ?? '')
      setNotes(reloaded.notes ?? '')
    }

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="space-y-4 fade-in">
      <Card className="p-4 space-y-3">
        <p className="text-gray-900 text-sm font-semibold flex items-center gap-2">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: serviceTypeColor }} />
          {serviceTypeName}
        </p>
        <div>
          <label className="block text-gray-500 text-xs font-medium mb-1.5">Attendance Count</label>
          <input
            type="number"
            placeholder="e.g. 312"
            value={count}
            onChange={e => setCount(e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-blue-500"
          />
        </div>
      </Card>

      <Card className="p-4">
        <label className="block text-gray-500 text-xs font-medium mb-1.5">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
        <input
          placeholder="Any context for today's count…"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-blue-500"
        />
      </Card>

      <button
        onClick={submit}
        disabled={saving}
        className={`px-8 py-2.5 rounded-lg font-semibold text-sm transition-all ${
          saved
            ? 'bg-emerald-600 text-white'
            : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95 disabled:opacity-60'
        }`}
      >
        {saving ? 'Saving...' : saved ? 'Saved' : 'Submit Attendance'}
      </button>
    </div>
  )
}
