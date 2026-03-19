import { useState, useEffect } from 'react'
import { CheckCircle2, Star } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Card } from '../components/ui/Card'
import type { Evaluation as EvaluationType, StreamAnalytics } from '../types'

interface EvaluationProps { sundayId: string }

const SECTIONS = ['Audio', 'Video', 'Lighting', 'Stage', 'Stream', 'Overall'] as const
type Section = typeof SECTIONS[number]
type RatingKey = `${Lowercase<Section>}_rating`

function toKey(s: Section): RatingKey {
  return `${s.toLowerCase()}_rating` as RatingKey
}

export function Evaluation({ sundayId }: EvaluationProps) {
  const [ratings, setRatings] = useState<Partial<Record<RatingKey, number>>>({})
  const [wentWell, setWW] = useState('')
  const [didntGo, setDG] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [analytics, setAnalytics] = useState<StreamAnalytics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('evaluations').select('*').eq('sunday_id', sundayId).single(),
      supabase.from('stream_analytics').select('*').eq('sunday_id', sundayId).single(),
    ]).then(([evalRes, analyticsRes]) => {
      if (evalRes.data) {
        const d = evalRes.data as EvaluationType
        const r: Partial<Record<RatingKey, number>> = {}
        SECTIONS.forEach(s => {
          const v = d[toKey(s)]
          if (v) r[toKey(s)] = v
        })
        setRatings(r)
        setWW(d.went_well || '')
        setDG(d.didnt_go || '')
        if (d.submitted_at) setSubmitted(true)
      }
      if (analyticsRes.data) setAnalytics(analyticsRes.data as StreamAnalytics)
      setLoading(false)
    })
  }, [sundayId])

  const submit = async () => {
    setSaving(true)
    await supabase.from('evaluations').upsert({
      sunday_id: sundayId,
      ...Object.fromEntries(SECTIONS.map(s => [toKey(s), ratings[toKey(s)] || null])),
      went_well: wentWell || null,
      didnt_go: didntGo || null,
      submitted_at: new Date().toISOString(),
    })
    setSaving(false)
    setSubmitted(true)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (submitted) return (
    <div className="fade-in flex flex-col items-center justify-center min-h-[60vh] px-8 text-center">
      <div className="w-14 h-14 bg-emerald-100 border border-emerald-200 rounded-full flex items-center justify-center mb-4">
        <CheckCircle2 className="w-7 h-7 text-emerald-600" />
      </div>
      <h2 className="text-gray-900 text-xl font-bold mb-2">Evaluation Submitted</h2>
      <p className="text-gray-500 text-sm leading-relaxed mb-6 max-w-xs">
        Saved successfully. Analytics and any follow-up reporting depend on whichever imports are configured for this environment.
      </p>
      <Card className="p-4 text-left max-w-xs w-full">
        <p className="text-gray-400 text-[10px] uppercase font-semibold mb-2.5">Summary Email</p>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-center">
            <Star className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <p className="text-gray-900 text-xs font-medium">Sunday Ops Report</p>
            <p className="text-gray-400 text-[10px]">Reporting pipeline configured separately</p>
          </div>
        </div>
      </Card>
      <button onClick={() => setSubmitted(false)} className="mt-4 text-blue-600 text-sm font-medium hover:text-blue-700">
        Edit Evaluation
      </button>
    </div>
  )

  return (
    <div className="fade-in">
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 px-5 pt-4 pb-3">
        <h2 className="text-gray-900 font-bold text-lg">Post-Service Evaluation</h2>
        <p className="text-gray-400 text-xs mt-0.5">
          Due by 1:00 PM · {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
        </p>
      </div>

      <div className="p-5 space-y-4">
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr_280px] gap-4 items-start">
          {/* Ratings */}
          <Card className="p-5">
            <h3 className="text-gray-900 font-semibold text-sm mb-4">Section Ratings</h3>
            <div className="space-y-3">
              {SECTIONS.map(s => (
                <div key={s} className="flex items-center justify-between">
                  <span className="text-gray-700 text-sm w-20">{s}</span>
                  <div className="flex gap-1.5">
                    {[1, 2, 3, 4, 5].map(n => {
                      const isSet = (ratings[toKey(s)] || 0) >= n
                      return (
                        <button key={n} onClick={() => setRatings(p => ({ ...p, [toKey(s)]: n }))}
                          className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${isSet ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}>
                          {n}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Text fields */}
          <div className="space-y-4">
            <Card className="p-5 space-y-2">
              <label className="text-gray-900 font-semibold text-sm flex items-center gap-2">
                <span className="text-emerald-600 font-bold">+</span> What went well?
              </label>
              <textarea rows={5} placeholder="Worship transitions were smooth, camera ops were dialed in…"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-emerald-400 resize-none"
                value={wentWell} onChange={e => setWW(e.target.value)} />
            </Card>
            <Card className="p-5 space-y-2">
              <label className="text-gray-900 font-semibold text-sm flex items-center gap-2">
                <span className="text-red-500 font-bold">-</span> What didn't go well?
              </label>
              <textarea rows={5} placeholder="Front fill issue delayed walk-in by 3 min…"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-red-400 resize-none"
                value={didntGo} onChange={e => setDG(e.target.value)} />
            </Card>
          </div>

          {/* Stream Analytics */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-900 font-semibold text-sm">Stream Analytics</h3>
              {!analytics && (
                <span className="text-[10px] bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full">~2:30 PM</span>
              )}
            </div>
            <div className="space-y-2">
              {[
                { label: 'YouTube',      value: analytics?.youtube_peak,       sub: 'Peak viewers'  },
                { label: 'RESI',         value: analytics?.resi_peak,          sub: 'Peak viewers'  },
                { label: 'Church Online',value: analytics?.church_online_peak, sub: 'Total viewers' },
              ].map(p => (
                <div key={p.label} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2.5">
                  <div className="flex-1">
                    <p className="text-gray-700 text-xs font-medium">{p.label}</p>
                    <p className="text-gray-400 text-[10px]">{p.sub}</p>
                  </div>
                  <span className="text-gray-900 text-sm font-bold">
                    {p.value ? p.value.toLocaleString() : '—'}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <button onClick={submit} disabled={saving}
          className="px-10 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-sm active:scale-95 transition-all disabled:opacity-60">
          {saving ? 'Submitting...' : 'Submit Evaluation'}
        </button>
      </div>
    </div>
  )
}
