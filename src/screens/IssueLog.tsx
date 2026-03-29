import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, ImagePlus, Plus, Trash2, X, ZoomIn } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Card } from '../components/ui/Card'
import { useAdmin } from '../context/adminState'
import { useSunday } from '../context/SundayContext'
import type { Issue, IssuePhoto } from '../types'

interface IssueLogProps {
  sundayId: string
}

const MONDAY_PUSH_ENABLED = import.meta.env.VITE_ENABLE_MONDAY_PUSH === 'true'
const STORAGE_BUCKET = 'issue-photos'

const SEV_STYLE: Record<string, string> = {
  Low:      'bg-emerald-50 text-emerald-700 border-emerald-200',
  Medium:   'bg-amber-50 text-amber-700 border-amber-200',
  High:     'bg-red-50 text-red-700 border-red-200',
  Critical: 'bg-red-100 text-red-800 border-red-300',
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function uploadPhotos(issueId: string, files: File[]): Promise<string | null> {
  for (const file of files) {
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `${issueId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false })
    if (uploadError) {
      console.error('Photo upload failed:', uploadError.message)
      return uploadError.message
    }
    const { error: insertError } = await supabase.from('issue_photos').insert({
      issue_id: issueId,
      storage_path: path,
      filename: file.name,
    })
    if (insertError) {
      console.error('Photo record failed:', insertError.message)
      return insertError.message
    }
  }
  return null
}

function getPublicUrl(storagePath: string): string {
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath)
  return data.publicUrl
}

// ─── Photo strip ────────────────────────────────────────────────────────────

interface PhotoStripProps {
  photos: IssuePhoto[]
  onDelete?: (photo: IssuePhoto) => void
  onOpen: (url: string) => void
}

function PhotoStrip({ photos, onDelete, onOpen }: PhotoStripProps) {
  if (photos.length === 0) return null
  return (
    <div className="flex gap-2 flex-wrap mt-3">
      {photos.map(photo => {
        const url = getPublicUrl(photo.storage_path)
        return (
          <div key={photo.id} className="relative group">
            <button
              onClick={() => onOpen(url)}
              className="block w-16 h-16 rounded-lg overflow-hidden border border-gray-200 hover:border-blue-400 transition-colors focus:outline-none"
              aria-label={`View ${photo.filename}`}
            >
              <img
                src={url}
                alt={photo.filename}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                <ZoomIn className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </button>
            {onDelete && (
              <button
                onClick={() => onDelete(photo)}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700"
                aria-label="Delete photo"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Lightbox ───────────────────────────────────────────────────────────────

function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white/70 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors"
        aria-label="Close"
      >
        <X className="w-6 h-6" />
      </button>
      <img
        src={url}
        alt="Issue photo"
        className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
        onClick={e => e.stopPropagation()}
      />
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export function IssueLog({ sundayId }: IssueLogProps) {
  const { isAdmin } = useAdmin()
  const { timezone } = useSunday()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [issues, setIssues] = useState<Issue[]>([])
  const [photos, setPhotos] = useState<Record<string, IssuePhoto[]>>({})
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [severity, setSeverity] = useState<Issue['severity']>('Medium')
  const [createTask, setCreateTask] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [pendingPreviews, setPendingPreviews] = useState<string[]>([])
  const [confirmDelete, setConfirmDelete] = useState<Issue | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  // ── Load issues ──────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.from('issues').select('*').eq('sunday_id', sundayId)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setIssues((data || []) as Issue[]); setLoading(false) })
  }, [sundayId])

  // ── Load photos for all issues ───────────────────────────────────────────
  useEffect(() => {
    if (issues.length === 0) return
    const ids = issues.map(i => i.id)
    supabase.from('issue_photos')
      .select('*')
      .in('issue_id', ids)
      .order('uploaded_at', { ascending: true })
      .then(({ data }) => {
        if (!data) return
        const map: Record<string, IssuePhoto[]> = {}
        ;(data as IssuePhoto[]).forEach(p => {
          if (!map[p.issue_id]) map[p.issue_id] = []
          map[p.issue_id].push(p)
        })
        setPhotos(map)
      })
  }, [issues])

  // ── Form helpers ──────────────────────────────────────────────────────────
  const resetForm = () => {
    setTitle('')
    setDesc('')
    setSeverity('Medium')
    setCreateTask(false)
    setPendingFiles([])
    setPendingPreviews([])
    setShowForm(false)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = Array.from(e.target.files ?? []).filter(f => f.type.startsWith('image/'))
    if (chosen.length === 0) return
    setPendingFiles(prev => [...prev, ...chosen])
    chosen.forEach(file => {
      const reader = new FileReader()
      reader.onload = ev => {
        setPendingPreviews(prev => [...prev, ev.target!.result as string])
      }
      reader.readAsDataURL(file)
    })
    // Reset input so same file can be re-added if needed
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removePending = (index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index))
    setPendingPreviews(prev => prev.filter((_, i) => i !== index))
  }

  // ── Submit ────────────────────────────────────────────────────────────────
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

    // Upload photos if any
    const filesToUpload = [...pendingFiles]
    resetForm()

    let photoUrls: string[] = []
    if (filesToUpload.length > 0 && data) {
      const uploadErr = await uploadPhotos(data.id, filesToUpload)
      if (uploadErr) {
        setNotice(`Issue saved, but photo upload failed: ${uploadErr}. Check that the 'issue-photos' storage bucket is public.`)
      }
      // Reload photos for this issue
      const { data: newPhotos } = await supabase
        .from('issue_photos')
        .select('*')
        .eq('issue_id', data.id)
        .order('uploaded_at', { ascending: true })
      if (newPhotos) {
        setPhotos(prev => ({ ...prev, [data.id]: newPhotos as IssuePhoto[] }))
        photoUrls = (newPhotos as IssuePhoto[]).map(p => getPublicUrl(p.storage_path))
      }
    }

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
            photo_urls: photoUrls,
          }),
        })

        const result = await response.json().catch(() => ({}))
        const mondayItemId = typeof result?.itemId === 'string' ? result.itemId : null

        // Belt-and-suspenders: edge function also updates pushed_to_monday server-side.
        const { error: markError } = await supabase.from('issues').update({
          pushed_to_monday: true,
          monday_item_id: mondayItemId,
        }).eq('id', data.id)

        if (markError) {
          console.error('Failed to update pushed_to_monday in DB:', markError.message)
        }

        // Re-fetch the issue so state reflects whatever the DB actually has.
        // Handles cases where only one of the two DB updates (edge fn vs. frontend)
        // succeeded, and avoids "Logged only" showing after navigating away and back.
        const { data: refreshed } = await supabase
          .from('issues')
          .select('*')
          .eq('id', data.id)
          .single()

        setIssues(prev => prev.map(entry =>
          entry.id === data.id
            ? refreshed ? (refreshed as Issue) : { ...entry, pushed_to_monday: true, monday_item_id: mondayItemId }
            : entry
        ))
      } catch (err) {
        // Only fires on network-level failure (can't reach the edge function at all)
        console.error(err)
        setNotice('Issue saved. Monday follow-up could not be created — check your connection.')
      }
    }

    setSaving(false)
  }

  // ── Resolve / unresolve ───────────────────────────────────────────────────
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

  // ── Delete issue ──────────────────────────────────────────────────────────
  const deleteIssue = async (issue: Issue) => {
    setSaving(true)
    // Delete storage objects for this issue's photos
    const issuePhotos = photos[issue.id] ?? []
    if (issuePhotos.length > 0) {
      await supabase.storage
        .from(STORAGE_BUCKET)
        .remove(issuePhotos.map(p => p.storage_path))
    }
    const { error } = await supabase.from('issues').delete().eq('id', issue.id)
    setSaving(false)
    if (error) { setNotice(error.message); return }
    setIssues(prev => prev.filter(e => e.id !== issue.id))
    setPhotos(prev => { const next = { ...prev }; delete next[issue.id]; return next })
    setConfirmDelete(null)
    setNotice('Issue deleted.')
  }

  // ── Delete single photo ───────────────────────────────────────────────────
  const deletePhoto = async (photo: IssuePhoto) => {
    await supabase.storage.from(STORAGE_BUCKET).remove([photo.storage_path])
    await supabase.from('issue_photos').delete().eq('id', photo.id)
    setPhotos(prev => ({
      ...prev,
      [photo.issue_id]: (prev[photo.issue_id] ?? []).filter(p => p.id !== photo.id),
    }))
  }

  // ─────────────────────────────────────────────────────────────────────────

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

              {/* Photo attachment */}
              <div>
                <p className="text-gray-500 text-xs font-medium mb-2">Photos <span className="text-gray-400 font-normal">(optional)</span></p>
                {pendingPreviews.length > 0 && (
                  <div className="flex gap-2 flex-wrap mb-2">
                    {pendingPreviews.map((src, i) => (
                      <div key={i} className="relative group">
                        <img src={src} alt="" className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
                        <button
                          onClick={() => removePending(i)}
                          className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          aria-label="Remove photo"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 border-dashed rounded-xl text-gray-500 text-xs font-medium hover:bg-gray-100 hover:border-gray-300 transition-colors w-full justify-center"
                >
                  <ImagePlus className="w-4 h-4" />
                  Add Photos
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>

              {/* Monday follow-up checkbox */}
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

                <PhotoStrip
                  photos={photos[issue.id] ?? []}
                  onDelete={isAdmin ? deletePhoto : undefined}
                  onOpen={setLightboxUrl}
                />

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

                    <PhotoStrip
                      photos={photos[issue.id] ?? []}
                      onDelete={isAdmin ? deletePhoto : undefined}
                      onOpen={setLightboxUrl}
                    />
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
            {(photos[confirmDelete.id]?.length ?? 0) > 0 && (
              <p className="text-amber-600 text-xs bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-4">
                {photos[confirmDelete.id].length} attached photo{photos[confirmDelete.id].length > 1 ? 's' : ''} will also be deleted.
              </p>
            )}
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

      {/* Lightbox */}
      {lightboxUrl && (
        <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      )}
    </div>
  )
}
