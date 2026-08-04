import { useState, type FormEvent } from 'react'
import { ExternalLink, Loader2, PackageOpen, Pencil, Plus, ShoppingCart, Trash2, X } from 'lucide-react'
import { Card } from '../ui/Card'
import { createSupplyItem, deleteSupplyItem, updateSupplyItem } from '../../lib/workbooks'
import type { Department, Workbook, WorkbookSupplyItem } from '../../types'

interface SuppliesTabProps {
  workbook: Workbook
  departments: Department[]
  supplies: WorkbookSupplyItem[]
  editable: boolean
  sessionToken: string | null
  onChanged: () => Promise<void>
}

function money(value: number) {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function quantityLabel(value: number) {
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function normalizedUrl(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  const parsed = new URL(candidate)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('Link must use http:// or https://.')
  return parsed.toString()
}

function linkLabel(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, '')
  } catch {
    return 'Open link'
  }
}

function SupplyEditor({
  workbook,
  departments,
  existing,
  sessionToken,
  onSaved,
  onClose,
}: {
  workbook: Workbook
  departments: Department[]
  existing: WorkbookSupplyItem | null
  sessionToken: string
  onSaved: () => Promise<void>
  onClose: () => void
}) {
  const [itemName, setItemName] = useState(existing?.item_name ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [quantity, setQuantity] = useState(String(existing?.quantity ?? 1))
  const [unitPrice, setUnitPrice] = useState(existing ? String(existing.unit_price) : '')
  const [purchaseUrl, setPurchaseUrl] = useState(existing?.purchase_url ?? '')
  const [departmentId, setDepartmentId] = useState(existing?.department_id ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!itemName.trim()) {
      setError('Item is required.')
      return
    }
    const parsedQuantity = Number(quantity)
    const parsedPrice = unitPrice.trim() ? Number(unitPrice) : 0
    if (!Number.isInteger(parsedQuantity) || parsedQuantity < 0) {
      setError('Quantity must be a whole number zero or greater.')
      return
    }
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      setError('Price must be zero or greater.')
      return
    }

    setSaving(true)
    setError('')
    try {
      const input = {
        workbookId: workbook.id,
        departmentId: departmentId || null,
        itemName,
        description: description || null,
        quantity: parsedQuantity,
        unitPrice: parsedPrice,
        purchaseUrl: normalizedUrl(purchaseUrl),
      }
      if (existing) await updateSupplyItem(sessionToken, existing.id, input)
      else await createSupplyItem(sessionToken, input)
      await onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save the supply item.')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
      <form onSubmit={save} className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <p className="text-base font-bold text-gray-900">{existing ? 'Edit supply item' : 'Add supply item'}</p>
            <p className="mt-0.5 text-xs text-gray-500">Add anything the event team needs to purchase.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Item</span>
            <input
              autoFocus
              value={itemName}
              onChange={event => setItemName(event.target.value)}
              placeholder="Bottled water"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </label>

          <label className="sm:col-span-2">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Description</span>
            <textarea
              value={description}
              onChange={event => setDescription(event.target.value)}
              placeholder="24-count cases, 16.9 oz bottles"
              rows={2}
              className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </label>

          <label>
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Quantity</span>
            <input
              type="number"
              min="0"
              step="1"
              value={quantity}
              onChange={event => setQuantity(event.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </label>

          <label>
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Price each</span>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-2 text-sm text-gray-400">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={unitPrice}
                onChange={event => setUnitPrice(event.target.value)}
                placeholder="0.00"
                className="w-full rounded-lg border border-gray-200 py-2 pl-7 pr-3 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
          </label>

          <label>
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Department</span>
            <select
              value={departmentId}
              onChange={event => setDepartmentId(event.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
              <option value="">No department</option>
              {departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}
            </select>
          </label>

          <label>
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Link</span>
            <input
              value={purchaseUrl}
              onChange={event => setPurchaseUrl(event.target.value)}
              placeholder="store.example.com/item"
              inputMode="url"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </label>

          {error && <p className="sm:col-span-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? 'Saving…' : existing ? 'Save changes' : 'Add item'}
          </button>
        </div>
      </form>
    </div>
  )
}

export function SuppliesTab({ workbook, departments, supplies, editable, sessionToken, onChanged }: SuppliesTabProps) {
  const [showEditor, setShowEditor] = useState(false)
  const [editing, setEditing] = useState<WorkbookSupplyItem | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [error, setError] = useState('')
  const departmentById = new Map(departments.map(department => [department.id, department.name]))
  const estimatedTotal = supplies.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)

  async function remove(id: string) {
    if (!editable) return
    setError('')
    try {
      if (!sessionToken) throw new Error('Admin session required')
      await deleteSupplyItem(sessionToken, id)
      setConfirmDelete(null)
      await onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete the supply item.')
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-bold text-gray-900">
              <ShoppingCart className="h-4 w-4 text-blue-600" /> Supplies
            </p>
            <p className="mt-1 text-xs text-gray-500">A workbook-wide shopping list for consumables, décor, and anything else the event needs.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600">
              {supplies.length} item{supplies.length === 1 ? '' : 's'}
            </span>
            {editable && (
              <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
                Estimated total {money(estimatedTotal)}
              </span>
            )}
            {editable && <button
              onClick={() => { setEditing(null); setShowEditor(true) }}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700">
              <Plus className="h-4 w-4" /> Add item
            </button>}
          </div>
        </div>
      </Card>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {supplies.length === 0 ? (
        <Card className="p-10 text-center">
          <PackageOpen className="mx-auto h-7 w-7 text-gray-300" />
          <p className="mt-3 text-sm font-semibold text-gray-700">The shopping list is empty</p>
          <p className="mt-1 text-xs text-gray-400">
            {editable ? 'Add water, coffee, candles, flowers, or anything else this workbook needs.' : 'No supply items have been added yet.'}
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className={`w-full table-fixed text-sm ${editable ? 'min-w-[1100px]' : 'min-w-[820px]'}`}>
              <colgroup>
                <col className="w-12" />
                <col className="w-64" />
                <col />
                <col className="w-24" />
                {editable && <col className="w-28" />}
                <col className="w-36" />
                <col className="w-36" />
                {editable && <col className="w-28" />}
                {editable && <col className="w-24" />}
              </colgroup>
              <thead>
                <tr className="border-b border-gray-200 bg-gray-100 text-left text-[11px] font-bold uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-3 text-center">#</th>
                  <th className="px-3 py-3">Item</th>
                  <th className="px-3 py-3">Description</th>
                  <th className="px-3 py-3 text-right">Qty</th>
                  {editable && <th className="px-3 py-3 text-right">Price</th>}
                  <th className="px-3 py-3">Department</th>
                  <th className="px-3 py-3">Link</th>
                  {editable && <th className="px-3 py-3 text-right">Total</th>}
                  {editable && <th className="px-3 py-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {supplies.map((item, index) => (
                  <tr key={item.id} className="border-b border-gray-100 last:border-0 hover:bg-blue-50/30">
                    <td className="px-3 py-3 text-center text-xs text-gray-400">{index + 1}</td>
                    <td className="px-3 py-3 font-semibold text-gray-900">{item.item_name}</td>
                    <td className="px-3 py-3 text-xs leading-relaxed text-gray-600">{item.description || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-3 text-right text-gray-700">{quantityLabel(item.quantity)}</td>
                    {editable && <td className="px-3 py-3 text-right text-gray-700">{money(item.unit_price)}</td>}
                    <td className="px-3 py-3 text-xs text-gray-600">
                      {item.department_id ? departmentById.get(item.department_id) ?? 'Unknown' : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-3">
                      {item.purchase_url ? (
                        <a
                          href={item.purchase_url}
                          target="_blank"
                          rel="noreferrer"
                          title={item.purchase_url}
                          className="inline-flex max-w-full items-center gap-1 truncate text-xs font-semibold text-blue-600 hover:text-blue-800">
                          <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" /> {linkLabel(item.purchase_url)}
                        </a>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    {editable && <td className="px-3 py-3 text-right font-semibold text-gray-900">{money(item.quantity * item.unit_price)}</td>}
                    {editable && <td className="px-3 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => { setEditing(item); setShowEditor(true) }}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600"
                          aria-label={`Edit ${item.item_name}`}>
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        {confirmDelete === item.id ? (
                          <button onClick={() => void remove(item.id)} className="rounded-lg bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700">Sure?</button>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(item.id)}
                            className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                            aria-label={`Delete ${item.item_name}`}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>}
                  </tr>
                ))}
              </tbody>
              {editable && <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50 font-bold text-gray-900">
                  <td className="px-3 py-3" colSpan={7}>Estimated total</td>
                  <td className="px-3 py-3 text-right">{money(estimatedTotal)}</td>
                  <td />
                </tr>
              </tfoot>}
            </table>
          </div>
        </Card>
      )}

      {editable && sessionToken && showEditor && (
        <SupplyEditor
          workbook={workbook}
          departments={departments}
          existing={editing}
          sessionToken={sessionToken}
          onSaved={onChanged}
          onClose={() => { setShowEditor(false); setEditing(null) }}
        />
      )}
    </div>
  )
}
