import { useEffect, useState, useCallback } from 'react'
import { CheckCircle2, ChevronDown, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { CHECKLIST_ITEMS, SECTIONS, ROLE_COLORS, ROLES } from '../data/checklist'
import type { Role } from '../types'

interface ChecklistProps {
  sundayId: string
}

interface CompletionMap {
  [itemId: number]: { initials: string; time: string }
}

export function Checklist({ sundayId }: ChecklistProps) {
  const [completions, setCompletions] = useState<CompletionMap>({})
  const [role, setRole] = useState<Role>('All')
  const [expanded, setExpanded] = useState<Record<string, boolean>>(
    Object.fromEntries(SECTIONS.map(s => [s, true]))
  )
  const [modal, setModal] = useState<number | null>(null)
  const [initials, setInitials] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadCompletions = useCallback(async () => {
    const { data } = await supabase
      .from('checklist_completions')
      .select('item_id, initials, completed_at')
      .eq('sunday_id', sundayId)
    if (data) {
      const map: CompletionMap = {}
      data.forEach((r: { item_id: number; initials: string; completed_at: string }) => {
        map[r.item_id] = {
          initials: r.initials,
          time: new Date(r.completed_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
        }
      })
      setCompletions(map)
    }
    setLoading(false)
  }, [sundayId])

  useEffect(() => { loadCompletions() }, [loadCompletions])

  const toggleItem = async (id: number) => {
    if (completions[id]) {
      // Uncheck
      await supabase.from('checklist_completions')
        .delete().eq('sunday_id', sundayId).eq('item_id', id)
      setCompletions(p => { const n = { ...p }; delete n[id]; return n })
    } else {
      setModal(id)
    }
  }

  const confirmCheck = async () => {
    if (!modal) return
    setSaving(true)
    const ini = initials.trim().toUpperCase() || 'N/A'
    const now = new Date().toISOString()
    await supabase.from('checklist_completions').upsert({
      sunday_id: sundayId, item_id: modal, initials: ini, completed_at: now,
    })
    setCompletions(p => ({
      ...p,
      [modal]: { initials: ini, time: new Date(now).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) },
    }))
    setSaving(false)
    setModal(null)
    setInitials('')
  }

  const filtered = SECTIONS.map(section => ({
    section,
    items: CHECKLIST_ITEMS.filter(i => i.section === section && (role === 'All' || i.role === role)),
  })).filter(s => s.items.length > 0)

  const visItems = filtered.flatMap(s => s.items)
  const visDone = visItems.filter(i => completions[i.id]).length
  const pct = visItems.length ? Math.round(visDone / visItems.length * 100) : 0

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="fade-in">
      {/* Sticky header */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 px-5 pt-4 pb-3">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-gray-900 font-bold text-lg">Gameday Checklist</h2>
            <p className="text-gray-400 text-xs mt-0.5">{visDone} of {visItems.length} items completed</p>
          </div>
          <span className={`text-sm font-bold ${pct === 100 ? 'text-emerald-600' : 'text-gray-400'}`}>{pct}%</span>
        </div>
        {/* Role pills */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {ROLES.map(r => {
            const active = role === r
            return (
              <button key={r} onClick={() => setRole(r as Role)}
                className="px-3 py-1 rounded-full text-xs font-semibold transition-all"
                style={active ? { background: r === 'All' ? '#2563eb' : ROLE_COLORS[r], color: '#fff' }
                  : { background: '#f3f4f6', color: '#6b7280' }}>
                {r}
              </button>
            )
          })}
        </div>
        <div className="bg-gray-100 rounded-full h-1">
          <div className="bg-blue-600 h-1 rounded-full progress-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="p-5 space-y-3">
        {visDone < visItems.length && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 flex items-center gap-2">
            <span className="text-amber-500 text-sm flex-shrink-0">!</span>
            <p className="text-amber-700 text-xs font-medium">
              {visItems.length - visDone} item{visItems.length - visDone !== 1 ? 's' : ''} remaining before service starts
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start">
          {filtered.map(({ section, items }) => {
            const secDone = items.filter(i => completions[i.id]).length
            const isOpen = expanded[section]
            return (
              <div key={section} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <button onClick={() => setExpanded(p => ({ ...p, [section]: !p[section] }))}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-2.5">
                    <span className="text-gray-900 font-semibold text-sm">{section}</span>
                    {secDone === items.length && (
                      <span className="flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded-full font-semibold border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3" />Done
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 text-xs">{secDone}/{items.length}</span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-gray-100">
                    {items.map((item, idx) => {
                      const chk = completions[item.id]
                      // Group by subsection
                      const prevSubsection = idx > 0 ? items[idx - 1].subsection : null
                      const showSubsection = item.subsection && item.subsection !== prevSubsection
                      return (
                        <div key={item.id}>
                          {showSubsection && (
                            <div className="px-4 py-1.5 bg-gray-50 border-t border-b border-gray-100">
                              <p className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider">{item.subsection}</p>
                            </div>
                          )}
                          <div className={`flex items-start gap-3 px-4 py-2.5 ${idx < items.length - 1 ? 'border-b border-gray-50' : ''} ${chk ? 'opacity-50' : ''} hover:bg-gray-50/50 transition-colors`}>
                            <button onClick={() => toggleItem(item.id)}
                              className={`flex-shrink-0 mt-0.5 w-[18px] h-[18px] rounded border-2 flex items-center justify-center transition-all ${chk ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300 hover:border-gray-400'}`}>
                              {chk && <CheckCircle2 className="w-3 h-3 text-white" strokeWidth={3} />}
                            </button>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm leading-snug ${chk ? 'line-through text-gray-400' : 'text-gray-800'}`}>{item.task}</p>
                              {item.note && <p className="text-gray-400 text-[11px] mt-0.5 leading-snug">{item.note}</p>}
                              {chk && <p className="text-emerald-600 text-[10px] mt-0.5 font-medium">{chk.initials} · {chk.time}</p>}
                            </div>
                            <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                              style={{ background: ROLE_COLORS[item.role] + '20', color: ROLE_COLORS[item.role] }}>
                              {item.role}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Initials modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm slide-up shadow-2xl">
            <div className="flex items-start justify-between mb-1">
              <h3 className="text-gray-900 font-bold">Sign Off</h3>
              <button onClick={() => { setModal(null); setInitials('') }} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-gray-500 text-sm mb-1">
              {CHECKLIST_ITEMS.find(i => i.id === modal)?.task}
            </p>
            <p className="text-gray-400 text-xs mb-4">Enter your initials to confirm.</p>
            <input autoFocus maxLength={3}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 text-center text-2xl font-bold tracking-widest uppercase focus:outline-none focus:border-blue-500"
              placeholder="AB" value={initials} onChange={e => setInitials(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && confirmCheck()} />
            <div className="flex gap-3 mt-4">
              <button onClick={() => { setModal(null); setInitials('') }}
                className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors">
                Cancel
              </button>
              <button onClick={confirmCheck} disabled={saving}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-60">
                {saving ? 'Saving...' : 'Check Off'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
