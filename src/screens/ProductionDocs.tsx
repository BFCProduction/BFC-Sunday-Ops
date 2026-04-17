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

// For stage_plot and input_list there's normally one file; show it open by default.
const AUTO_EXPAND_TYPES: DocTypeId[] = ['stage_plot', 'input_list']

// ── Helpers ───────────────────────────────────────────────────────────────────

function getViewUrl(doc: ProductionDoc): string | null {
  if (doc.storage_path) {
    const { data } = supabase.storage.from('production-docs').getPublicUrl(doc.storage_path)
    return data.publicUrl
  }
  if (doc.gdrive_file_id) {
    // Sheets htmlview embed (read-only, works for org-shared files)
    return `https://docs.google.com/spreadsheets/d/${doc.gdrive_file_id}/htmlview?rm=minimal`
  }
  return doc.gdrive_url ?? null
}

function extractSheetId(url: string): string | null {
  const m = url.match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
  return m?.[1] ?? null
}

function extractDriveFileId(url: string): string | null {
  // Handles /file/d/{id}/... and id= query params
  const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/) ?? url.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  return m?.[1] ?? null
}

// ── Add Document Modal ────────────────────────────────────────────────────────

interface AddDocModalProps {
  eventId: string
  onAdded: (doc: ProductionDoc) => void
  onClose: () => void
}

function AddDocModal({ eventId, onAdded, onClose }: AddDocModalProps) {
  const [title,    setTitle]    = useState('')
  const [docType,  setDocType]  = useState<DocTypeId>('other')
  const [mode,     setMode]     = useState<'upload' | 'link'>('upload')
  const [file,     setFile]     = useState<File | null>(null)
  const [linkUrl,  setLinkUrl]  = useState('')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')
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
        // Link mode — Google Sheets or generic Drive URL
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
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Add Document</h2>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Title</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Stage Plot, Band Input List…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Doc type */}
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

          {/* Mode toggle */}
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
  const [expanded,  setExpanded]  = useState(defaultExpanded)
  const [deleting,  setDeleting]  = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)

  const viewUrl = getViewUrl(doc)
  const isSheet = !doc.storage_path && !!doc.gdrive_file_id

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
    <div className="border border-gray-200 rounded-xl overflow-hidden">
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
          {/* Open in Drive link */}
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
          {/* Download link for storage PDFs */}
          {doc.storage_path && viewUrl && (
            <a
              href={viewUrl}
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

      {/* Inline viewer */}
      {expanded && viewUrl && (
        <div className="border-t border-gray-200">
          {isSheet ? (
            <iframe
              src={viewUrl}
              className="w-full border-0"
              style={{ height: '520px' }}
              title={doc.title}
              sandbox="allow-scripts allow-same-origin allow-popups"
            />
          ) : (
            <iframe
              src={viewUrl}
              className="w-full border-0"
              style={{ height: '620px' }}
              title={doc.title}
            />
          )}
        </div>
      )}

      {expanded && !viewUrl && (
        <div className="px-4 py-6 text-center text-sm text-gray-400 border-t border-gray-100">
          No viewable URL — <a href={doc.gdrive_url ?? '#'} className="text-blue-500 underline" target="_blank" rel="noopener noreferrer">open in Drive</a>
        </div>
      )}
    </div>
  )
}

// ── Section ───────────────────────────────────────────────────────────────────

interface SectionProps {
  typeId:   DocTypeId
  label:    string
  Icon:     React.ElementType
  docs:     ProductionDoc[]
  isAdmin:  boolean
  onDelete: (id: string) => void
}

function Section({ typeId, label, Icon, docs, isAdmin, onDelete }: SectionProps) {
  const isEmpty = docs.length === 0

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-gray-400" />
        <h3 className="text-sm font-semibold text-gray-700">{label}</h3>
        {docs.length > 0 && (
          <span className="text-[11px] text-gray-400 bg-gray-100 rounded-full px-1.5 py-0.5 font-medium">
            {docs.length}
          </span>
        )}
      </div>

      {isEmpty ? (
        <div className="border border-dashed border-gray-200 rounded-xl px-4 py-5 text-center text-sm text-gray-400">
          No {label.toLowerCase()} attached yet
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map(doc => (
            <DocCard
              key={doc.id}
              doc={doc}
              defaultExpanded={AUTO_EXPAND_TYPES.includes(typeId)}
              isAdmin={isAdmin}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export function ProductionDocs() {
  const { activeEventId, sessionDate, serviceTypeName } = useSunday()
  const { isAdmin } = useAdmin()

  const [docs,         setDocs]         = useState<ProductionDoc[]>([])
  const [loading,      setLoading]      = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)

  // ── Load ──────────────────────────────────────────────────────────────────
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

  // ── Handlers ──────────────────────────────────────────────────────────────
  function handleAdded(doc: ProductionDoc) {
    setDocs(prev => [...prev, doc])
  }

  function handleDeleted(id: string) {
    setDocs(prev => prev.filter(d => d.id !== id))
  }

  // ── Group by type ─────────────────────────────────────────────────────────
  const docsByType = Object.fromEntries(
    DOC_TYPES.map(t => [t.id, docs.filter(d => d.doc_type === t.id)])
  ) as Record<DocTypeId, ProductionDoc[]>

  const lastSynced = docs
    .filter(d => d.synced_at)
    .sort((a, b) => (b.synced_at! > a.synced_at! ? 1 : -1))[0]?.synced_at

  // ── Render ────────────────────────────────────────────────────────────────
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
    <div className="max-w-3xl mx-auto px-5 py-6 space-y-8">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Production Docs</h1>
          <p className="text-sm text-gray-500 mt-0.5">{serviceTypeName} · {dateLabel}</p>
          {lastSynced && (
            <p className="text-[11px] text-gray-400 mt-1 flex items-center gap-1">
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

      {/* Sections */}
      {DOC_TYPES.map(({ id, label, icon: Icon }) => (
        <Section
          key={id}
          typeId={id}
          label={label}
          Icon={Icon}
          docs={docsByType[id]}
          isAdmin={isAdmin}
          onDelete={handleDeleted}
        />
      ))}

      {/* Add modal */}
      {showAddModal && (
        <AddDocModal
          eventId={activeEventId}
          onAdded={handleAdded}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  )
}
