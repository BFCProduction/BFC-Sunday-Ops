import { useEffect, useRef, useState } from 'react'
import {
  CalendarDays, Link2, Loader2, Search, X, BarChart2, ChevronRight, ChevronLeft,
} from 'lucide-react'
import { createEvent, loadAllSessions, supabase } from '../../lib/supabase'
import { ApiError, fetchPcoPlans, type PcoPlanResult, type PcoServiceTypePlans } from '../../lib/adminApi'
import { initiatePCOLogin } from '../../lib/pcoAuth'
import type { Session } from '../../types'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TemplateOption {
  id:   string
  name: string
}

interface Props {
  sessionToken: string | null
  onCreated: (newEventId: string, freshSessions: Session[]) => void
  onClose: () => void
}

// ── PCO Plan Picker (inner modal) ─────────────────────────────────────────────

function PcoPlanPicker({
  sessionToken,
  onSelect,
  onClose,
}: {
  sessionToken: string
  onSelect: (plan: PcoPlanResult, group: PcoServiceTypePlans) => void
  onClose: () => void
}) {
  const [loading,        setLoading]        = useState(true)
  const [error,          setError]          = useState('')
  const [reauthRequired, setReauthRequired] = useState(false)
  const [groups,         setGroups]         = useState<PcoServiceTypePlans[]>([])
  const [activeGroup,    setActiveGroup]    = useState<PcoServiceTypePlans | null>(null)
  const [query,          setQuery]          = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchPcoPlans(sessionToken)
      .then(data => setGroups(data))
      .catch(e => {
        if (e instanceof ApiError && e.code === 'reauth_required') setReauthRequired(true)
        setError(e instanceof Error ? e.message : 'Failed to load PCO plans')
      })
      .finally(() => setLoading(false))
  }, [sessionToken])

  useEffect(() => {
    if (activeGroup) searchRef.current?.focus()
  }, [activeGroup])

  const q = query.toLowerCase()
  const visiblePlans = (activeGroup?.plans ?? []).filter(p =>
    !q ||
    p.display_date.toLowerCase().includes(q) ||
    (p.display_time?.toLowerCase().includes(q) ?? false) ||
    (p.title?.toLowerCase().includes(q) ?? false) ||
    (p.series_title?.toLowerCase().includes(q) ?? false),
  ).sort((a, b) =>
    a.event_date.localeCompare(b.event_date) ||
    (a.event_time ?? '').localeCompare(b.event_time ?? ''),
  )

  const title = activeGroup ? activeGroup.name : 'Select a PCO Plan'

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[80vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            {activeGroup ? (
              <button
                onClick={() => { setActiveGroup(null); setQuery('') }}
                className="p-1 -ml-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            ) : (
              <Link2 className="w-4 h-4 text-blue-500" />
            )}
            <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Loading / error */}
        {loading && (
          <div className="flex items-center justify-center py-12 gap-2 text-gray-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        )}
        {!loading && error && (
          <div className="px-5 py-5 text-center">
            <p className="text-sm font-medium text-red-600">{error}</p>
            {reauthRequired && (
              <button type="button" onClick={initiatePCOLogin}
                className="mt-3 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700">
                Sign in again with Planning Center
              </button>
            )}
          </div>
        )}

        {/* Service type list */}
        {!loading && !error && !activeGroup && (
          <div className="flex-1 overflow-y-auto">
            {groups.length === 0 && (
              <p className="px-5 py-6 text-sm text-gray-400 text-center">No service types found</p>
            )}
            {groups.map(g => (
              <button
                key={g.slug}
                onClick={() => setActiveGroup(g)}
                className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-blue-50 border-b border-gray-50 transition-colors text-left"
              >
                <span className="text-sm font-medium text-gray-900">{g.name}</span>
                <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
              </button>
            ))}
          </div>
        )}

        {/* Plan list (after service type selected) */}
        {!loading && !error && activeGroup && (
          <>
            <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search by date or title…"
                  className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {visiblePlans.length === 0 && (
                <p className="px-5 py-6 text-sm text-gray-400 text-center">No plans found</p>
              )}
              {visiblePlans.map(plan => {
                const label = plan.title || plan.series_title
                return (
                  <button
                    key={plan.id}
                    onClick={() => onSelect(plan, activeGroup)}
                    className="w-full text-left px-4 py-3 hover:bg-blue-50 border-b border-gray-50 transition-colors"
                  >
                    {label ? (
                      <>
                        <p className="text-sm font-medium text-gray-900">{label}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {[plan.display_date, plan.display_time].filter(Boolean).join(' · ')}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm font-medium text-gray-900">
                        {[plan.display_date, plan.display_time].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────

export function QuickCreateModal({ sessionToken, onCreated, onClose }: Props) {
  // PCO plan selection (required)
  const [pcoPlanId,            setPcoPlanId]            = useState<string | null>(null)
  const [pcoPlanLabel,         setPcoPlanLabel]         = useState('')
  const [pcoServiceTypeSlug,   setPcoServiceTypeSlug]   = useState<string | null>(null)
  const [pcoServiceTypeName,   setPcoServiceTypeName]   = useState<string | null>(null)

  // Form fields (pre-filled from PCO, editable)
  const [name,        setName]        = useState('')
  const [date,        setDate]        = useState('')
  const [time,        setTime]        = useState('')
  const [notes,       setNotes]       = useState('')
  const [templateId,  setTemplateId]  = useState('')
  const [includeInAnalytics, setIncludeInAnalytics] = useState(false)

  const [templates,       setTemplates]       = useState<TemplateOption[]>([])
  const [showPcoPicker,   setShowPcoPicker]   = useState(false)
  const [saving,          setSaving]          = useState(false)
  const [error,           setError]           = useState('')

  useEffect(() => {
    supabase.from('event_templates').select('id, name').order('name')
      .then(({ data }) => setTemplates((data || []) as TemplateOption[]))
  }, [])

  const isSundayService = pcoServiceTypeSlug === 'sunday-9am' || pcoServiceTypeSlug === 'sunday-11am'
  const showTemplates = !isSundayService && templates.length > 0

  function handlePcoPlanSelect(plan: PcoPlanResult, group: PcoServiceTypePlans) {
    setPcoPlanId(plan.id)
    setPcoServiceTypeSlug(group.slug)
    setPcoServiceTypeName(group.name)
    setDate(plan.event_date)
    setTime(plan.event_time?.slice(0, 5) ?? '')

    // Pre-fill name from PCO title; user can override
    const pcoTitle = plan.title || plan.series_title || ''
    setName(pcoTitle)

    // Sunday services default to analytics-on; everything else defaults off
    const isS = group.slug === 'sunday-9am' || group.slug === 'sunday-11am'
    setIncludeInAnalytics(isS)

    // Build the badge label
    const timePart = [plan.display_date, plan.display_time].filter(Boolean).join(' · ')
    setPcoPlanLabel(pcoTitle ? `${timePart} · ${pcoTitle}` : timePart)

    setShowPcoPicker(false)
  }

  function clearPcoPlan() {
    setPcoPlanId(null)
    setPcoPlanLabel('')
    setPcoServiceTypeSlug(null)
    setPcoServiceTypeName(null)
    setName('')
    setDate('')
    setTime('')
    setIncludeInAnalytics(false)
  }

  async function handleSave() {
    if (!pcoPlanId || !pcoServiceTypeSlug) { setError('Select a PCO plan to continue'); return }
    const trimmedName = name.trim()
    if (!trimmedName) { setError('Event name is required'); return }
    if (!date) { setError('Date is required'); return }
    setSaving(true)
    setError('')
    try {
      const newId = await createEvent({
        name:               trimmedName,
        serviceTypeSlug:    pcoServiceTypeSlug,
        event_date:         date,
        event_time:         time || null,
        notes:              notes.trim() || null,
        templateId:         showTemplates ? (templateId || null) : null,
        pco_plan_id:        pcoPlanId,
        includeInAnalytics,
      })
      const fresh = await loadAllSessions()
      onCreated(newId, fresh)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create event')
    } finally {
      setSaving(false)
    }
  }

  const canSave = !saving && !!pcoPlanId && !!name.trim() && !!date

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
        onClick={e => { if (e.target === e.currentTarget) onClose() }}
      >
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-blue-500" />
              <h2 className="text-sm font-semibold text-gray-900">New Event</h2>
            </div>
            <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-5 py-4 space-y-4">

            {/* PCO Plan — required, shown first */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                PCO Plan <span className="text-red-500">*</span>
              </label>
              {pcoPlanId ? (
                <div className="flex items-center gap-2 border border-blue-200 bg-blue-50 rounded-lg px-3 py-2.5">
                  <Link2 className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-blue-800 font-medium truncate">{pcoPlanLabel}</p>
                    {pcoServiceTypeName && (
                      <p className="text-[10px] text-blue-500 mt-0.5">{pcoServiceTypeName}</p>
                    )}
                  </div>
                  <button
                    onClick={clearPcoPlan}
                    className="p-0.5 rounded text-blue-400 hover:text-blue-600 hover:bg-blue-100 transition-colors flex-shrink-0"
                    title="Change plan"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => sessionToken ? setShowPcoPicker(true) : setError('No PCO session — please log out and back in')}
                  className="w-full flex items-center justify-center gap-2 border border-blue-300 border-dashed rounded-lg px-3 py-3 text-sm text-blue-600 hover:border-blue-500 hover:bg-blue-50 transition-colors font-medium"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  Choose a PCO Plan
                </button>
              )}
            </div>

            {/* Fields that appear after plan is selected */}
            {pcoPlanId && (
              <>
                {/* Name */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    autoFocus
                    value={name}
                    onChange={e => setName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') void handleSave() }}
                    placeholder="Event name…"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Date + Time (from PCO, shown read-only) */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Date</label>
                    <input
                      type="date"
                      value={date}
                      readOnly
                      className="w-full border border-gray-100 bg-gray-50 rounded-lg px-3 py-2.5 text-sm text-gray-500 cursor-default"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Time</label>
                    <input
                      type="time"
                      value={time}
                      readOnly
                      className="w-full border border-gray-100 bg-gray-50 rounded-lg px-3 py-2.5 text-sm text-gray-500 cursor-default"
                    />
                  </div>
                </div>

                {/* Analytics toggle */}
                <div>
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <div
                      onClick={() => setIncludeInAnalytics(v => !v)}
                      className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${
                        includeInAnalytics ? 'bg-blue-600' : 'bg-gray-200'
                      }`}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                        includeInAnalytics ? 'translate-x-4' : 'translate-x-0.5'
                      }`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <BarChart2 className="w-3.5 h-3.5 text-gray-400" />
                        <span className="text-sm font-medium text-gray-700">Record analytics</span>
                      </div>
                      <p className="text-[11px] text-gray-400 mt-0.5">Show this event in the Data Explorer</p>
                    </div>
                  </label>
                </div>

                {/* Checklist Template (non-Sunday only) */}
                {showTemplates && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Checklist Template <span className="text-gray-400 font-normal normal-case">(optional)</span>
                    </label>
                    <select
                      value={templateId}
                      onChange={e => setTemplateId(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                    >
                      <option value="">None</option>
                      {templates.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Notes */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Notes <span className="text-gray-400 font-normal normal-case">(optional)</span>
                  </label>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Any context for this event…"
                    rows={2}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  />
                </div>
              </>
            )}

            {error && <p className="text-red-600 text-xs">{error}</p>}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-100">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating…</> : 'Create Event'}
            </button>
          </div>
        </div>
      </div>

      {showPcoPicker && sessionToken && (
        <PcoPlanPicker
          sessionToken={sessionToken}
          onSelect={handlePcoPlanSelect}
          onClose={() => setShowPcoPicker(false)}
        />
      )}
    </>
  )
}
