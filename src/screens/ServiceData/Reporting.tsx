import { useEffect, useMemo, useState } from 'react'
import { FileDown, Loader2, Mail, Plus, Trash2 } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { useAdmin } from '../../context/adminState'
import { requestSummaryEmailAdmin } from '../../lib/adminApi'
import { useSunday } from '../../context/SundayContext'
import { fetchReportData } from '../../lib/reportData'
import { generateReportHtml } from '../../lib/generateReportHtml'
import type { ReportEmailRecipient, ReportEmailSettings } from '../../types'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const DEFAULT_SETTINGS: ReportEmailSettings = {
  key: 'default',
  enabled: true,
  send_day: 0,
  send_time: '15:00',
  timezone: 'America/Chicago',
  sender_name: 'BFC Sunday Ops',
  reply_to_email: 'production@bethanynaz.org',
}

interface SummaryEmailAdminResponse {
  settings: ReportEmailSettings
  recipients: ReportEmailRecipient[]
}

interface ReportingProps { sundayId: string }

export function Reporting({ sundayId }: ReportingProps) {
  const { isAdmin, adminPassword } = useAdmin()
  const { sundayDate } = useSunday()
  const [exporting, setExporting] = useState(false)
  const [settings, setSettings] = useState<ReportEmailSettings>(DEFAULT_SETTINGS)
  const [recipients, setRecipients] = useState<ReportEmailRecipient[]>([])
  const [loading, setLoading] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [addingRecipient, setAddingRecipient] = useState(false)
  const [notice, setNotice] = useState('')
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')

  const exportPdf = async () => {
    setExporting(true)
    try {
      const data = await fetchReportData(sundayId, sundayDate)
      const html = generateReportHtml(data)
      const win = window.open('', '_blank')
      if (!win) {
        alert('Pop-up was blocked. Please allow pop-ups for this site and try again.')
        return
      }
      win.document.write(html)
      win.document.close()
      win.focus()
      // Small delay so the browser finishes rendering before print dialog opens
      setTimeout(() => win.print(), 600)
    } catch (err) {
      console.error('PDF export failed', err)
      alert('Failed to generate report. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  const activeRecipients = useMemo(
    () => recipients.filter(recipient => recipient.active),
    [recipients]
  )

  useEffect(() => {
    if (!isAdmin || !adminPassword) return

    let active = true
    setLoading(true)

    requestSummaryEmailAdmin<SummaryEmailAdminResponse>(adminPassword, 'GET')
      .then(payload => {
        if (!active) return
        setSettings({ ...DEFAULT_SETTINGS, ...payload.settings })
        setRecipients(payload.recipients || [])
      })
      .catch(error => {
        if (!active) return
        setNotice(error instanceof Error ? error.message : 'Unable to load summary email settings.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [adminPassword, isAdmin])

  const saveSettings = async () => {
    if (!adminPassword) return

    setSavingSettings(true)
    setNotice('')

    try {
      const payload = await requestSummaryEmailAdmin<{ settings: ReportEmailSettings }>(adminPassword, 'PUT', settings)
      setSettings({ ...DEFAULT_SETTINGS, ...payload.settings })
      setNotice('Summary email settings saved.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to save summary email settings.')
    } finally {
      setSavingSettings(false)
    }
  }

  const addRecipient = async () => {
    if (!adminPassword) return
    if (!newEmail.trim()) {
      setNotice('Recipient email is required.')
      return
    }

    setAddingRecipient(true)
    setNotice('')

    try {
      const payload = await requestSummaryEmailAdmin<{ recipient: ReportEmailRecipient }>(adminPassword, 'POST', {
        name: newName,
        email: newEmail,
        sort_order: recipients.length,
      })
      setRecipients(prev => [...prev, payload.recipient])
      setNewName('')
      setNewEmail('')
      setNotice('Recipient added.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to add recipient.')
    } finally {
      setAddingRecipient(false)
    }
  }

  const updateRecipient = async (recipient: ReportEmailRecipient, updates: Partial<ReportEmailRecipient>) => {
    if (!adminPassword) return

    const nextRecipient = { ...recipient, ...updates }
    setRecipients(prev => prev.map(entry => entry.id === recipient.id ? nextRecipient : entry))

    try {
      const payload = await requestSummaryEmailAdmin<{ recipient: ReportEmailRecipient }>(adminPassword, 'PATCH', nextRecipient)
      setRecipients(prev => prev.map(entry => entry.id === recipient.id ? payload.recipient : entry))
    } catch (error) {
      setRecipients(prev => prev.map(entry => entry.id === recipient.id ? recipient : entry))
      setNotice(error instanceof Error ? error.message : 'Unable to update recipient.')
    }
  }

  const deleteRecipient = async (recipient: ReportEmailRecipient) => {
    if (!adminPassword) return

    const previous = recipients
    setRecipients(prev => prev.filter(entry => entry.id !== recipient.id))

    try {
      await requestSummaryEmailAdmin<{ ok: boolean }>(adminPassword, 'DELETE', { id: recipient.id })
      setNotice('Recipient removed.')
    } catch (error) {
      setRecipients(previous)
      setNotice(error instanceof Error ? error.message : 'Unable to remove recipient.')
    }
  }

  return (
    <div className="space-y-4 fade-in max-w-4xl">

      {/* ── Export PDF card ── */}
      <div className="rounded-xl p-5 flex items-center justify-between gap-4"
        style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #1e40af 100%)' }}>
        <div>
          <p className="text-white font-bold text-sm">Export Service Report</p>
          <p className="text-blue-200 text-xs mt-1 leading-relaxed">
            Download a formatted PDF with attendance, runtimes, issues, checklist exceptions, and all eval responses.
          </p>
        </div>
        <button
          onClick={exportPdf}
          disabled={exporting}
          className="flex items-center gap-2 bg-white text-blue-700 font-bold text-xs px-4 py-2.5 rounded-lg
            shadow-md hover:bg-blue-50 active:scale-95 transition-all disabled:opacity-60 flex-shrink-0 whitespace-nowrap">
          {exporting
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
            : <><FileDown className="w-4 h-4" /> Export PDF</>
          }
        </button>
      </div>

      <Card className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-gray-900 text-sm font-semibold flex items-center gap-2">
              <Mail className="w-4 h-4 text-blue-600" />
              Sunday Summary Email
            </p>
            <p className="text-gray-500 text-xs mt-1 leading-relaxed">
              Sends a concise Sunday afternoon report with checklist exceptions, issues, service data, and evaluation notes.
            </p>
          </div>
          <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${settings.enabled ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
            {settings.enabled ? 'Enabled' : 'Paused'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-5">
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <p className="text-gray-400 text-[10px] font-semibold uppercase tracking-widest">Schedule</p>
            <p className="text-gray-900 text-sm font-semibold mt-2">{DAYS[settings.send_day]} at {settings.send_time}</p>
            <p className="text-gray-500 text-xs mt-1">{settings.timezone}</p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <p className="text-gray-400 text-[10px] font-semibold uppercase tracking-widest">Sender</p>
            <p className="text-gray-900 text-sm font-semibold mt-2">{settings.sender_name}</p>
            <p className="text-gray-500 text-xs mt-1">Google Workspace account: `jerry@bethanynaz.org`</p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <p className="text-gray-400 text-[10px] font-semibold uppercase tracking-widest">Recipients</p>
            <p className="text-gray-900 text-sm font-semibold mt-2">{activeRecipients.length} active</p>
            <p className="text-gray-500 text-xs mt-1">Reply-to: {settings.reply_to_email || 'Not set'}</p>
          </div>
        </div>
      </Card>

      {!isAdmin ? (
        <Card className="p-5">
          <p className="text-gray-500 text-sm">An admin can manage Sunday summary email settings and recipients here.</p>
        </Card>
      ) : (
        <>
          <Card className="p-5">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <p className="text-gray-900 text-sm font-semibold">Email Settings</p>
                <p className="text-gray-400 text-xs mt-1">Choose when the report sends and where replies should go.</p>
              </div>
              {loading && <p className="text-gray-400 text-xs">Loading…</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex items-center justify-between gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                <div>
                  <p className="text-gray-900 text-sm font-medium">Enable summary email</p>
                  <p className="text-gray-400 text-[11px] mt-0.5">When disabled, the scheduled sender exits without sending.</p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.enabled}
                  onChange={event => setSettings(prev => ({ ...prev, enabled: event.target.checked }))}
                  className="h-4 w-4"
                />
              </label>

              <div>
                <label className="block text-gray-500 text-xs font-medium mb-1.5">Reply-To Email</label>
                <input
                  value={settings.reply_to_email || ''}
                  onChange={event => setSettings(prev => ({ ...prev, reply_to_email: event.target.value }))}
                  placeholder="production@bethanynaz.org"
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-gray-500 text-xs font-medium mb-1.5">Send Day</label>
                <select
                  value={settings.send_day}
                  onChange={event => setSettings(prev => ({ ...prev, send_day: parseInt(event.target.value, 10) }))}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 text-sm focus:outline-none focus:border-blue-500"
                >
                  {DAYS.map((day, index) => <option key={day} value={index}>{day}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-gray-500 text-xs font-medium mb-1.5">Send Time</label>
                <input
                  type="time"
                  value={settings.send_time}
                  onChange={event => setSettings(prev => ({ ...prev, send_time: event.target.value }))}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={saveSettings}
                disabled={savingSettings || loading}
                className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-60"
              >
                {savingSettings ? 'Saving...' : 'Save Email Settings'}
              </button>
              {notice && <p className="text-xs text-gray-500">{notice}</p>}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <p className="text-gray-900 text-sm font-semibold">Recipients</p>
                <p className="text-gray-400 text-xs mt-1">Add the people who should receive the Sunday afternoon summary.</p>
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">{activeRecipients.length} active</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[1fr_1.2fr_auto] gap-3 mb-4">
              <input
                value={newName}
                onChange={event => setNewName(event.target.value)}
                placeholder="Name (optional)"
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-blue-500"
              />
              <input
                value={newEmail}
                onChange={event => setNewEmail(event.target.value)}
                placeholder="name@bethanynaz.org"
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={addRecipient}
                disabled={addingRecipient}
                className="px-4 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-gray-800 disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                {addingRecipient ? 'Adding...' : 'Add'}
              </button>
            </div>

            <div className="space-y-3">
              {recipients.length === 0 && (
                <div className="border border-dashed border-gray-200 rounded-xl px-4 py-6 text-center">
                  <p className="text-gray-400 text-sm">No recipients configured yet.</p>
                </div>
              )}

              {recipients.map(recipient => (
                <div key={recipient.id} className="border border-gray-200 rounded-xl p-4 bg-white">
                  <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr_auto_auto] gap-3 items-center">
                    <input
                      defaultValue={recipient.name || ''}
                      onBlur={event => {
                        if ((recipient.name || '') !== event.target.value) {
                          void updateRecipient(recipient, { name: event.target.value })
                        }
                      }}
                      placeholder="Name"
                      className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-blue-500"
                    />
                    <input
                      defaultValue={recipient.email}
                      onBlur={event => {
                        if (recipient.email !== event.target.value) {
                          void updateRecipient(recipient, { email: event.target.value })
                        }
                      }}
                      placeholder="name@bethanynaz.org"
                      className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-blue-500"
                    />
                    <label className="flex items-center gap-2 text-sm text-gray-600">
                      <input
                        type="checkbox"
                        checked={recipient.active}
                        onChange={event => void updateRecipient(recipient, { active: event.target.checked })}
                        className="h-4 w-4"
                      />
                      Active
                    </label>
                    <button
                      onClick={() => void deleteRecipient(recipient)}
                      className="justify-self-start lg:justify-self-end p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      aria-label={`Delete ${recipient.email}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
