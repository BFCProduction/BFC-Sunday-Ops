import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Card } from '../../components/ui/Card'

interface AttendanceProps {
  sundayId: string
  eventId?: string | null
}

export function Attendance({ sundayId, eventId }: AttendanceProps) {
  const [s1, setS1] = useState('')
  const [s2, setS2] = useState('')
  const [s3, setS3] = useState('')
  const [notes, setNotes] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const q = supabase.from('attendance').select('*')
    const filtered = eventId ? q.eq('event_id', eventId) : q.eq('sunday_id', sundayId)
    filtered.maybeSingle().then(({ data }) => {
      if (data) {
        setS1(data.service_1_count?.toString() || '')
        setS2(data.service_2_count?.toString() || '')
        setS3(data.service_3_count?.toString() || '')
        setNotes(data.notes || '')
      }
    })
  }, [sundayId, eventId])

  const submit = async () => {
    setSaving(true)
    if (eventId) {
      // Manual upsert for events (partial unique index can't be used with supabase upsert)
      const { data: existing } = await supabase.from('attendance').select('id').eq('event_id', eventId).maybeSingle()
      const payload = {
        event_id: eventId,
        service_1_count: s1 ? parseInt(s1) : null,
        service_2_count: s2 ? parseInt(s2) : null,
        service_3_count: s3 ? parseInt(s3) : null,
        notes: notes || null,
        submitted_at: new Date().toISOString(),
      }
      if (existing) {
        await supabase.from('attendance').update(payload).eq('id', existing.id)
      } else {
        await supabase.from('attendance').insert(payload)
      }
    } else {
      await supabase.from('attendance').upsert({
        sunday_id: sundayId,
        service_1_count: s1 ? parseInt(s1) : null,
        service_2_count: s2 ? parseInt(s2) : null,
        service_3_count: s3 ? parseInt(s3) : null,
        notes: notes || null,
        submitted_at: new Date().toISOString(),
      })
    }
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="space-y-4 fade-in">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4 space-y-3">
          <p className="text-gray-900 text-sm font-semibold flex items-center gap-2">
            <span className="w-5 h-5 bg-emerald-100 text-emerald-600 rounded text-[10px] font-bold flex items-center justify-center">1</span>
            8:00 AM Service
          </p>
          <div>
            <label className="block text-gray-500 text-xs font-medium mb-1.5">Attendance Count</label>
            <input type="number" placeholder="e.g. 215" value={s3} onChange={e => setS3(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-blue-500" />
          </div>
        </Card>
        <Card className="p-4 space-y-3">
          <p className="text-gray-900 text-sm font-semibold flex items-center gap-2">
            <span className="w-5 h-5 bg-blue-100 text-blue-600 rounded text-[10px] font-bold flex items-center justify-center">2</span>
            9:00 AM Service
          </p>
          <div>
            <label className="block text-gray-500 text-xs font-medium mb-1.5">Attendance Count</label>
            <input type="number" placeholder="e.g. 312" value={s1} onChange={e => setS1(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-blue-500" />
          </div>
        </Card>
        <Card className="p-4 space-y-3">
          <p className="text-gray-900 text-sm font-semibold flex items-center gap-2">
            <span className="w-5 h-5 bg-purple-100 text-purple-600 rounded text-[10px] font-bold flex items-center justify-center">3</span>
            11:00 AM Service
          </p>
          <div>
            <label className="block text-gray-500 text-xs font-medium mb-1.5">Attendance Count</label>
            <input type="number" placeholder="e.g. 428" value={s2} onChange={e => setS2(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-blue-500" />
          </div>
        </Card>
      </div>
      <Card className="p-4">
        <label className="block text-gray-500 text-xs font-medium mb-1.5">Notes (optional)</label>
        <input placeholder="Any context for today's counts…" value={notes} onChange={e => setNotes(e.target.value)}
          className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-blue-500" />
      </Card>
      <button onClick={submit} disabled={saving}
        className={`px-8 py-2.5 rounded-lg font-semibold text-sm transition-all ${saved ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95 disabled:opacity-60'}`}>
        {saving ? 'Saving...' : saved ? 'Saved' : 'Submit Attendance'}
      </button>
    </div>
  )
}
