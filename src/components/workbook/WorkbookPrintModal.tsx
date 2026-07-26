import { useState } from 'react'
import { FileText, Loader2, Printer, RadioTower, ShoppingCart, X } from 'lucide-react'
import type { WorkbookPrintSection } from '../../lib/generateWorkbookPacketHtml'

interface WorkbookPrintModalProps {
  canIncludeIntercom: boolean
  canIncludeSupplies: boolean
  canIncludeCallSheets: boolean
  canIncludeCrewPay: boolean
  onPrint: (sections: WorkbookPrintSection[]) => Promise<void>
  onClose: () => void
}

const OPTIONS: Array<{
  id: WorkbookPrintSection
  label: string
  description: string
}> = [
  { id: 'schedule', label: 'Detail schedule', description: 'The complete chronological workbook schedule.' },
  { id: 'supplies', label: 'Supplies shopping list', description: 'Items, quantities, departments, purchase links, and estimated totals.' },
  { id: 'intercom', label: 'Intercom grids', description: 'One event-specific crew, pack, and channel grid per event.' },
  { id: 'callSheets', label: 'Crew call sheets', description: 'One printable call sheet per assigned crew member.' },
  { id: 'crewPay', label: 'Business-office pay report', description: 'Admin-only crew hours and pay totals.' },
]

export function WorkbookPrintModal({
  canIncludeIntercom,
  canIncludeSupplies,
  canIncludeCallSheets,
  canIncludeCrewPay,
  onPrint,
  onClose,
}: WorkbookPrintModalProps) {
  const [selected, setSelected] = useState<WorkbookPrintSection[]>([
    'schedule',
    ...(canIncludeSupplies ? ['supplies' as const] : []),
    ...(canIncludeIntercom ? ['intercom' as const] : []),
  ])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function available(id: WorkbookPrintSection) {
    if (id === 'intercom') return canIncludeIntercom
    if (id === 'supplies') return canIncludeSupplies
    if (id === 'callSheets') return canIncludeCallSheets
    if (id === 'crewPay') return canIncludeCrewPay
    return true
  }

  async function generate() {
    if (selected.length === 0) return
    setBusy(true)
    setError('')
    try {
      await onPrint(selected)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to build the workbook packet.')
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <p className="flex items-center gap-2 text-base font-bold text-gray-900"><Printer className="h-4 w-4 text-blue-600" /> Print workbook</p>
            <p className="mt-0.5 text-xs text-gray-500">Choose which pages to include in this PDF/print packet.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2 p-5">
          {OPTIONS.map(option => {
            const enabled = available(option.id)
            const checked = selected.includes(option.id)
            const Icon = option.id === 'intercom' ? RadioTower : option.id === 'supplies' ? ShoppingCart : FileText
            return (
              <label key={option.id} className={`flex gap-3 rounded-xl border p-3 ${
                !enabled ? 'cursor-not-allowed border-gray-100 bg-gray-50 opacity-50'
                  : checked ? 'cursor-pointer border-blue-300 bg-blue-50' : 'cursor-pointer border-gray-200 bg-white hover:border-gray-300'
              }`}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!enabled}
                  onChange={() => setSelected(current => checked ? current.filter(item => item !== option.id) : [...current, option.id])}
                  className="mt-1"
                />
                <Icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${checked ? 'text-blue-600' : 'text-gray-400'}`} />
                <span>
                  <span className="block text-sm font-semibold text-gray-900">{option.label}</span>
                  <span className="mt-0.5 block text-xs text-gray-500">
                    {enabled
                      ? option.description
                      : option.id === 'intercom'
                        ? 'Attach an event first.'
                        : option.id === 'supplies'
                          ? 'No supply items yet.'
                          : 'No matching crew data yet.'}
                  </span>
                </span>
              </label>
            )
          })}
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
          <button onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
          <button
            onClick={() => void generate()}
            disabled={busy || selected.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            {busy ? 'Building…' : 'Open print packet'}
          </button>
        </div>
      </div>
    </div>
  )
}
