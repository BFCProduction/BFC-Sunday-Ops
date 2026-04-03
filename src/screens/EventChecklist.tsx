import { useEffect, useState, useCallback, Fragment } from 'react'
import { CheckCircle2, ChevronDown, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { EventChecklistItem, EventChecklistCompletion } from '../types'

interface Props {
  eventId: string
}

interface CompletionMap {
  [itemId: string]: { initials: string; time: string }
}

const INITIALS_KEY = 'bfc-checklist-initials'

// ── Main ──────────────────────────────────────────────────────────────────────

export function EventChecklist({ eventId }: Props) {
  const [items, setItems] = useState<EventChecklistItem[]>([])
  const [completions, setCompletions] = useState<CompletionMap>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [operatorInitials, setOperatorInitials] = useState(
    () => window.localStorage.getItem(INITIALS_KEY) || ''
  )
  const [modal, setModal] = useState<string | null>(null)   // item id pending sign-off
  const [modalInitials, setModalInitials] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [timezone, setTimezone] = useState('America/Chicago')

  useEffect(() => {
    supabase.from('app_config').select('value').eq('key', 'church_timezone').maybeSingle()
      .then(({ data }) => { if (data?.value) setTimezone(data.value) })
  }, [])

  // Persist initials
  useEffect(() => {
    const v = operatorInitials.trim().toUpperCase()
    if (v) window.localStorage.setItem(INITIALS_KEY, v)
    else window.localStorage.removeItem(INITIALS_KEY)
  }, [operatorInitials])

  const loadData = useCallback(async () => {
    const [itemsRes, completionsRes] = await Promise.all([
      supabase.from('event_checklist_items').select('*').eq('event_id', eventId).order('sort_order'),
      supabase.from('event_checklist_completions').select('*').eq('event_id', eventId),
    ])

    const newItems: EventChecklistItem[] = itemsRes.data || []
    setItems(newItems)

    // Default all sections to expanded
    setExpanded(prev => {
      const updated = { ...prev }
      Array.from(new Set(newItems.map(i => i.section))).forEach(sec => {
        if (!(sec in updated)) updated[sec] = true
      })
      return updated
    })

    const map: CompletionMap = {}
    for (const c of (completionsRes.data || []) as EventChecklistCompletion[]) {
      const t = new Date(c.completed_at).toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', hour12: true, timeZone: timezone,
      })
      map[c.item_id] = { initials: c.initials, time: t }
    }
    setCompletions(map)
    setLoading(false)
  }, [eventId, timezone])

  useEffect(() => { loadData() }, [loadData])

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel(`event_completions:${eventId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'event_checklist_completions',
        filter: `event_id=eq.${eventId}`,
      }, () => loadData())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [eventId, loadData])

  async function completeItem(itemId: string, ini: string) {
    const initials = ini.trim().toUpperCase() || 'N/A'
    const now = new Date().toISOString()
    setSaving(true)
    await supabase.from('event_checklist_completions')
      .upsert({ event_id: eventId, item_id: itemId, initials, completed_at: now },
        { onConflict: 'event_id,item_id' })
    setCompletions(p => ({
      ...p,
      [itemId]: {
        initials,
        time: new Date(now).toLocaleTimeString('en-US', {
          hour: 'numeric', minute: '2-digit', hour12: true, timeZone: timezone,
        }),
      },
    }))
    setSaving(false)
  }

  async function toggleItem(item: EventChecklistItem) {
    if (completions[item.id]) {
      await supabase.from('event_checklist_completions')
        .delete().eq('event_id', eventId).eq('item_id', item.id)
      setCompletions(p => { const n = { ...p }; delete n[item.id]; return n })
    } else if (operatorInitials.trim()) {
      await completeItem(item.id, operatorInitials)
    } else {
      setModalInitials('')
      setModal(item.id)
    }
  }

  async function confirmCheck() {
    if (!modal) return
    const ini = modalInitials.trim().toUpperCase()
    await completeItem(modal, ini)
    if (ini) setOperatorInitials(ini)
    setModal(null)
    setModalInitials('')
  }

  // Group into sections (preserving sort_order grouping)
  const allSections = Array.from(new Set(items.map(i => i.section)))
  const sectionedItems = allSections.map(section => ({
    section,
    items: items.filter(i => i.section === section),
  }))

  const allVisibleItems = sectionedItems.flatMap(s => s.items)
  const totalDone = allVisibleItems.filter(i => completions[i.id]).length
  const pct = allVisibleItems.length ? Math.round(totalDone / allVisibleItems.length * 100) : 0

  const modalItem = modal ? items.find(i => i.id === modal) : null

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (items.length === 0) return (
    <div className="max-w-2xl mx-auto px-4 py-12 text-center">
      <p className="text-gray-500 text-sm">No checklist items for this event yet.</p>
      <p className="text-gray-400 text-xs mt-1">An admin can add items in Settings → Special Events.</p>
    </div>
  )

  return (
    <div className="fade-in">
      {/* Sticky header */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 px-5 pt-4 pb-3">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-gray-900 font-bold text-lg">Event Checklist</h2>
            <p className="text-gray-400 text-xs mt-0.5">{totalDone} of {allVisibleItems.length} items completed</p>
          </div>
          <span className={`text-sm font-bold ${pct === 100 ? 'text-emerald-600' : 'text-gray-400'}`}>{pct}%</span>
        </div>

        {/* Initials input */}
        <div className="mb-3">
          <label className="block text-gray-500 text-[11px] font-medium mb-1.5">Your Initials</label>
          <div className="flex items-center gap-2">
            <input
              maxLength={3}
              value={operatorInitials}
              onChange={e => setOperatorInitials(e.target.value.toUpperCase())}
              placeholder="AB"
              className="w-20 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-sm font-bold tracking-widest uppercase text-center focus:outline-none focus:border-blue-500"
            />
            <p className="text-gray-400 text-[11px]">
              These initials will be applied automatically to every item you check off.
            </p>
          </div>
        </div>

        <div className="bg-gray-100 rounded-full h-1">
          <div className="bg-blue-600 h-1 rounded-full progress-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="p-5 space-y-3">
        {allVisibleItems.length > 0 && totalDone < allVisibleItems.length && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 flex items-center gap-2">
            <span className="text-amber-500 text-sm flex-shrink-0">!</span>
            <p className="text-amber-700 text-xs font-medium">
              {allVisibleItems.length - totalDone} item{allVisibleItems.length - totalDone !== 1 ? 's' : ''} remaining
            </p>
          </div>
        )}

        <div className="space-y-3 xl:space-y-0 xl:columns-2 xl:[column-gap:0.75rem]">
          {sectionedItems.map(({ section, items: sectionItems }) => {
            const secDone = sectionItems.filter(i => completions[i.id]).length
            const isOpen = expanded[section] !== false

            return (
              <div key={section} className="xl:inline-block xl:w-full xl:break-inside-avoid xl:mb-3">
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                  {/* Section header */}
                  <button
                    onClick={() => setExpanded(p => ({ ...p, [section]: !p[section] }))}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-gray-900 font-semibold text-sm">{section}</span>
                      {secDone === sectionItems.length && sectionItems.length > 0 && (
                        <span className="flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded-full font-semibold border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" />Done
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 text-xs">{secDone}/{sectionItems.length}</span>
                      <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-gray-100">
                      {sectionItems.map((item, idx) => {
                        const chk = completions[item.id]
                        const prevSubsection = idx > 0 ? sectionItems[idx - 1].subsection : null
                        const showSubsection = item.subsection && item.subsection !== prevSubsection
                        const isLast = idx === sectionItems.length - 1

                        return (
                          <Fragment key={item.id}>
                            {showSubsection && (
                              <div className="px-4 py-1.5 bg-gray-50 border-t border-b border-gray-100">
                                <p className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider">{item.subsection}</p>
                              </div>
                            )}
                            <div className={`flex items-start gap-3 px-4 py-2.5 ${isLast ? '' : 'border-b border-gray-50'} ${chk ? 'opacity-50' : ''} hover:bg-gray-50/50 transition-colors bg-white`}>
                              <button
                                onClick={() => toggleItem(item)}
                                className={`flex-shrink-0 mt-0.5 w-[18px] h-[18px] rounded border-2 flex items-center justify-center transition-all ${
                                  chk ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300 hover:border-gray-400'
                                }`}
                              >
                                {chk && <CheckCircle2 className="w-3 h-3 text-white" strokeWidth={3} />}
                              </button>
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm leading-snug ${chk ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                                  {item.label}
                                </p>
                                {item.item_notes && (
                                  <p className="text-gray-400 text-[11px] mt-1 leading-snug">{item.item_notes}</p>
                                )}
                                {chk && (
                                  <p className="text-emerald-600 text-[10px] mt-0.5 font-medium">{chk.initials} · {chk.time}</p>
                                )}
                              </div>
                            </div>
                          </Fragment>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Sign-off modal */}
      {modal && modalItem && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm slide-up shadow-2xl">
            <div className="flex items-start justify-between mb-1">
              <h3 className="text-gray-900 font-bold">Sign Off</h3>
              <button onClick={() => { setModal(null); setModalInitials('') }} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-gray-500 text-sm mb-1">{modalItem.label}</p>
            <p className="text-gray-400 text-xs mb-4">Enter your initials to confirm.</p>
            <input
              autoFocus maxLength={3}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 text-center text-2xl font-bold tracking-widest uppercase focus:outline-none focus:border-blue-500"
              placeholder="AB"
              value={modalInitials}
              onChange={e => setModalInitials(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && confirmCheck()}
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => { setModal(null); setModalInitials('') }}
                className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors"
              >Cancel</button>
              <button
                onClick={confirmCheck}
                disabled={saving}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-60"
              >{saving ? 'Saving…' : 'Check Off'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
