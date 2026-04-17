import { useState, useEffect, useRef } from 'react'
import {
  FileText, Music, LayoutList, Paperclip, Plus, Trash2,
  ChevronDown, ChevronUp, ExternalLink, RefreshCw, X, Upload, Link2,
} from 'lucide-react'
import { useSunday } from '../context/SundayContext'
import { useAdmin } from '../context/adminState'
import { supabase } from '../lib/supabase'
import type { ProductionDoc } from '../types'

// ── Constants ─────────────────────────────────────────────────────────────────

const DOC_TYPES = [
  { id: 'stage_plot',  label: 'Stage Plot',  icon: Music       },
  { id: 'input_list',  label: 'Input List',  icon: LayoutList  },
  { id: 'run_sheet',   label: 'Run Sheets',  icon: FileText    },
  { id: 'other',       label: 'Other',       icon: Paperclip   },
] as const

type DocTypeId = typeof DOC_TYPES[number]['id']

// ── Helpers ───────────────────────────────────────────────────────────────────

function useIsMobileViewport() {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 767px)').matches)

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)')
    const update = () => setIsMobile(media.matches)

    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  return isMobile
}

function useMobileViewerViewportLock() {
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)')
    if (!media.matches) return

    const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
    if (!viewport) return

    const previousContent = viewport.getAttribute('content')
    const preventAppZoom = (event: Event) => event.preventDefault()

    viewport.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
    document.addEventListener('gesturestart', preventAppZoom, { passive: false })
    document.addEventListener('gesturechange', preventAppZoom, { passive: false })

    return () => {
      document.removeEventListener('gesturestart', preventAppZoom)
      document.removeEventListener('gesturechange', preventAppZoom)
      if (previousContent === null) {
        viewport.removeAttribute('content')
      } else {
        viewport.setAttribute('content', previousContent)
      }
    }
  }, [])
}

function getViewUrl(doc: ProductionDoc): string | null {
  if (doc.storage_path) {
    const { data } = supabase.storage.from('production-docs').getPublicUrl(doc.storage_path)
    return data.publicUrl
  }
  if (doc.gdrive_file_id) {
    return `https://docs.google.com/spreadsheets/d/${doc.gdrive_file_id}/htmlview?rm=minimal`
  }
  return doc.gdrive_url ?? null
}

function extractSheetId(url: string): string | null {
  const m = url.match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
  return m?.[1] ?? null
}

function extractDriveFileId(url: string): string | null {
  const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/) ?? url.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  return m?.[1] ?? null
}

// ── Add Document Modal ────────────────────────────────────────────────────────

interface AddDocModalProps {
  eventId: string
  defaultDocType: DocTypeId
  onAdded: (doc: ProductionDoc) => void
  onClose: () => void
}

function AddDocModal({ eventId, defaultDocType, onAdded, onClose }: AddDocModalProps) {
  const [title,   setTitle]   = useState('')
  const [docType, setDocType] = useState<DocTypeId>(defaultDocType)
  const [mode,    setMode]    = useState<'upload' | 'link'>('upload')
  const [file,    setFile]    = useState<File | null>(null)
  const [linkUrl, setLinkUrl] = useState('')
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('Title is required'); return }
    setError(''); setSaving(true)

    try {
      if (mode === 'upload') {
        if (!file) { setError('Choose a file to upload'); setSaving(false); return }

        const ext  = file.name.split('.').pop() ?? 'pdf'
        const path = `${eventId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

        const { error: uploadErr } = await supabase.storage
          .from('production-docs')
          .upload(path, file, { contentType: file.type, upsert: false })
        if (uploadErr) throw uploadErr

        const { data, error: insertErr } = await supabase
          .from('production_docs')
          .insert({ event_id: eventId, doc_type: docType, title: title.trim(), storage_path: path, source: 'manual' })
          .select()
          .single()
        if (insertErr) throw insertErr
        onAdded(data as ProductionDoc)

      } else {
        if (!linkUrl.trim()) { setError('Paste a Google Drive or Sheets URL'); setSaving(false); return }

        const sheetId = extractSheetId(linkUrl)
        const fileId  = sheetId ?? extractDriveFileId(linkUrl)

        const { data, error: insertErr } = await supabase
          .from('production_docs')
          .insert({
            event_id:       eventId,
            doc_type:       docType,
            title:          title.trim(),
            gdrive_file_id: fileId,
            gdrive_url:     linkUrl.trim(),
            source:         'manual',
          })
          .select()
          .single()
        if (insertErr) throw insertErr
        onAdded(data as ProductionDoc)
      }

      onClose()
    } catch (err) {
      setError((err as Error).message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Add Document</h2>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Title</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Stage Plot, Band Input List…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Type</label>
            <select
              value={docType}
              onChange={e => setDocType(e.target.value as DocTypeId)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {DOC_TYPES.map(t => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
            <button
              type="button"
              onClick={() => setMode('upload')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 transition-colors ${
                mode === 'upload' ? 'bg-blue-600 text-white font-medium' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              <Upload className="w-3.5 h-3.5" /> Upload PDF
            </button>
            <button
              type="button"
              onClick={() => setMode('link')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 transition-colors ${
                mode === 'link' ? 'bg-blue-600 text-white font-medium' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              <Link2 className="w-3.5 h-3.5" /> Drive / Sheets URL
            </button>
          </div>

          {mode === 'upload' ? (
            <div>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,application/pdf"
                onChange={e => setFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-200 rounded-lg px-3 py-4 text-sm text-gray-500 hover:border-blue-300 hover:text-blue-600 transition-colors text-center"
              >
                {file ? file.name : 'Click to choose a PDF'}
              </button>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Google Drive or Sheets URL</label>
              <input
                value={linkUrl}
                onChange={e => setLinkUrl(e.target.value)}
                placeholder="https://docs.google.com/…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                For Sheets: the file must be shared so it's viewable in the app. PDFs will open in Drive.
              </p>
            </div>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Add Document'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Doc Card ──────────────────────────────────────────────────────────────────

interface DocCardProps {
  doc: ProductionDoc
  defaultExpanded?: boolean
  isAdmin: boolean
  onDelete: (id: string) => void
}

function DocCard({ doc, defaultExpanded = false, isAdmin, onDelete }: DocCardProps) {
  const [expanded,   setExpanded]   = useState(defaultExpanded)
  const [deleting,   setDeleting]   = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const isMobile = useIsMobileViewport()

  const viewUrl = getViewUrl(doc)
  const isSheet = !doc.storage_path && !!doc.gdrive_file_id

  // On mobile, route storage PDFs through Google Docs Viewer (renders as HTML,
  // supports pinch-to-zoom). Desktop uses the native browser PDF viewer.
  const iframeSrc = (() => {
    if (!viewUrl) return null
    if (doc.storage_path && isMobile) {
      return `https://docs.google.com/viewer?url=${encodeURIComponent(viewUrl)}&embedded=true`
    }
    if (doc.storage_path) return `${viewUrl}#toolbar=1&zoom=page-fit`
    return viewUrl
  })()
  const storageOpenUrl = doc.storage_path && viewUrl
    ? (isMobile && iframeSrc ? iframeSrc : viewUrl)
    : null

  async function handleDelete() {
    setDeleting(true)
    try {
      if (doc.storage_path) {
        await supabase.storage.from('production-docs').remove([doc.storage_path])
      }
      await supabase.from('production_docs').delete().eq('id', doc.id)
      onDelete(doc.id)
    } catch {
      setDeleting(false)
    }
  }

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden mb-3">
      {/* Card header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-50">
        <button
          onClick={() => setExpanded(v => !v)}
          className="flex-1 flex items-center gap-2 text-left min-w-0"
        >
          {expanded
            ? <ChevronUp   className="w-4 h-4 text-gray-400 flex-shrink-0" />
            : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
          }
          <span className="text-sm font-medium text-gray-900 truncate">{doc.title}</span>
          {doc.source === 'drive_sync' && (
            <span className="flex-shrink-0 text-[10px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full">
              synced
            </span>
          )}
        </button>

        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Open in Drive */}
          {doc.gdrive_url && (
            <a
              href={doc.gdrive_url}
              target="_blank"
              rel="noopener noreferrer"
              title="Open in Google Drive"
              className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          {/* Open storage PDF */}
          {storageOpenUrl && (
            <a
              href={storageOpenUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Open PDF"
              className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          {/* Delete */}
          {isAdmin && (
            confirmDel ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-[11px] font-semibold text-red-600 hover:text-red-700 px-1.5 py-0.5 rounded transition-colors"
                >
                  {deleting ? '…' : 'Delete'}
                </button>
                <button
                  onClick={() => setConfirmDel(false)}
                  className="text-[11px] text-gray-400 hover:text-gray-600 px-1.5 py-0.5 rounded transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDel(true)}
                title="Remove document"
                className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )
          )}
        </div>
      </div>

      {/* Viewer */}
      {expanded && viewUrl && (
        <div
          className="border-t border-gray-200"
          style={{ overscrollBehavior: 'contain', touchAction: doc.storage_path && isMobile ? 'pan-x pan-y' : undefined }}
        >
          <iframe
            src={iframeSrc ?? undefined}
            className="w-full border-0 block"
            style={{ height: 'calc(100vh - 190px)', overscrollBehavior: 'contain' }}
            title={doc.title}
            sandbox={isSheet ? 'allow-scripts allow-same-origin allow-popups' : undefined}
          />
        </div>
      )}

      {expanded && !viewUrl && (
        <div className="px-4 py-6 text-center text-sm text-gray-400 border-t border-gray-100">
          No viewable URL —{' '}
          <a href={doc.gdrive_url ?? '#'} className="text-blue-500 underline" target="_blank" rel="noopener noreferrer">
            open in Drive
          </a>
        </div>
      )}
    </div>
  )
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export function ProductionDocs() {
  const { activeEventId, sessionDate, serviceTypeName } = useSunday()
  const { isAdmin } = useAdmin()
  useMobileViewerViewportLock()

  const [docs,         setDocs]         = useState<ProductionDoc[]>([])
  const [loading,      setLoading]      = useState(true)
  const [activeTab,    setActiveTab]    = useState<DocTypeId>('stage_plot')
  const [showAddModal, setShowAddModal] = useState(false)

  useEffect(() => {
    if (!activeEventId) return
    setLoading(true)
    supabase
      .from('production_docs')
      .select('*')
      .eq('event_id', activeEventId)
      .order('uploaded_at', { ascending: true })
      .then(({ data }) => {
        setDocs((data ?? []) as ProductionDoc[])
        setLoading(false)
      })
  }, [activeEventId])

  function handleAdded(doc: ProductionDoc) {
    setDocs(prev => [...prev, doc])
    setActiveTab(doc.doc_type as DocTypeId)
  }

  function handleDeleted(id: string) {
    setDocs(prev => prev.filter(d => d.id !== id))
  }

  const docsByType = Object.fromEntries(
    DOC_TYPES.map(t => [t.id, docs.filter(d => d.doc_type === t.id)])
  ) as Record<DocTypeId, ProductionDoc[]>

  const activeDocs = docsByType[activeTab] ?? []

  const lastSynced = docs
    .filter(d => d.synced_at)
    .sort((a, b) => (b.synced_at! > a.synced_at! ? 1 : -1))[0]?.synced_at

  const dateLabel = sessionDate
    ? new Date(sessionDate + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      })
    : '—'

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="fade-in">
      {/* Sticky header + tab bar — matches ServiceData pattern */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 px-5 pt-4 pb-3">
        <div className="flex items-start justify-between gap-4 mb-2.5">
          <div>
            <h2 className="text-gray-900 font-bold text-lg">Production Docs</h2>
            <p className="text-sm text-gray-500">{serviceTypeName} · {dateLabel}</p>
            {lastSynced && (
              <p className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1">
                <RefreshCw className="w-3 h-3" />
                Last synced {new Date(lastSynced).toLocaleString('en-US', {
                  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                })}
              </p>
            )}
          </div>
          {isAdmin && (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors flex-shrink-0"
            >
              <Plus className="w-4 h-4" />
              Add Document
            </button>
          )}
        </div>

        {/* Horizontal doc-type tabs */}
        <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5 w-fit">
          {DOC_TYPES.map(t => {
            const count = docsByType[t.id].length
            const isActive = activeTab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${
                  isActive ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label}
                {count > 0 && (
                  <span className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none ${
                    isActive ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-500'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Doc list for active tab */}
      <div className="p-5">
        {activeDocs.length === 0 ? (
          <div className="border border-dashed border-gray-200 rounded-xl px-4 py-10 text-center">
            <p className="text-sm text-gray-400">
              No {DOC_TYPES.find(t => t.id === activeTab)?.label.toLowerCase()} attached yet
            </p>
            <p className="text-[11px] text-gray-300 mt-1">
              Drive sync runs hourly · admins can add files manually above
            </p>
          </div>
        ) : (
          activeDocs.map((doc, i) => (
            <DocCard
              key={doc.id}
              doc={doc}
              defaultExpanded={i === 0}
              isAdmin={isAdmin}
              onDelete={handleDeleted}
            />
          ))
        )}
      </div>

      {showAddModal && (
        <AddDocModal
          eventId={activeEventId}
          defaultDocType={activeTab}
          onAdded={handleAdded}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  )
}
