import { useState, useEffect } from 'react'
import { Server, Clock } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Card } from '../../components/ui/Card'
import { useAdmin } from '../../context/AdminContext'

interface RuntimesProps { sundayId: string }

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

interface PPConfig {
  host: string
  port: number
  clock_service1_runtime: number | null
  clock_service1_message: number | null
  clock_service2_runtime: number | null
  clock_service2_message: number | null
  clock_flip_time: number | null
  pull_day: number
  pull_time: string
}

const DEFAULT_PP: PPConfig = {
  host: '', port: 1025,
  clock_service1_runtime: null, clock_service1_message: null,
  clock_service2_runtime: null, clock_service2_message: null,
  clock_flip_time: null,
  pull_day: 0, pull_time: '12:30',
}

export function Runtimes({ sundayId }: RuntimesProps) {
  const { isAdmin } = useAdmin()
  const [rt, setRt] = useState({ s1Svc: '', s1Msg: '', s2Svc: '', s2Msg: '', flip: '' })
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pp, setPP] = useState<PPConfig>(DEFAULT_PP)
  const [ppSaved, setPPSaved] = useState(false)
  const [ppSaving, setPPSaving] = useState(false)

  useEffect(() => {
    supabase.from('service_runtimes').select('*').eq('sunday_id', sundayId).single()
      .then(({ data }) => {
        if (data) setRt({
          s1Svc: data.service_1_runtime || '', s1Msg: data.service_1_message_runtime || '',
          s2Svc: data.service_2_runtime || '', s2Msg: data.service_2_message_runtime || '',
          flip: data.flip_time || '',
        })
      })
    supabase.from('propresenter_config').select('*').eq('id', 1).single()
      .then(({ data }) => { if (data) setPP(data) })
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

  const savePP = async () => {
    setPPSaving(true)
    await supabase.from('propresenter_config').upsert({
      id: 1,
      ...pp,
      updated_at: new Date().toISOString(),
    })
    setPPSaving(false)
    setPPSaved(true)
    setTimeout(() => setPPSaved(false), 2500)
  }

  const Field = ({ label, k, hint }: { label: string; k: keyof typeof rt; hint?: string }) => (
    <div>
      <label className="block text-gray-500 text-xs font-medium mb-1.5">{label}</label>
      <input type="text" placeholder="H:MM:SS" value={rt[k]}
        onChange={e => setRt(p => ({ ...p, [k]: e.target.value }))}
        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 text-sm font-mono placeholder-gray-400 focus:outline-none focus:border-blue-500" />
      {hint && <p className="text-gray-400 text-[10px] mt-1">{hint}</p>}
    </div>
  )

  const ClockField = ({ label, field }: { label: string; field: keyof PPConfig }) => (
    <div>
      <label className="block text-gray-500 text-xs font-medium mb-1.5">{label}</label>
      <input
        type="number" min="1" placeholder="—"
        value={pp[field] ?? ''}
        onChange={e => setPP(p => ({ ...p, [field]: e.target.value ? parseInt(e.target.value) : null }))}
        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 text-sm text-center font-mono placeholder-gray-400 focus:outline-none focus:border-blue-500"
      />
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
        <input type="text" placeholder="MM:SS" value={rt.flip}
          onChange={e => setRt(p => ({ ...p, flip: e.target.value }))}
          className="w-full md:w-48 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 text-sm font-mono placeholder-gray-400 focus:outline-none focus:border-blue-500" />
        <p className="text-gray-400 text-[10px] mt-1">End of 1st service to start of 2nd</p>
      </Card>
      <button onClick={save} disabled={saving}
        className={`px-8 py-2.5 rounded-lg font-semibold text-sm transition-all ${saved ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95 disabled:opacity-60'}`}>
        {saving ? 'Saving...' : saved ? 'Saved' : 'Save Runtimes'}
      </button>

      {/* ProPresenter Integration — admin only */}
      {isAdmin && (
        <Card className="p-4 space-y-4 border-amber-200">
          <div className="flex items-center gap-2 pb-1 border-b border-gray-100">
            <Server className="w-4 h-4 text-amber-600" />
            <p className="text-gray-900 text-sm font-semibold">ProPresenter Integration</p>
            <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ml-1">Admin</span>
          </div>

          {/* Connection */}
          <div>
            <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2">Connection</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-gray-500 text-xs font-medium mb-1.5">ProPresenter IP Address</label>
                <input type="text" placeholder="192.168.1.100" value={pp.host}
                  onChange={e => setPP(p => ({ ...p, host: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 text-sm font-mono placeholder-gray-400 focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-gray-500 text-xs font-medium mb-1.5">Port</label>
                <input type="number" placeholder="1025" value={pp.port}
                  onChange={e => setPP(p => ({ ...p, port: parseInt(e.target.value) || 1025 }))}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 text-sm font-mono placeholder-gray-400 focus:outline-none focus:border-blue-500" />
              </div>
            </div>
            <p className="text-gray-400 text-[10px] mt-1.5">
              Find in ProPresenter: Preferences → Network → Enable Network → note the port shown
            </p>
          </div>

          {/* Clock assignments */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Clock className="w-3.5 h-3.5 text-gray-400" />
              <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide">Clock Assignments</p>
            </div>
            <p className="text-gray-400 text-[10px] mb-3">
              Enter the clock number (1, 2, 3…) as listed in ProPresenter's Clock module for each field.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <ClockField label="9am Service Runtime" field="clock_service1_runtime" />
              <ClockField label="9am Message Runtime" field="clock_service1_message" />
              <ClockField label="11am Service Runtime" field="clock_service2_runtime" />
              <ClockField label="11am Message Runtime" field="clock_service2_message" />
              <ClockField label="Flip Time" field="clock_flip_time" />
            </div>
          </div>

          {/* Pull schedule */}
          <div>
            <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2">Pull Schedule</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-gray-500 text-xs font-medium mb-1.5">Day of Week</label>
                <select value={pp.pull_day}
                  onChange={e => setPP(p => ({ ...p, pull_day: parseInt(e.target.value) }))}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 text-sm focus:outline-none focus:border-blue-500">
                  {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-gray-500 text-xs font-medium mb-1.5">Pull Time</label>
                <input type="time" value={pp.pull_time}
                  onChange={e => setPP(p => ({ ...p, pull_time: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 text-sm focus:outline-none focus:border-blue-500" />
              </div>
            </div>
            <p className="text-gray-400 text-[10px] mt-1.5">
              The relay script will capture clock values at this time — set it after both services are complete.
            </p>
          </div>

          {/* Relay script instructions */}
          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
            <p className="text-gray-700 text-xs font-semibold mb-1.5">Running the relay script</p>
            <p className="text-gray-500 text-[11px] leading-relaxed mb-2">
              Run this once on any Mac on the same network as ProPresenter. It will wait until the pull time, read the clock values, and write them here automatically.
            </p>
            <code className="block bg-gray-900 text-green-400 text-[11px] rounded px-3 py-2 font-mono">
              node scripts/propresenter-relay.js
            </code>
            <p className="text-gray-400 text-[10px] mt-1.5">Add <span className="font-mono">--now</span> to pull immediately (for testing)</p>
          </div>

          <button onClick={savePP} disabled={ppSaving}
            className={`px-6 py-2.5 rounded-lg font-semibold text-sm transition-all ${ppSaved ? 'bg-emerald-600 text-white' : 'bg-gray-900 text-white hover:bg-gray-700 active:scale-95 disabled:opacity-60'}`}>
            {ppSaving ? 'Saving...' : ppSaved ? 'Settings Saved' : 'Save ProPresenter Settings'}
          </button>
        </Card>
      )}
    </div>
  )
}
