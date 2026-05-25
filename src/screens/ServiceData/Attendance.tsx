import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useSunday } from '../../context/SundayContext'
import { Card } from '../../components/ui/Card'
import {
  combinedAttendance,
  formatHistoryInt,
  useRecentServiceHistory,
} from './historyData'
import { ServiceHistoryTable } from './history'

function toServiceType(slug: string): string {
  if (slug === 'sunday-9am')  return 'regular_9am'
  if (slug === 'sunday-11am') return 'regular_11am'
  return 'special'
}

export function Attendance() {
  const {
    activeEventId, serviceTypeName, serviceTypeColor,
    serviceTypeSlug, sessionDate, eventName,
  } = useSunday()

  const [count,  setCount]  = useState('')
  const [saved,  setSaved]  = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const {
    rows: historyRows,
    loading: historyLoading,
    error: historyError,
  } = useRecentServiceHistory(serviceTypeSlug, sessionDate)

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeEventId) return
    let cancelled = false

    async function load() {
      const { data } = await supabase
        .from('service_records')
        .select('in_person_attendance')
        .eq('event_id', activeEventId)
        .maybeSingle()

      if (!cancelled) setCount(data?.in_person_attendance?.toString() ?? '')
    }

    load()
    return () => { cancelled = true }
  }, [activeEventId])

  // ── Save ──────────────────────────────────────────────────────────────────
  const submit = async () => {
    setSaving(true)
    setNotice('')

    try {
      if (!activeEventId) throw new Error('No active event is selected.')

      const attendanceCount = count ? parseInt(count, 10) : null
      const { data: existing, error: existingError } = await supabase
        .from('service_records')
        .select('id')
        .eq('event_id', activeEventId)
        .maybeSingle()
      if (existingError) throw existingError

      if (existing) {
        const { error } = await supabase
          .from('service_records')
          .update({ in_person_attendance: attendanceCount })
          .eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('service_records').insert({
          event_id:             activeEventId,
          service_date:         sessionDate,
          service_type:         toServiceType(serviceTypeSlug),
          service_label:        serviceTypeSlug === 'special' ? (eventName ?? null) : null,
          in_person_attendance: attendanceCount,
        })
        if (error) throw error
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Attendance could not be saved.')
    } finally {
      setSaving(false)
    }
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
      {notice && <p className="text-red-600 text-xs font-medium">{notice}</p>}

      <ServiceHistoryTable
        title="Past 10 Sundays"
        subtitle={`${serviceTypeName} attendance`}
        color={serviceTypeColor}
        rows={historyRows}
        loading={historyLoading}
        error={historyError}
        columns={[
          {
            key: 'in-person',
            label: 'In-Person',
            align: 'right',
            mono: true,
            render: row => formatHistoryInt(row.in_person_attendance),
          },
          {
            key: 'combined',
            label: 'Combined',
            align: 'right',
            mono: true,
            render: row => formatHistoryInt(combinedAttendance(row)),
          },
        ]}
      />
    </div>
  )
}
