import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Card } from '../../components/ui/Card'

interface AttendanceProps { sundayId: string }

export function Attendance({ sundayId }: AttendanceProps) {
  const [s1, setS1] = useState('')
  const [s2, setS2] = useState('')
  const [notes, setNotes] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('attendance').select('*').eq('sunday_id', sundayId).single()
      .then(({ data }) => {
        if (data) {
          setS1(data.service_1_count?.toString() || '')
          setS2(data.service_2_count?.toString() || '')
          setNotes(data.notes || '')
        }
      })
  }, [sundayId])

  const submit = async () => {
    setSaving(true)
    await supabase.from('attendance').upsert({
      sunday_id: sundayId,
      service_1_count: s1 ? parseInt(s1) : null,
      service_2_count: s2 ? parseInt(s2) : null,
      notes: notes || null,
      submitted_at: new Date().toISOString(),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="space-y-4 fade-in">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex gap-2">
        <p className="text-blue-700 text-xs leading-relaxed">Replaces the attendance text sent after each service. Submit counts after each service wraps.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4 space-y-3">
          <p className="text-gray-900 text-sm font-semibold flex items-center gap-2">
            <span className="w-5 h-5 bg-blue-100 text-blue-600 rounded text-[10px] font-bold flex items-center justify-center">1</span>
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
            <span className="w-5 h-5 bg-purple-100 text-purple-600 rounded text-[10px] font-bold flex items-center justify-center">2</span>
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
