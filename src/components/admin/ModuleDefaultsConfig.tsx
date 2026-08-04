import { useEffect, useMemo, useState } from 'react'
import { FolderOpen, Loader2, RefreshCw, Save } from 'lucide-react'
import { Card } from '../ui/Card'
import {
  fetchModuleConfiguration,
  saveModuleFolderDefaults,
  syncModulePcoFolders,
  type ModuleConfiguration,
} from '../../lib/modules'
import type { ModuleKey } from '../../types'

export function ModuleDefaultsConfig({ sessionToken }: { sessionToken: string }) {
  const [configuration, setConfiguration] = useState<ModuleConfiguration | null>(null)
  const [selection, setSelection] = useState<Record<string, ModuleKey[]>>({})
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [savingFolderId, setSavingFolderId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  async function load() {
    const next = await fetchModuleConfiguration(sessionToken)
    setConfiguration(next)
    setSelection(Object.fromEntries(next.folders.map(folder => [
      folder.pco_folder_id,
      next.defaults
        .filter(item => item.pco_folder_id === folder.pco_folder_id)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(item => item.module_key),
    ])))
    return next
  }

  useEffect(() => {
    let active = true
    setLoading(true)
    fetchModuleConfiguration(sessionToken)
      .then(async initial => {
        if (!active) return
        if (initial.folders.length === 0) {
          await syncModulePcoFolders(sessionToken)
          if (!active) return
          await load()
          return
        }
        setConfiguration(initial)
        setSelection(Object.fromEntries(initial.folders.map(folder => [
          folder.pco_folder_id,
          initial.defaults
            .filter(item => item.pco_folder_id === folder.pco_folder_id)
            .sort((a, b) => a.sort_order - b.sort_order)
            .map(item => item.module_key),
        ])))
      })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : 'Unable to load module defaults.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  // The session token is stable for the signed-in session.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionToken])

  const visibleFolders = useMemo(() => {
    if (!configuration) return []
    const folderIdsWithServiceTypes = new Set(
      configuration.service_types.map(serviceType => serviceType.pco_folder_id).filter(Boolean),
    )
    const folderIdsWithDefaults = new Set(configuration.defaults.map(item => item.pco_folder_id))
    return configuration.folders.filter(folder =>
      folderIdsWithServiceTypes.has(folder.pco_folder_id) || folderIdsWithDefaults.has(folder.pco_folder_id),
    )
  }, [configuration])

  async function syncFolders() {
    setSyncing(true); setError(''); setNotice('')
    try {
      const result = await syncModulePcoFolders(sessionToken)
      await load()
      setNotice(`Synced ${result.folders} PCO folders and linked ${result.linked_service_types} service types.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sync Planning Center folders.')
    } finally {
      setSyncing(false)
    }
  }

  function toggle(folderId: string, moduleKey: ModuleKey) {
    setSelection(current => {
      const selected = current[folderId] ?? []
      return {
        ...current,
        [folderId]: selected.includes(moduleKey)
          ? selected.filter(key => key !== moduleKey)
          : [...selected, moduleKey],
      }
    })
  }

  async function save(folderId: string) {
    setSavingFolderId(folderId); setError(''); setNotice('')
    try {
      const ordered = (configuration?.definitions ?? [])
        .filter(definition => (selection[folderId] ?? []).includes(definition.key))
        .map(definition => definition.key)
      await saveModuleFolderDefaults(sessionToken, folderId, ordered)
      await load()
      setNotice('Default modules saved. They will be added to newly created events in this folder.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save module defaults.')
    } finally {
      setSavingFolderId(null)
    }
  }

  return (
    <Card className="mb-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <FolderOpen className="h-4 w-4 text-blue-600" /> Default Event Modules
          </p>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-gray-400">
            Choose the modules automatically added when an event is created from a Planning Center service type in each folder.
            Existing events remain unchanged until a Manager explicitly applies their folder defaults.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void syncFolders()}
          disabled={syncing || loading}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Sync PCO folders
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading folder defaults…
        </div>
      ) : visibleFolders.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-gray-200 px-4 py-5 text-center text-xs text-gray-400">
          No Planning Center folders are linked to Sunday Ops service types yet. Sync folders to load them.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {visibleFolders.map(folder => {
            const serviceTypes = configuration?.service_types.filter(serviceType => serviceType.pco_folder_id === folder.pco_folder_id) ?? []
            const selected = selection[folder.pco_folder_id] ?? []
            const saving = savingFolderId === folder.pco_folder_id
            return (
              <div key={folder.pco_folder_id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{folder.name}</p>
                    {serviceTypes.length > 0 && (
                      <p className="mt-0.5 text-[11px] text-gray-400">
                        {serviceTypes.map(serviceType => serviceType.name).join(' · ')}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => void save(folder.pco_folder_id)}
                    disabled={saving || syncing}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Save
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(configuration?.definitions ?? []).map(definition => {
                    const checked = selected.includes(definition.key)
                    return (
                      <label
                        key={definition.key}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                          checked
                            ? 'border-blue-200 bg-blue-50 text-blue-700'
                            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(folder.pco_folder_id, definition.key)}
                          className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600"
                        />
                        {definition.label}
                      </label>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {notice && <p className="mt-3 text-xs text-emerald-700">{notice}</p>}
      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
    </Card>
  )
}
