import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Card } from '../../components/ui/Card'

interface RuntimesProps { sundayId: string }

export function Runtimes({ sundayId }: RuntimesProps) {
  const [rt, setRt] = useState({ s1Svc: '', s1Msg: '', s2Svc: '', s2Msg: '', flip: '' })
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('service_runtimes').select('*').eq('sunday_id', sundayId).single()
      .then(({ data }) => {
        if (data) setRt({
          s1Svc: data.service_1_runtime || '', s1Msg: data.service_1_message_runtime || '',
          s2Svc: data.service_2_runtime || '', s2Msg: data.service_2_message_runtime || '',
          flip: data.flip_time || '',
        })
      })
  }, [sundayId])

  const save = async () => {
    setSaving(true)
    await supabase.from('service_runtimes').upsert({
      sunday_id: sundayId,
      service_1_runtime: rt.s1Svc || null,
      service_1_message_runtime: rt.s1Msg || null,
      service_2_runtime: rt.s2Svc || null,
      service_2_message_runtime: rt.s2Msg || null,
      flip_time: rt.flip || null,
      saved_at: new Date().toISOString(),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const Field = ({ label, k, hint }: { label: string; k: keyof typeof rt; hint?: string }) => (
    <div>
      <label className="block text-gray-500 text-xs font-medium mb-1.5">{label}</label>
      <input type="text" placeholder="H:MM:SS" value={rt[k]} onChange={e => setRt(p => ({ ...p, [k]: e.target.value }))}
        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 text-sm font-mono placeholder-gray-400 focus:outline-none focus:border-blue-500" />
      {hint && <p className="text-gray-400 text-[10px] mt-1">{hint}</p>}
    </div>
  )

  return (
    <div className="space-y-4 fade-in">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4 space-y-3">
          <p className="text-gray-900 text-sm font-semibold">9:00 AM Service</p>
          <Field label="Service Runtime" k="s1Svc" hint="Opening to benediction" />
          <Field label="Message Runtime" k="s1Msg" />
        </Card>
        <Card className="p-4 space-y-3">
          <p className="text-gray-900 text-sm font-semibold">11:00 AM Service</p>
          <Field label="Service Runtime" k="s2Svc" />
          <Field label="Message Runtime" k="s2Msg" />
        </Card>
      </div>
      <Card className="p-4">
        <label className="block text-gray-500 text-xs font-medium mb-1.5">Flip Time</label>
        <input type="text" placeholder="MM:SS" value={rt.flip} onChange={e => setRt(p => ({ ...p, flip: e.target.value }))}
          className="w-full md:w-48 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 text-sm font-mono placeholder-gray-400 focus:outline-none focus:border-blue-500" />
        <p className="text-gray-400 text-[10px] mt-1">End of 1st service to start of 2nd</p>
      </Card>
      <button onClick={save} disabled={saving}
        className={`px-8 py-2.5 rounded-lg font-semibold text-sm transition-all ${saved ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95 disabled:opacity-60'}`}>
        {saving ? 'Saving...' : saved ? 'Saved' : 'Save Runtimes'}
      </button>
    </div>
  )
}
