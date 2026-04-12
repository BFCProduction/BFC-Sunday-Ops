import { useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../../lib/supabase'

export interface RuntimeField {
  id: number
  label: string
  host: string | null
  port: number
  clock_number: number
  pull_time: string
  pull_day: number
  sort_order: number
  countdown_target: string | null
  /** null = applies to all service types */
  service_type_slug: string | null
  /** null = not synced to service_records analytics */
  analytics_key: 'service_run_time' | 'message_run_time' | 'stage_flip_time' | null
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

interface Props {
  field?: RuntimeField
  /** Pre-fills service type for new fields; null = all services */
  defaultServiceTypeSlug?: string | null
  /** Pre-fills display order for new fields */
  defaultSortOrder?: number
  onClose: () => void
  onSaved: () => void
}

const SERVICE_OPTIONS = [
  { value: '',            label: 'All Services'     },
  { value: 'sunday-9am',  label: 'Sunday 9:00 AM'   },
  { value: 'sunday-11am', label: 'Sunday 11:00 AM'  },
  { value: 'special',     label: 'Special Events'   },
]

export function RuntimeFieldModal({ field, defaultServiceTypeSlug, defaultSortOrder, onClose, onSaved }: Props) {
  const [label,         setLabel]         = useState(field?.label || '')
  const [host,          setHost]          = useState(field?.host || '')
  const [port,          setPort]          = useState(field?.port ?? 1025)
  const [clockNumber,   setClockNumber]   = useState(field?.clock_number ?? 0)
  const [pullTime,      setPullTime]      = useState(field?.pull_time || '10:20')
  const [pullDay,       setPullDay]       = useState(field?.pull_day ?? 0)
  const sortOrder = field?.sort_order ?? defaultSortOrder ?? 0
  const [countdownTarget, setCountdownTarget] = useState(field?.countdown_target || '')
  const [analyticsKey, setAnalyticsKey] = useState<string>(field?.analytics_key ?? '')
  // service_type_slug: '' → null (all services), else a specific slug
  const [serviceSlug, setServiceSlug] = useState<string>(
    field !== undefined ? (field.service_type_slug ?? '') : (defaultServiceTypeSlug ?? '')
  )
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const handleSave = async () => {
    if (!label.trim()) { setError('Label is required'); return }
    if (clockNumber < 0) { setError('Clock number must be 0 or greater'); return }
    setSaving(true)
    const trimmedHost = host.trim()
    const trimmedTarget = countdownTarget.trim()
    const payload = {
      label:             label.trim(),
      host:              trimmedHost || null,
      port,
      clock_number:      clockNumber,
      pull_time:         pullTime,
      pull_day:          pullDay,
      sort_order:        sortOrder,
      countdown_target:  trimmedTarget || null,
      service_type_slug: serviceSlug || null,
      analytics_key:     analyticsKey || null,
    }
    let err: { message: string } | null = null
    if (field) {
      const result = await supabase.from('runtime_fields').update(payload).eq('id', field.id)
      err = result.error
    } else {
      const result = await supabase.from('runtime_fields').insert(payload)
      err = result.error
    }
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <h3 className="text-gray-900 font-bold">{field ? 'Edit Runtime' : 'Add Runtime'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Label *</label>
            <input
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 text-sm focus:outline-none focus:border-blue-500"
              value={label} onChange={e => setLabel(e.target.value)}
              placeholder="e.g. 9am Service Runtime"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Service</label>
            <select
              value={serviceSlug}
              onChange={e => setServiceSlug(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-gray-900 text-sm focus:outline-none focus:border-blue-500"
            >
              {SERVICE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <p className="text-gray-400 text-[10px] mt-1">
              Choose which service this runtime appears on. "All Services" shows it everywhere.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">ProPresenter Connection</label>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <input
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 text-sm font-mono placeholder-gray-400 focus:outline-none focus:border-blue-500"
                  value={host} onChange={e => setHost(e.target.value)}
                  placeholder="192.168.1.100"
                />
                <p className="text-gray-400 text-[10px] mt-1">Leave blank for a manual-entry-only runtime</p>
              </div>
              <div>
                <input
                  type="number" min="1" max="65535"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 text-sm font-mono focus:outline-none focus:border-blue-500"
                  value={port} onChange={e => setPort(parseInt(e.target.value) || 1025)}
                  disabled={!host.trim()}
                />
                <p className="text-gray-400 text-[10px] mt-1">Port</p>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Clock Number</label>
            <input
              type="number" min="0"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 text-sm font-mono focus:outline-none focus:border-blue-500"
              value={clockNumber}
              onChange={e => {
                const nextValue = parseInt(e.target.value, 10)
                setClockNumber(Number.isNaN(nextValue) ? 0 : nextValue)
              }}
              disabled={!host.trim()}
            />
            <p className="text-gray-400 text-[10px] mt-1">
              {host.trim()
                ? "Zero-based index in ProPresenter's Clock module (0 = first clock)"
                : 'Not used for manual-entry-only runtimes'}
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Countdown Target <span className="text-gray-400 normal-case font-normal">(optional)</span>
            </label>
            <input
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 text-sm font-mono placeholder-gray-400 focus:outline-none focus:border-blue-500"
              value={countdownTarget}
              onChange={e => setCountdownTarget(e.target.value)}
              placeholder="e.g. 25:00"
            />
            <p className="text-gray-400 text-[10px] mt-1">
              Set this if the ProPresenter clock is a countdown timer with &quot;Allow Overrun&quot; checked.
              The relay will add this target duration to any captured overrun time to store the true total.
              Leave blank for stopwatch / elapsed-time clocks.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Analytics Key <span className="text-gray-400 normal-case font-normal">(optional)</span>
            </label>
            <select
              value={analyticsKey}
              onChange={e => setAnalyticsKey(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-gray-900 text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="">None — not synced to analytics</option>
              <option value="service_run_time">Service Runtime</option>
              <option value="message_run_time">Message Runtime</option>
              <option value="stage_flip_time">Stage Flip Time</option>
            </select>
            <p className="text-gray-400 text-[10px] mt-1">
              Tag this runtime so its value is written to the analytics record for this service.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Pull Day</label>
              <select value={pullDay} onChange={e => setPullDay(parseInt(e.target.value))}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-gray-900 text-sm focus:outline-none focus:border-blue-500">
                {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Pull Time</label>
              <input
                type="time"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-gray-900 text-sm focus:outline-none focus:border-blue-500"
                value={pullTime} onChange={e => setPullTime(e.target.value)}
              />
            </div>
          </div>

          {error && <p className="text-red-500 text-xs">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button onClick={onClose}
              className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-60">
              {saving ? 'Saving...' : field ? 'Save Changes' : 'Add Runtime'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
