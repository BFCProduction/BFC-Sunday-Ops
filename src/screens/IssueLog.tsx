import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Plus, Trash2, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Card } from '../components/ui/Card'
import { useAdmin } from '../context/adminState'
import { useSunday } from '../context/SundayContext'
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
  const { isAdmin } = useAdmin()
  const { timezone } = useSunday()
  const [issues, setIssues] = useState<Issue[]>([])
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [severity, setSeverity] = useState<Issue['severity']>('Medium')
  const [createTask, setCreateTask] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Issue | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    supabase.from('issues').select('*').eq('sunday_id', sundayId)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setIssues((data || []) as Issue[]); setLoading(false) })
  }, [sundayId])

  const resetForm = () => {
    setTitle('')
    setDesc('')
    setSeverity('Medium')
    setCreateTask(false)
    setShowForm(false)
  }

  const handleSubmit = () => {
    if (!title.trim() || !desc.trim()) {
      setNotice('Issue title and description are required.')
      return
    }
    const newIssue = {
      sunday_id: sundayId,
      title: title.trim(),
      description: desc.trim(),
      severity,
      created_at: new Date().toISOString(),
    }
    setNotice('')
    const pushToMonday = MONDAY_PUSH_ENABLED && createTask && severity !== 'Low'
    saveIssue(newIssue, pushToMonday)
  }

  const saveIssue = async (
    issue: Omit<Issue, 'id' | 'monday_item_id' | 'pushed_to_monday' | 'resolved_at'>,
    pushToMonday: boolean,
  ) => {
    setSaving(true)
    const { data, error } = await supabase.from('issues').insert({
      ...issue, pushed_to_monday: false,
    }).select().single()
    if (error) {
      setSaving(false)
      setNotice(error.message)
      return
    }
    if (data) setIssues(p => [data as Issue, ...p])
    resetForm()

    if (pushToMonday && data) {
      try {
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/push-monday-issue`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            issue_id: data.id,
            title: issue.title,
            description: issue.description,
            severity: issue.severity,
          }),
        })

        if (!response.ok) throw new Error(`Monday push failed with ${response.status}`)

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
      } catch (err) {
        console.error(err)
        setNotice('Issue saved, but follow-up sync is unavailable in this environment.')
      }
    }

    setSaving(false)
  }

  const resolveIssue = async (issue: Issue) => {
    const resolved_at = new Date().toISOString()
    const { error } = await supabase.from('issues').update({ resolved_at }).eq('id', issue.id)
    if (error) { setNotice(error.message); return }
    setIssues(prev => prev.map(e => e.id === issue.id ? { ...e, resolved_at } : e))
  }

  const unresolveIssue = async (issue: Issue) => {
    const { error } = await supabase.from('issues').update({ resolved_at: null }).eq('id', issue.id)
    if (error) { setNotice(error.message); return }
    setIssues(prev => prev.map(e => e.id === issue.id ? { ...e, resolved_at: null } : e))
  }

  const deleteIssue = async (issue: Issue) => {
    setSaving(true)
    const { error } = await supabase.from('issues').delete().eq('id', issue.id)
    setSaving(false)
    if (error) { setNotice(error.message); return }
    setIssues(prev => prev.filter(e => e.id !== issue.id))
    setConfirmDelete(null)
    setNotice('Issue deleted.')
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const open     = issues.filter(i => !i.resolved_at)
  const resolved = issues.filter(i => i.resolved_at)

  return (
    <div className="fade-in">
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 px-5 pt-4 pb-4 flex items-center justify-between">
        <div>
          <h2 className="text-gray-900 font-bold text-lg">Issue Log</h2>
          <p className="text-gray-400 text-xs mt-0.5">
            {open.length} open · {resolved.length} resolved
          </p>
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
          {/* ── New issue form ── */}
          {showForm && (
            <Card className="p-5 space-y-4 slide-up">
              <div className="flex items-center justify-between">
                <h3 className="text-gray-900 font-semibold">New Issue</h3>
                <button onClick={resetForm} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
              </div>
              <input
                type="text"
                placeholder="Issue title..."
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-blue-500"
                value={title}
                onChange={e => setTitle(e.target.value)}
              />
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

              {/* Monday follow-up checkbox — replaces the old modal */}
              {MONDAY_PUSH_ENABLED && severity !== 'Low' && (
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={createTask}
                    onChange={e => setCreateTask(e.target.checked)}
                    className="h-4 w-4 mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <p className="text-gray-800 text-xs font-semibold">Flag for follow-up before next Sunday</p>
                    <p className="text-gray-400 text-[10px] mt-0.5">Creates a task in monday.com to address this issue.</p>
                  </div>
                </label>
              )}

              <div className="flex gap-2">
                <button onClick={resetForm}
                  className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium">Cancel</button>
                <button onClick={handleSubmit} disabled={saving}
                  className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-60">
                  {saving ? 'Saving...' : 'Submit'}
                </button>
              </div>
            </Card>
          )}

          {/* ── Issue list ── */}
          <div className="space-y-3">
            {issues.length === 0 && !showForm && (
              <div className="text-center py-16">
                <AlertTriangle className="w-8 h-8 text-gray-200 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">No issues logged yet</p>
              </div>
            )}

            {/* Open issues */}
            {open.map(issue => (
              <Card key={issue.id} className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${SEV_STYLE[issue.severity]}`}>
                      {issue.severity}
                    </span>
                    {isAdmin && (
                      <button onClick={() => setConfirmDelete(issue)}
                        className="p-1 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50 transition-colors"
                        aria-label="Delete issue">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <span className="text-gray-400 text-[11px]">
                    {new Date(issue.created_at).toLocaleTimeString('en-US', {
                      hour: 'numeric', minute: '2-digit', timeZone: timezone,
                    })}
                  </span>
                </div>
                <p className="text-gray-900 text-sm font-semibold leading-snug">{issue.title || issue.description}</p>
                <p className="mt-1 text-gray-600 text-sm leading-snug">{issue.description}</p>
                <div className="mt-3 flex items-center justify-between">
                  <div>
                    {issue.pushed_to_monday ? (
                      <span className="inline-flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1 text-[10px] text-blue-700 font-medium">
                        Flagged for follow-up
                      </span>
                    ) : (
                      <span className="text-gray-400 text-[10px]">Logged only</span>
                    )}
                  </div>
                  <button
                    onClick={() => void resolveIssue(issue)}
                    className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1 hover:bg-emerald-100 transition-colors">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Mark Resolved
                  </button>
                </div>
              </Card>
            ))}

            {/* Resolved issues */}
            {resolved.length > 0 && (
              <div>
                <p className="text-gray-400 text-[10px] font-semibold uppercase tracking-widest mb-2 mt-2">Resolved</p>
                {resolved.map(issue => (
                  <Card key={issue.id} className="p-4 opacity-60 mb-3">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${SEV_STYLE[issue.severity]}`}>
                          {issue.severity}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700">
                          <CheckCircle2 className="w-3 h-3" />
                          Resolved {new Date(issue.resolved_at!).toLocaleTimeString('en-US', {
                            hour: 'numeric', minute: '2-digit', timeZone: timezone,
                          })}
                        </span>
                      </div>
                      {isAdmin && (
                        <button onClick={() => void unresolveIssue(issue)}
                          className="text-gray-400 text-[10px] hover:text-gray-600 underline">
                          Undo
                        </button>
                      )}
                    </div>
                    <p className="text-gray-700 text-sm font-semibold leading-snug">{issue.title || issue.description}</p>
                    <p className="mt-0.5 text-gray-500 text-sm leading-snug">{issue.description}</p>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-gray-900 font-bold mb-2">Delete Issue</h3>
            <p className="text-gray-500 text-sm mb-4">Delete this issue from Sunday Ops?</p>
            <p className="text-gray-900 text-sm font-semibold mb-2">{confirmDelete.title || confirmDelete.description}</p>
            <p className="text-gray-500 text-xs bg-gray-50 rounded-xl p-3 leading-relaxed mb-4">{confirmDelete.description}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors">
                Cancel
              </button>
              <button onClick={() => deleteIssue(confirmDelete)} disabled={saving}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-60">
                {saving ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
