import { useEffect, useState, useCallback } from 'react'
import { CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { EventChecklistItem, EventChecklistCompletion } from '../types'

interface Props {
  eventId: string
}

interface CompletionMap {
  [itemId: string]: { initials: string; time: string }
}

// ── Initials prompt ───────────────────────────────────────────────────────────

const INITIALS_KEY = 'checklist_initials'

function getStoredInitials(): string {
  try { return localStorage.getItem(INITIALS_KEY) ?? '' } catch { return '' }
}

function saveInitials(v: string) {
  try { localStorage.setItem(INITIALS_KEY, v) } catch {}
}

// ── Item row ──────────────────────────────────────────────────────────────────

interface RowProps {
  item: EventChecklistItem
  completion?: { initials: string; time: string }
  onToggle: () => void
}

function ChecklistRow({ item, completion, onToggle }: RowProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={`flex items-start gap-3 px-4 py-2.5 border-b border-gray-50 hover:bg-gray-50/50 transition-colors bg-white ${completion ? 'opacity-60' : ''}`}>
      <button
        onClick={onToggle}
        className={`flex-shrink-0 mt-0.5 w-[18px] h-[18px] rounded border-2 flex items-center justify-center transition-all ${
          completion ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300 hover:border-gray-400'
        }`}
      >
        {completion && <CheckCircle2 className="w-3 h-3 text-white" strokeWidth={3} />}
      </button>

      <div className="flex-1 min-w-0">
        {item.item_notes ? (
          <button onClick={() => setExpanded(e => !e)} className="flex items-start gap-1 text-left w-full group">
            <span className={`text-sm leading-snug ${completion ? 'line-through text-gray-400' : 'text-gray-800'}`}>
              {item.label}
            </span>
            {expanded
              ? <ChevronDown className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-gray-400" />
              : <ChevronRight className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-gray-300 group-hover:text-gray-400" />
            }
          </button>
        ) : (
          <p className={`text-sm leading-snug ${completion ? 'line-through text-gray-400' : 'text-gray-800'}`}>
            {item.label}
          </p>
        )}
        {expanded && item.item_notes && (
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">{item.item_notes}</p>
        )}
      </div>

      {completion && (
        <span className="text-[10px] text-gray-400 flex-shrink-0 mt-0.5 text-right leading-tight">
          {completion.initials}<br />
          {completion.time}
        </span>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function EventChecklist({ eventId }: Props) {
  const [items, setItems] = useState<EventChecklistItem[]>([])
  const [completions, setCompletions] = useState<CompletionMap>({})
  const [initials, setInitials] = useState(getStoredInitials)
  const [initialsInput, setInitialsInput] = useState('')
  const [showInitialsPrompt, setShowInitialsPrompt] = useState(false)
  const [pendingItemId, setPendingItemId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [timezone, setTimezone] = useState('America/Chicago')

  useEffect(() => {
    supabase.from('app_config').select('value').eq('key', 'church_timezone').maybeSingle()
      .then(({ data }) => { if (data?.value) setTimezone(data.value) })
  }, [])

  const loadData = useCallback(async () => {
    const [itemsRes, completionsRes] = await Promise.all([
      supabase.from('event_checklist_items').select('*').eq('event_id', eventId).order('sort_order'),
      supabase.from('event_checklist_completions').select('*').eq('event_id', eventId),
    ])
    setItems(itemsRes.data || [])

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

  function handleToggle(item: EventChecklistItem) {
    if (completions[item.id]) {
      // Uncomplete
      supabase.from('event_checklist_completions')
        .delete()
        .eq('event_id', eventId)
        .eq('item_id', item.id)
        .then(() => loadData())
      return
    }
    if (!initials) {
      setPendingItemId(item.id)
      setShowInitialsPrompt(true)
      return
    }
    complete(item.id, initials)
  }

  function complete(itemId: string, ini: string) {
    supabase.from('event_checklist_completions')
      .upsert({ event_id: eventId, item_id: itemId, initials: ini }, { onConflict: 'event_id,item_id' })
      .then(() => loadData())
  }

  function confirmInitials() {
    const trimmed = initialsInput.trim().toUpperCase()
    if (!trimmed) return
    setInitials(trimmed)
    saveInitials(trimmed)
    setShowInitialsPrompt(false)
    if (pendingItemId) {
      complete(pendingItemId, trimmed)
      setPendingItemId(null)
    }
    setInitialsInput('')
  }

  // Group by section / subsection
  type GroupedItem = { section: string; subsection: string | null; items: EventChecklistItem[] }
  const groups: GroupedItem[] = []
  for (const item of items) {
    const last = groups[groups.length - 1]
    if (last && last.section === item.section && last.subsection === (item.subsection ?? null)) {
      last.items.push(item)
    } else {
      groups.push({ section: item.section, subsection: item.subsection ?? null, items: [item] })
    }
  }

  const total = items.length
  const done = Object.keys(completions).length

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (items.length === 0) return (
    <div className="max-w-2xl mx-auto px-4 py-12 text-center">
      <p className="text-gray-500 text-sm">No checklist items for this event yet.</p>
      <p className="text-gray-400 text-xs mt-1">An admin can add items in Settings → Special Events.</p>
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto py-6 px-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Event Checklist</h2>
          {initials && (
            <p className="text-xs text-gray-500 mt-0.5">
              Checking as <span className="font-semibold text-gray-700">{initials}</span>
              {' · '}
              <button onClick={() => { setInitials(''); saveInitials('') }} className="text-blue-500 hover:underline">change</button>
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-gray-900">{done}/{total}</p>
          <p className="text-[10px] text-gray-400 uppercase tracking-widest">Complete</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-gray-100 rounded-full mb-6 overflow-hidden">
        <div
          className="h-full bg-emerald-500 rounded-full transition-all duration-300"
          style={{ width: total > 0 ? `${(done / total) * 100}%` : '0%' }}
        />
      </div>

      {/* Sections */}
      {groups.map((group, gi) => {
        // Section header only when section changes
        const prevGroup = groups[gi - 1]
        const showSection = !prevGroup || prevGroup.section !== group.section

        return (
          <div key={`${group.section}-${group.subsection ?? ''}-${gi}`}>
            {showSection && (
              <div className="px-4 pt-4 pb-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{group.section}</p>
              </div>
            )}
            {group.subsection && (
              <div className="px-4 pt-2 pb-0.5">
                <p className="text-[10px] font-semibold text-gray-400">{group.subsection}</p>
              </div>
            )}
            <div className="border border-gray-100 rounded-xl overflow-hidden mb-2">
              {group.items.map(item => (
                <ChecklistRow
                  key={item.id}
                  item={item}
                  completion={completions[item.id]}
                  onToggle={() => handleToggle(item)}
                />
              ))}
            </div>
          </div>
        )
      })}

      {/* Initials prompt modal */}
      {showInitialsPrompt && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-6">
            <h3 className="text-base font-bold text-gray-900 mb-1">Enter your initials</h3>
            <p className="text-xs text-gray-500 mb-4">These will be saved for the rest of this session.</p>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-center text-lg font-bold tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
              value={initialsInput}
              onChange={e => setInitialsInput(e.target.value.toUpperCase())}
              placeholder="JD"
              maxLength={4}
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') confirmInitials() }}
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setShowInitialsPrompt(false); setPendingItemId(null) }}
                className="flex-1 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
              >Cancel</button>
              <button
                onClick={confirmInitials}
                disabled={!initialsInput.trim()}
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-40"
              >Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
