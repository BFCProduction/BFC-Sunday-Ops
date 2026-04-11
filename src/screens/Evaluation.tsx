import { useState, useEffect } from 'react'
import { CheckCircle2, ChevronDown, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSunday } from '../context/SundayContext'
import { Card } from '../components/ui/Card'
import type { StreamAnalytics } from '../types'

type ServiceFeel = 'excellent' | 'solid' | 'rough_spots' | 'significant_issues'

interface Submission {
  id: string
  sunday_id: string
  submitted_at: string
  service_feel: ServiceFeel | null
  broken_moment: boolean | null
  broken_moment_detail: string | null
  went_well: string | null
  needed_attention: string | null
  area_notes: string | null
}

const FEEL_OPTIONS: {
  value: ServiceFeel
  label: string
  selectedCls: string
  idleCls: string
  pillCls: string
}[] = [
  {
    value: 'excellent',
    label: 'Excellent',
    selectedCls: 'bg-emerald-500 border-emerald-500 text-white',
    idleCls:     'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100',
    pillCls:     'bg-emerald-50 border-emerald-200 text-emerald-700',
  },
  {
    value: 'solid',
    label: 'Solid',
    selectedCls: 'bg-blue-500 border-blue-500 text-white',
    idleCls:     'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100',
    pillCls:     'bg-blue-50 border-blue-200 text-blue-700',
  },
  {
    value: 'rough_spots',
    label: 'Had some rough spots',
    selectedCls: 'bg-amber-500 border-amber-500 text-white',
    idleCls:     'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100',
    pillCls:     'bg-amber-50 border-amber-200 text-amber-700',
  },
  {
    value: 'significant_issues',
    label: 'Significant issues',
    selectedCls: 'bg-red-500 border-red-500 text-white',
    idleCls:     'bg-red-50 border-red-200 text-red-700 hover:bg-red-100',
    pillCls:     'bg-red-50 border-red-200 text-red-700',
  },
]

const feelMeta = Object.fromEntries(FEEL_OPTIONS.map(o => [o.value, o])) as Record<ServiceFeel, typeof FEEL_OPTIONS[number]>

export function Evaluation() {
  const { activeEventId, sundayId } = useSunday()
  const eventId = activeEventId
  // ── Form state ──────────────────────────────────────────────────────────────
  const [feel,             setFeel]             = useState<ServiceFeel | null>(null)
  const [brokenMoment,     setBrokenMoment]     = useState<boolean | null>(null)
  const [brokenDetail,     setBrokenDetail]     = useState('')
  const [wentWell,         setWentWell]         = useState('')
  const [neededAttention,  setNeededAttention]  = useState('')
  const [areaNotes,        setAreaNotes]        = useState('')

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [submitted,      setSubmitted]      = useState(false)
  const [saving,         setSaving]         = useState(false)
  const [showResponses,  setShowResponses]  = useState(false)

  // ── Data ─────────────────────────────────────────────────────────────────────
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [analytics,   setAnalytics]   = useState<StreamAnalytics | null>(null)
  const [loading,     setLoading]     = useState(true)

  const loadData = async () => {
    // Evaluations: always event-native going forward; fallback to sunday_id for history
    const evalQ = supabase.from('evaluations').select('*')
    const evalFiltered = eventId
      ? evalQ.eq('event_id', eventId)
      : sundayId
        ? evalQ.eq('sunday_id', sundayId)
        : evalQ.eq('event_id', '')   // no-op

    // Stream analytics: still sunday-level data
    const analyticsQ = sundayId
      ? supabase.from('stream_analytics').select('*').eq('sunday_id', sundayId).single()
      : Promise.resolve({ data: null, error: null })

    const [subsRes, analyticsRes] = await Promise.all([
      evalFiltered.order('submitted_at', { ascending: false }),
      analyticsQ,
    ])
    if (subsRes.data)      setSubmissions(subsRes.data as Submission[])
    if (analyticsRes.data) setAnalytics(analyticsRes.data as StreamAnalytics)
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadData() }, [activeEventId, sundayId])

  // ── Derived ───────────────────────────────────────────────────────────────────
  const canSubmit =
    feel !== null &&
    wentWell.trim().length > 0 &&
    (brokenMoment !== true || brokenDetail.trim().length > 0)

  const feelCounts = submissions.reduce((acc, s) => {
    if (s.service_feel) acc[s.service_feel] = (acc[s.service_feel] || 0) + 1
    return acc
  }, {} as Partial<Record<ServiceFeel, number>>)

  // ── Actions ───────────────────────────────────────────────────────────────────
  const submit = async () => {
    if (!canSubmit) return
    setSaving(true)
    const { error } = await supabase.from('evaluations').insert({
      event_id: eventId,
      service_feel:         feel,
      broken_moment:        brokenMoment ?? false,
      broken_moment_detail: brokenMoment ? (brokenDetail.trim() || null) : null,
      went_well:            wentWell.trim() || null,
      needed_attention:     neededAttention.trim() || null,
      area_notes:           areaNotes.trim() || null,
    })
    if (error) {
      setSaving(false)
      alert(`Failed to save evaluation: ${error.message}`)
      return
    }
    await loadData()
    setSaving(false)
    setSubmitted(true)
  }

  const resetForm = () => {
    setFeel(null)
    setBrokenMoment(null)
    setBrokenDetail('')
    setWentWell('')
    setNeededAttention('')
    setAreaNotes('')
    setSubmitted(false)
  }

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="fade-in">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 px-5 pt-4 pb-3">
        <h2 className="text-gray-900 font-bold text-lg">Post-Service Evaluation</h2>
        <p className="text-gray-400 text-xs mt-0.5">Anonymous · Multiple submissions welcome</p>
      </div>

      <div className="p-4 md:p-5 space-y-4 max-w-2xl mx-auto">

        {/* ── Confirmation ─────────────────────────────────────────────────────── */}
        {submitted ? (
          <Card className="p-6 flex flex-col items-center text-center fade-in">
            <div className="w-14 h-14 bg-emerald-100 border border-emerald-200 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="w-7 h-7 text-emerald-600" />
            </div>
            <h3 className="text-gray-900 font-bold text-base mb-1">Response Submitted</h3>
            <p className="text-gray-500 text-sm mb-5 max-w-xs leading-relaxed">
              Thanks for the feedback. Anyone else on the team can add their perspective too.
            </p>
            <button onClick={resetForm}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm transition-colors active:scale-95">
              Submit another response
            </button>
          </Card>
        ) : (

        /* ── Submission form ──────────────────────────────────────────────────── */
          <Card className="p-5 space-y-7">

            {/* Q1 — Service feel */}
            <div>
              <p className="text-gray-900 font-semibold text-sm mb-3">
                How did the service feel overall?{' '}
                <span className="text-red-400">*</span>
              </p>
              <div className="grid grid-cols-2 gap-2">
                {FEEL_OPTIONS.map(opt => (
                  <button key={opt.value} onClick={() => setFeel(opt.value)}
                    className={`px-3 py-3 rounded-xl border font-semibold text-sm transition-all text-left leading-snug
                      ${feel === opt.value ? opt.selectedCls : opt.idleCls}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Q2 — Broken moment */}
            <div>
              <p className="text-gray-900 font-semibold text-sm mb-3">
                Was there a moment that broke the experience for the congregation?{' '}
                <span className="text-red-400">*</span>
              </p>
              <div className="flex gap-2">
                {([{ val: false, label: 'No' }, { val: true, label: 'Yes' }] as const).map(opt => (
                  <button key={String(opt.val)} onClick={() => setBrokenMoment(opt.val)}
                    className={`flex-1 py-2.5 rounded-xl border font-semibold text-sm transition-all
                      ${brokenMoment === opt.val
                        ? opt.val
                          ? 'bg-red-500 border-red-500 text-white'
                          : 'bg-emerald-500 border-emerald-500 text-white'
                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                      }`}>
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className={`grid transition-all duration-200 ease-in-out ${brokenMoment === true ? 'grid-rows-[1fr] mt-3' : 'grid-rows-[0fr]'}`}>
                <div className="overflow-hidden">
                  <textarea rows={3} placeholder="What happened and when?"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-red-300 resize-none"
                    value={brokenDetail} onChange={e => setBrokenDetail(e.target.value)} />
                </div>
              </div>
            </div>

            {/* Q3 — Went well (required) */}
            <div>
              <label className="text-gray-900 font-semibold text-sm mb-1.5 block">
                What's one thing that worked really well today?{' '}
                <span className="text-red-400">*</span>
              </label>
              <textarea rows={3}
                placeholder="e.g. Worship transitions were seamless, stream was rock solid…"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-emerald-400 resize-none"
                value={wentWell} onChange={e => setWentWell(e.target.value)} />
            </div>

            {/* Q4 — Needed attention (optional) */}
            <div>
              <label className="text-gray-900 font-semibold text-sm mb-1.5 block">
                What's one thing that needed attention?{' '}
                <span className="text-gray-400 font-normal text-xs">optional</span>
              </label>
              <textarea rows={3}
                placeholder="e.g. Front fill mix felt low during the message…"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-blue-300 resize-none"
                value={neededAttention} onChange={e => setNeededAttention(e.target.value)} />
            </div>

            {/* Q5 — Area notes (optional) */}
            <div>
              <label className="text-gray-900 font-semibold text-sm mb-0.5 block">
                Anything specific to your area?{' '}
                <span className="text-gray-400 font-normal text-xs">optional</span>
              </label>
              <p className="text-gray-400 text-xs mb-1.5">
                Audio, video, lighting, stage, stream — leave discipline-specific notes here if relevant.
              </p>
              <textarea rows={3} placeholder=""
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-blue-300 resize-none"
                value={areaNotes} onChange={e => setAreaNotes(e.target.value)} />
            </div>

            <button onClick={submit} disabled={saving || !canSubmit}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
              {saving ? 'Submitting…' : 'Submit Evaluation'}
            </button>
          </Card>
        )}

        {/* ── Stream Analytics (unchanged) ──────────────────────────────────── */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-gray-900 font-semibold text-sm">Stream Analytics</h3>
            {!analytics && (
              <span className="text-[10px] bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full">~2:30 PM</span>
            )}
          </div>
          <div className="space-y-2">
            {[
              { label: 'YouTube',       value: analytics?.youtube_peak,       sub: 'Peak viewers'  },
              { label: 'RESI',          value: analytics?.resi_peak,          sub: 'Peak viewers'  },
              { label: 'Church Online', value: analytics?.church_online_peak, sub: 'Total viewers' },
            ].map(p => (
              <div key={p.label} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2.5">
                <div className="flex-1">
                  <p className="text-gray-700 text-xs font-medium">{p.label}</p>
                  <p className="text-gray-400 text-[10px]">{p.sub}</p>
                </div>
                <span className="text-gray-900 text-sm font-bold">
                  {p.value != null ? p.value.toLocaleString() : '—'}
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* ── Aggregate responses ───────────────────────────────────────────── */}
        {submissions.length > 0 && (
          <div>
            <button onClick={() => setShowResponses(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 transition-colors">
              <div className="flex items-center gap-2 flex-wrap">
                <Users className="w-4 h-4 text-gray-500 flex-shrink-0" />
                <span className="text-gray-700 font-semibold text-sm">
                  {submissions.length} response{submissions.length !== 1 ? 's' : ''}
                </span>
                <div className="flex gap-1 flex-wrap">
                  {FEEL_OPTIONS.filter(o => feelCounts[o.value]).map(o => (
                    <span key={o.value}
                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${o.pillCls}`}>
                      {feelCounts[o.value]} {o.label}
                    </span>
                  ))}
                </div>
              </div>
              <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ml-2 ${showResponses ? 'rotate-180' : ''}`} />
            </button>

            <div className={`grid transition-all duration-200 ease-in-out ${showResponses ? 'grid-rows-[1fr] mt-3' : 'grid-rows-[0fr]'}`}>
              <div className="overflow-hidden">
                <div className="space-y-3 pb-1">
                  {submissions.map(s => (
                    <Card key={s.id} className="p-4 space-y-3">
                      {/* Card header row */}
                      <div className="flex items-center justify-between gap-2">
                        {s.service_feel && (
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${feelMeta[s.service_feel].pillCls}`}>
                            {feelMeta[s.service_feel].label}
                          </span>
                        )}
                        <span className="text-gray-400 text-[10px] ml-auto">
                          {new Date(s.submitted_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </span>
                      </div>

                      {/* Broken moment callout */}
                      {s.broken_moment && (
                        <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                          <p className="text-red-500 text-[10px] font-semibold uppercase tracking-wide mb-0.5">Broke the experience</p>
                          <p className="text-red-700 text-xs leading-snug">{s.broken_moment_detail || 'No detail provided'}</p>
                        </div>
                      )}

                      {/* Text fields */}
                      {[
                        { label: 'Worked well',      value: s.went_well,         accent: 'text-emerald-600' },
                        { label: 'Needed attention',  value: s.needed_attention,  accent: 'text-amber-600'   },
                        { label: 'Area notes',        value: s.area_notes,        accent: 'text-blue-600'    },
                      ].filter(f => f.value).map(f => (
                        <div key={f.label}>
                          <p className={`text-[10px] font-semibold uppercase tracking-wide mb-0.5 ${f.accent}`}>{f.label}</p>
                          <p className="text-gray-700 text-xs leading-snug">{f.value}</p>
                        </div>
                      ))}
                    </Card>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
