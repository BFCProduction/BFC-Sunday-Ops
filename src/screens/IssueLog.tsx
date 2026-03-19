import { useEffect, useState } from 'react'
import { AlertTriangle, Plus, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Card } from '../components/ui/Card'
import type { Issue } from '../types'

interface IssueLogProps {
  sundayId: string
}

const MONDAY_PUSH_ENABLED = import.meta.env.VITE_ENABLE_MONDAY_PUSH === 'true'

const SEV_STYLE: Record<string, string> = {
  Low:      'bg-emerald-50 text-emerald-700 border-emerald-200',
  Medium:   'bg-amber-50 text-amber-700 border-amber-200',
  High:     'bg-red-50 text-red-700 border-red-200',
  Critical: 'bg-red-100 text-red-800 border-red-300',
}

export function IssueLog({ sundayId }: IssueLogProps) {
  const [issues, setIssues] = useState<Issue[]>([])
  const [showForm, setShowForm] = useState(false)
  const [desc, setDesc] = useState('')
  const [severity, setSeverity] = useState<Issue['severity']>('Medium')
  const [confirmIssue, setConfirmIssue] = useState<Omit<Issue, 'id' | 'monday_item_id' | 'pushed_to_monday'> | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    supabase.from('issues').select('*').eq('sunday_id', sundayId)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setIssues((data || []) as Issue[]); setLoading(false) })
  }, [sundayId])

  const handleSubmit = () => {
    if (!desc.trim()) return
    const newIssue = { sunday_id: sundayId, description: desc.trim(), severity, created_at: new Date().toISOString() }
    setNotice('')
    if (severity === 'Low' || !MONDAY_PUSH_ENABLED) {
      saveIssue(newIssue, false)
    } else {
      setConfirmIssue(newIssue)
    }
  }

  const saveIssue = async (issue: Omit<Issue, 'id' | 'monday_item_id' | 'pushed_to_monday'>, pushToMonday: boolean) => {
    setSaving(true)
    const { data } = await supabase.from('issues').insert({
      ...issue, pushed_to_monday: false,
    }).select().single()
    if (data) setIssues(p => [data as Issue, ...p])
    setDesc(''); setSeverity('Medium'); setShowForm(false); setConfirmIssue(null)

    if (pushToMonday && data) {
      try {
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/push-monday-issue`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ issue_id: data.id, description: issue.description, severity: issue.severity }),
        })

        if (!response.ok) {
          throw new Error(`Monday push failed with ${response.status}`)
        }

        const result = await response.json().catch(() => ({}))
        const mondayItemId = typeof result?.itemId === 'string' ? result.itemId : null

        await supabase.from('issues').update({
          pushed_to_monday: true,
          monday_item_id: mondayItemId,
        }).eq('id', data.id)

        setIssues(prev => prev.map(entry => (
          entry.id === data.id
            ? { ...entry, pushed_to_monday: true, monday_item_id: mondayItemId }
            : entry
        )))
      } catch (error) {
        console.error(error)
        setNotice('Issue saved, but Monday.com push is unavailable in this environment.')
      }
    }

    setSaving(false)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="fade-in">
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 px-5 pt-4 pb-4 flex items-center justify-between">
        <div>
          <h2 className="text-gray-900 font-bold text-lg">Issue Log</h2>
          <p className="text-gray-400 text-xs mt-0.5">{issues.length} issue{issues.length !== 1 ? 's' : ''} logged today</p>
        </div>
        <button onClick={() => setShowForm(f => !f)}
          className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors active:scale-95">
          <Plus className="w-4 h-4" />Log Issue
        </button>
      </div>

      <div className="p-5 space-y-4">
        {notice && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <p className="text-amber-700 text-xs font-medium">{notice}</p>
          </div>
        )}
        <div className="grid grid-cols-1 xl:grid-cols-[400px_1fr] gap-5 items-start">
          {showForm && (
            <Card className="p-5 space-y-4 slide-up">
              <div className="flex items-center justify-between">
                <h3 className="text-gray-900 font-semibold">New Issue</h3>
                <button onClick={() => { setShowForm(false); setDesc('') }} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
              </div>
              <textarea rows={3} placeholder="Describe the issue…"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-blue-500 resize-none"
                value={desc} onChange={e => setDesc(e.target.value)} />
              <div>
                <p className="text-gray-500 text-xs font-medium mb-2">Severity</p>
                <div className="grid grid-cols-4 gap-2">
                  {(['Low', 'Medium', 'High', 'Critical'] as const).map(s => (
                    <button key={s} onClick={() => setSeverity(s)}
                      className={`py-2 rounded-lg text-[11px] font-bold border transition-all ${severity === s ? SEV_STYLE[s] : 'bg-gray-50 border-gray-200 text-gray-400'}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setShowForm(false); setDesc('') }}
                  className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium">Cancel</button>
                <button onClick={handleSubmit} disabled={saving}
                  className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-60">
                  {saving ? 'Saving...' : 'Submit'}
                </button>
              </div>
              {!MONDAY_PUSH_ENABLED && severity !== 'Low' && (
                <p className="text-amber-600 text-[10px] text-center">Monday.com push is disabled in this environment.</p>
              )}
              {MONDAY_PUSH_ENABLED && severity !== 'Low' && (
                <p className="text-gray-400 text-[10px] text-center">You will be asked whether to push this to Monday.com</p>
              )}
            </Card>
          )}

          <div className="space-y-3">
            {issues.length === 0 && !showForm && (
              <div className="text-center py-16">
                <AlertTriangle className="w-8 h-8 text-gray-200 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">No issues logged yet</p>
              </div>
            )}
            {issues.map(issue => (
              <Card key={issue.id} className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${SEV_STYLE[issue.severity]}`}>
                    {issue.severity}
                  </span>
                  <span className="text-gray-400 text-[11px]">
                    {new Date(issue.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-gray-800 text-sm leading-snug">{issue.description}</p>
                <div className="mt-2.5">
                  {issue.pushed_to_monday ? (
                    <span className="inline-flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1 text-[10px] text-blue-700 font-medium">
                      Task created in Monday.com
                    </span>
                  ) : (
                    <span className="text-gray-400 text-[10px]">Not pushed to Monday.com</span>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>

      {/* Confirmation modal */}
      {confirmIssue && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm slide-up shadow-2xl">
            <div className="w-10 h-10 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-center mb-3">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <h3 className="text-gray-900 font-bold mb-1">Push to Monday.com?</h3>
            <p className="text-gray-500 text-sm mb-3">
              This is a <span className={`font-semibold ${confirmIssue.severity === 'Critical' ? 'text-red-600' : 'text-amber-600'}`}>{confirmIssue.severity}</span> severity issue.
            </p>
            <p className="text-gray-500 text-xs bg-gray-50 rounded-xl p-3 leading-relaxed mb-4">"{confirmIssue.description}"</p>
            <div className="flex gap-3">
              <button onClick={() => saveIssue(confirmIssue, false)} disabled={saving}
                className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium">Log Only</button>
              <button onClick={() => saveIssue(confirmIssue, true)} disabled={saving}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700">
                {saving ? 'Saving...' : 'Push to Monday'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
