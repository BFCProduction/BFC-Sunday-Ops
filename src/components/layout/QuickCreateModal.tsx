import { useEffect, useRef, useState } from 'react'
import {
  CalendarDays, ChevronDown, Link2, Loader2, Search, X,
} from 'lucide-react'
import { createEvent, loadAllSessions, supabase } from '../../lib/supabase'
import { fetchPcoPlans, type PcoPlanResult, type PcoServiceTypePlans } from '../../lib/adminApi'
import type { Session } from '../../types'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TemplateOption {
  id:   string
  name: string
}

interface ServiceTypeOption {
  slug:  string
  name:  string
  color: string
  defaultTime: string
}

const SERVICE_TYPES: ServiceTypeOption[] = [
  { slug: 'sunday-9am',  name: 'Sunday 9am',           color: '#3b82f6', defaultTime: '09:00' },
  { slug: 'sunday-11am', name: 'Sunday 11am',           color: '#8b5cf6', defaultTime: '11:00' },
  { slug: 'special',     name: 'Special / Other Event', color: '#f59e0b', defaultTime: ''      },
]

interface Props {
  sessionToken: string | null
  onCreated: (newEventId: string, freshSessions: Session[]) => void
  onClose: () => void
}

// ── PCO Plan Picker (inner modal) ─────────────────────────────────────────────

function PcoPlanPicker({
  sessionToken,
  initialSlug,
  onSelect,
  onClose,
}: {
  sessionToken: string
  initialSlug: string
  onSelect: (plan: PcoPlanResult, serviceTypeSlug: string) => void
  onClose: () => void
}) {
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')
  const [groups,      setGroups]      = useState<PcoServiceTypePlans[]>([])
  const [activeSlug,  setActiveSlug]  = useState(initialSlug)
  const [query,       setQuery]       = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchPcoPlans(sessionToken)
      .then(data => {
        setGroups(data)
        // If the initialSlug isn't in the returned groups, default to first
        if (data.length > 0 && !data.find(g => g.slug === initialSlug)) {
          setActiveSlug(data[0].slug)
        }
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load PCO plans'))
      .finally(() => {
        setLoading(false)
        searchRef.current?.focus()
      })
  }, [sessionToken])

  const activeGroup = groups.find(g => g.slug === activeSlug)
  const q = query.toLowerCase()
  const visiblePlans = (activeGroup?.plans ?? []).filter(p =>
    !q ||
    p.display_date.toLowerCase().includes(q) ||
    (p.title?.toLowerCase().includes(q) ?? false) ||
    (p.series_title?.toLowerCase().includes(q) ?? false)
  )

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-blue-500" />
            <h3 className="text-sm font-semibold text-gray-900">Link to PCO Plan</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Service type tabs */}
        {!loading && groups.length > 0 && (
          <div className="flex border-b border-gray-100 flex-shrink-0">
            {groups.map(g => (
              <button
                key={g.slug}
                onClick={() => { setActiveSlug(g.slug); setQuery('') }}
                className={`flex-1 py-2.5 text-xs font-semibold transition-colors border-b-2 -mb-px ${
                  activeSlug === g.slug
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {g.slug === 'sunday-9am'  ? '9am'     :
                 g.slug === 'sunday-11am' ? '11am'    :
                 'Special'}
              </button>
            ))}
          </div>
        )}

        {/* Search */}
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

        {/* Plan list */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-12 gap-2 text-gray-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading plans…
            </div>
          )}
          {!loading && error && (
            <p className="px-5 py-4 text-sm text-red-600">{error}</p>
          )}
          {!loading && !error && visiblePlans.length === 0 && (
            <p className="px-5 py-6 text-sm text-gray-400 text-center">No plans found</p>
          )}
          {!loading && !error && visiblePlans.map(plan => {
            const label = plan.title || plan.series_title
            const isSpecialTab = activeSlug === 'special'
            return (
              <button
                key={plan.id}
                onClick={() => onSelect(plan, activeSlug)}
                className="w-full text-left px-4 py-3 hover:bg-blue-50 border-b border-gray-50 transition-colors"
              >
                {isSpecialTab && label ? (
                  <>
                    <p className="text-sm font-medium text-gray-900">{label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{plan.display_date}</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-gray-900">{plan.display_date}</p>
                    {label && <p className="text-xs text-gray-500 mt-0.5">{label}</p>}
                  </>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────

export function QuickCreateModal({ sessionToken, onCreated, onClose }: Props) {
  const [serviceTypeSlug, setServiceTypeSlug] = useState('sunday-9am')
  const [name,            setName]            = useState('')
  const [date,            setDate]            = useState(nextSundayDate())
  const [time,            setTime]            = useState('09:00')
  const [notes,           setNotes]           = useState('')
  const [templateId,      setTemplateId]      = useState('')
  const [pcoPlanId,       setPcoPlanId]       = useState<string | null>(null)
  const [pcoPlanLabel,    setPcoPlanLabel]    = useState('')
  const [templates,       setTemplates]       = useState<TemplateOption[]>([])
  const [showPcoPicker,   setShowPcoPicker]   = useState(false)
  const [saving,          setSaving]          = useState(false)
  const [error,           setError]           = useState('')

  // Load templates on mount
  useEffect(() => {
    supabase.from('event_templates').select('id, name').order('name')
      .then(({ data }) => setTemplates((data || []) as TemplateOption[]))
  }, [])

  // Update time default when service type changes
  function handleServiceTypeChange(slug: string) {
    setServiceTypeSlug(slug)
    const st = SERVICE_TYPES.find(s => s.slug === slug)
    if (st) setTime(st.defaultTime)
    // If name is still the auto-generated default for the old type, regenerate it
    setName('')   // clear so the placeholder updates; user can type their own
    if (slug !== 'special') {
      // Clear PCO plan when switching away from what it was linked to
      // (keeps things clean — user can re-link)
    }
  }

  // Update date + regenerate default time when service type changes
  useEffect(() => {
    if (serviceTypeSlug === 'sunday-9am' || serviceTypeSlug === 'sunday-11am') {
      setDate(nextSundayDate())
    }
  }, [serviceTypeSlug])

  const selectedServiceType = SERVICE_TYPES.find(s => s.slug === serviceTypeSlug)!
  const isSpecial = serviceTypeSlug === 'special'

  const namePlaceholder = isSpecial
    ? 'Living Last Supper, Good Friday…'
    : selectedServiceType.name

  async function handleSave() {
    const trimmedName = name.trim() || (isSpecial ? '' : selectedServiceType.name)
    if (!trimmedName) { setError('Event name is required'); return }
    if (!date)        { setError('Date is required'); return }
    setSaving(true)
    setError('')
    try {
      const newId = await createEvent({
        name:            trimmedName,
        serviceTypeSlug,
        event_date:      date,
        event_time:      time || null,
        notes:           notes.trim() || null,
        templateId:      isSpecial ? (templateId || null) : null,
        pco_plan_id:     pcoPlanId,
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

  function handlePcoPlanSelect(plan: PcoPlanResult, _slug: string) {
    setPcoPlanId(plan.id)
    // Build a descriptive label for the linked-plan badge
    const label = plan.title || plan.series_title
      ? `${plan.display_date}${plan.title ? ' · ' + plan.title : plan.series_title ? ' · ' + plan.series_title : ''}`
      : plan.display_date
    setPcoPlanLabel(label)

    // Auto-fill name if it's empty and we got a title from PCO
    const pcoTitle = plan.title || plan.series_title
    if (!name.trim() && pcoTitle) {
      setName(pcoTitle)
    }
    // Auto-fill date
    setDate(plan.event_date)

    setShowPcoPicker(false)
  }

  function clearPcoPlan() {
    setPcoPlanId(null)
    setPcoPlanLabel('')
  }

  const canSave = !saving && date && (name.trim() || !isSpecial)

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

          {/* Form */}
          <div className="px-5 py-4 space-y-4">

            {/* Service Type */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Service Type <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <select
                  value={serviceTypeSlug}
                  onChange={e => handleServiceTypeChange(e.target.value)}
                  className="w-full appearance-none border border-gray-200 rounded-lg pl-3 pr-8 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                >
                  {SERVICE_TYPES.map(st => (
                    <option key={st.slug} value={st.slug}>{st.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                {isSpecial ? <>Name <span className="text-red-500">*</span></> : <>Name <span className="text-gray-400 font-normal normal-case">(optional — defaults to service type)</span></>}
              </label>
              <input
                autoFocus={isSpecial}
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void handleSave() }}
                placeholder={namePlaceholder}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Date + Time */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Time <span className="text-gray-400 font-normal normal-case">(optional)</span>
                </label>
                <input
                  type="time"
                  value={time}
                  onChange={e => setTime(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* PCO Plan Link */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                PCO Plan <span className="text-gray-400 font-normal normal-case">(optional)</span>
              </label>
              {pcoPlanId ? (
                <div className="flex items-center gap-2 border border-blue-200 bg-blue-50 rounded-lg px-3 py-2.5">
                  <Link2 className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                  <span className="text-sm text-blue-800 font-medium flex-1 truncate">{pcoPlanLabel}</span>
                  <button
                    onClick={clearPcoPlan}
                    className="p-0.5 rounded text-blue-400 hover:text-blue-600 hover:bg-blue-100 transition-colors flex-shrink-0"
                    title="Remove link"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => sessionToken ? setShowPcoPicker(true) : setError('No PCO session — please log out and back in')}
                  className="w-full flex items-center justify-center gap-2 border border-gray-200 border-dashed rounded-lg px-3 py-2.5 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  Link to a PCO Plan
                </button>
              )}
            </div>

            {/* Checklist Template (special events only) */}
            {isSpecial && templates.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Checklist Template <span className="text-gray-400 font-normal normal-case">(optional)</span>
                </label>
                <div className="relative">
                  <select
                    value={templateId}
                    onChange={e => setTemplateId(e.target.value)}
                    className="w-full appearance-none border border-gray-200 rounded-lg pl-3 pr-8 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                  >
                    <option value="">None</option>
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                </div>
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

      {/* PCO Plan Picker (nested modal) */}
      {showPcoPicker && sessionToken && (
        <PcoPlanPicker
          sessionToken={sessionToken}
          initialSlug={serviceTypeSlug}
          onSelect={handlePcoPlanSelect}
          onClose={() => setShowPcoPicker(false)}
        />
      )}
    </>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns the date string (YYYY-MM-DD) of the next or current Sunday. */
function nextSundayDate(): string {
  const d = new Date()
  const day = d.getDay()           // 0 = Sun, 1 = Mon, …
  const daysUntilSunday = day === 0 ? 0 : 7 - day
  d.setDate(d.getDate() + daysUntilSunday)
  return d.toISOString().slice(0, 10)
}
