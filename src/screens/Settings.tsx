import { useEffect, useMemo, useState } from 'react'
import { FileDown, Globe, Loader2, Mail, Plus, Settings as SettingsIcon, Trash2, Users } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { useAdmin } from '../context/adminState'
import { fetchAppUsers, setUserAdmin, requestSummaryEmailAdmin, type AppUser } from '../lib/adminApi'
import { useSunday } from '../context/SundayContext'
import { fetchEventReportData } from '../lib/reportData'
import { generateReportHtml } from '../lib/generateReportHtml'
import { loadAllSessions, supabase } from '../lib/supabase'
import type { ReportEmailRecipient, ReportEmailSettings, Session } from '../types'
import bfcLogo from '../assets/BFC_Production_Logo_Hor reverse.png'


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

async function getLogoBase64(): Promise<string> {
  try {
    const blob = await fetch(bfcLogo).then(r => r.blob())
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch {
    return ''
  }
}

async function openPdf(eventId: string) {
  const [data, logoBase64] = await Promise.all([
    fetchEventReportData(eventId),
    getLogoBase64(),
  ])
  const html = generateReportHtml(data, logoBase64)
  const win = window.open('', '_blank')
  if (!win) {
    alert('Pop-up was blocked. Please allow pop-ups for this site and try again.')
    return
  }
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), 600)
}

export function Settings() {
  const { isAdmin, sessionToken, user } = useAdmin()
  const { activeEventId, timezone } = useSunday()

  // ── Timezone state ──
  const [churchTimezone, setChurchTimezone] = useState(timezone)
  const [savingTz, setSavingTz]             = useState(false)
  const [tzNotice, setTzNotice]             = useState('')

  // ── PDF Export state ──
  const [exportingReport, setExportingReport]       = useState(false)
  const [reportEvents, setReportEvents]             = useState<Session[]>([])
  const [selectedReportEventId, setSelectedReportEventId] = useState('')
  const [loadingReportEvents, setLoadingReportEvents] = useState(false)
  const [reportEventsError, setReportEventsError]   = useState('')

  // ── People & Access state ──
  const [appUsers,      setAppUsers]      = useState<AppUser[]>([])
  const [loadingUsers,  setLoadingUsers]  = useState(false)
  const [usersError,    setUsersError]    = useState('')
  const [togglingUser,  setTogglingUser]  = useState<string | null>(null)

  // ── Email settings state ──
  const [settings, setSettings]           = useState<ReportEmailSettings>(DEFAULT_SETTINGS)
  const [recipients, setRecipients]       = useState<ReportEmailRecipient[]>([])
  const [loadingEmail, setLoadingEmail]   = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [addingRecipient, setAddingRecipient] = useState(false)
  const [notice, setNotice]               = useState('')
  const [newName, setNewName]             = useState('')
  const [newEmail, setNewEmail]           = useState('')

  // Load all events for report export
  useEffect(() => {
    let active = true

    setLoadingReportEvents(true)
    setReportEventsError('')

    loadAllSessions()
      .then(events => {
        if (!active) return
        const sorted = [...events].sort((a, b) => {
          if (a.date !== b.date) return b.date.localeCompare(a.date)
          return (b.eventTime || '').localeCompare(a.eventTime || '')
        })
        setReportEvents(sorted)
        setSelectedReportEventId(prev => {
          if (prev && sorted.some(event => event.id === prev)) return prev
          if (activeEventId && sorted.some(event => event.id === activeEventId)) return activeEventId
          return sorted[0]?.id ?? ''
        })
      })
      .catch(err => {
        if (!active) return
        setReportEventsError(err instanceof Error ? err.message : 'Unable to load events for report export.')
      })
      .finally(() => {
        if (active) setLoadingReportEvents(false)
      })

    return () => { active = false }
  }, [activeEventId])

  // Load user list (admin only)
  useEffect(() => {
    if (!isAdmin || !sessionToken) return
    let active = true
    setLoadingUsers(true)
    fetchAppUsers(sessionToken)
      .then(users => { if (active) setAppUsers(users) })
      .catch(err => { if (active) setUsersError(err instanceof Error ? err.message : 'Failed to load users') })
      .finally(() => { if (active) setLoadingUsers(false) })
    return () => { active = false }
  }, [isAdmin, sessionToken])

  const toggleAdmin = async (target: AppUser) => {
    if (!sessionToken) return
    setTogglingUser(target.id)
    setUsersError('')
    try {
      const updated = await setUserAdmin(sessionToken, target.id, !target.is_admin)
      setAppUsers(prev => prev.map(u => u.id === updated.id ? updated : u))
    } catch (err) {
      setUsersError(err instanceof Error ? err.message : 'Failed to update user')
    } finally {
      setTogglingUser(null)
    }
  }

  // Load email settings (admin only)
  useEffect(() => {
    if (!isAdmin || !sessionToken) return
    let active = true
    setLoadingEmail(true)
    requestSummaryEmailAdmin<SummaryEmailAdminResponse>(sessionToken, 'GET')
      .then(payload => {
        if (!active) return
        setSettings({ ...DEFAULT_SETTINGS, ...payload.settings })
        setRecipients(payload.recipients || [])
      })
      .catch(err => {
        if (!active) return
        setNotice(err instanceof Error ? err.message : 'Unable to load summary email settings.')
      })
      .finally(() => { if (active) setLoadingEmail(false) })
    return () => { active = false }
  }, [sessionToken, isAdmin])

  const activeRecipients = useMemo(() => recipients.filter(r => r.active), [recipients])
  const selectedReportEvent = useMemo(
    () => reportEvents.find(event => event.id === selectedReportEventId) ?? null,
    [reportEvents, selectedReportEventId],
  )

  const exportReportPdf = async () => {
    if (!selectedReportEventId) return
    setExportingReport(true)
    try { await openPdf(selectedReportEventId) }
    catch { alert('Failed to generate report. Please try again.') }
    finally { setExportingReport(false) }
  }

  const saveSettings = async () => {
    if (!sessionToken) return
    setSavingSettings(true)
    setNotice('')
    try {
      const payload = await requestSummaryEmailAdmin<{ settings: ReportEmailSettings }>(sessionToken, 'PUT', settings)
      setSettings({ ...DEFAULT_SETTINGS, ...payload.settings })
      setNotice('Settings saved.')
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Unable to save settings.')
    } finally { setSavingSettings(false) }
  }

  const addRecipient = async () => {
    if (!sessionToken || !newEmail.trim()) { setNotice('Recipient email is required.'); return }
    setAddingRecipient(true)
    setNotice('')
    try {
      const payload = await requestSummaryEmailAdmin<{ recipient: ReportEmailRecipient }>(sessionToken, 'POST', {
        name: newName, email: newEmail, sort_order: recipients.length,
      })
      setRecipients(prev => [...prev, payload.recipient])
      setNewName('')
      setNewEmail('')
      setNotice('Recipient added.')
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Unable to add recipient.')
    } finally { setAddingRecipient(false) }
  }

  const updateRecipient = async (recipient: ReportEmailRecipient, updates: Partial<ReportEmailRecipient>) => {
    if (!sessionToken) return
    const next = { ...recipient, ...updates }
    setRecipients(prev => prev.map(r => r.id === recipient.id ? next : r))
    try {
      const payload = await requestSummaryEmailAdmin<{ recipient: ReportEmailRecipient }>(sessionToken, 'PATCH', next)
      setRecipients(prev => prev.map(r => r.id === recipient.id ? payload.recipient : r))
    } catch {
      setRecipients(prev => prev.map(r => r.id === recipient.id ? recipient : r))
    }
  }

  const deleteRecipient = async (recipient: ReportEmailRecipient) => {
    if (!sessionToken) return
    const prev = recipients
    setRecipients(p => p.filter(r => r.id !== recipient.id))
    try {
      await requestSummaryEmailAdmin<{ ok: boolean }>(sessionToken, 'DELETE', { id: recipient.id })
      setNotice('Recipient removed.')
    } catch {
      setRecipients(prev)
    }
  }

  const saveTimezone = async () => {
    if (!churchTimezone.trim()) return
    setSavingTz(true)
    setTzNotice('')
    const { error } = await supabase
      .from('app_config')
      .upsert({ key: 'church_timezone', value: churchTimezone.trim(), updated_at: new Date().toISOString() })
    setSavingTz(false)
    if (error) { setTzNotice('Failed to save: ' + error.message); return }
    setTzNotice('Saved — reload the page for changes to take effect.')
  }

  const formatEventDate = (dateStr: string) =>
    new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    })

  const formatEventTime = (time: string | null) => {
    if (!time) return ''
    const [hourStr, minuteStr] = time.split(':')
    const hour = parseInt(hourStr, 10)
    const minute = parseInt(minuteStr || '0', 10)
    if (Number.isNaN(hour) || Number.isNaN(minute)) return time
    const suffix = hour >= 12 ? 'PM' : 'AM'
    const displayHour = hour % 12 || 12
    return `${displayHour}:${minute.toString().padStart(2, '0')} ${suffix}`
  }

  const reportEventName = (event: Session) =>
    event.serviceTypeSlug === 'special' ? event.name : event.serviceTypeName

  const formatReportEventOption = (event: Session) => {
    const time = formatEventTime(event.eventTime)
    const pieces = [formatEventDate(event.date), time, reportEventName(event)].filter(Boolean)
    return pieces.join(' - ')
  }

  return (
    <div className="fade-in">
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 px-5 pt-4 pb-4 flex items-center gap-3">
        <SettingsIcon className="w-5 h-5 text-gray-400" />
        <h2 className="text-gray-900 font-bold text-lg">Settings</h2>
      </div>

      <div className="p-5 space-y-8 max-w-3xl">

        {/* ── App Settings ── */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">App Settings</p>

          {/* Timezone */}
          <Card className="p-5 mb-3">
            <p className="text-gray-900 text-sm font-semibold flex items-center gap-2 mb-1">
              <Globe className="w-4 h-4 text-blue-600" />
              Church Timezone
            </p>
            <p className="text-gray-400 text-xs mb-4 leading-relaxed">
              Used for service-status display, captured-time labels, and PDF reports. Must be a valid{' '}
              <a href="https://en.wikipedia.org/wiki/List_of_tz_database_time_zones" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">IANA timezone</a>{' '}
              (e.g. <code className="bg-gray-100 px-1 rounded text-[10px]">America/Chicago</code>).
            </p>
            <div className="flex gap-3 flex-wrap items-start">
              <div className="flex-1 min-w-[200px]">
                <select
                  value={[
                    'America/New_York','America/Chicago','America/Denver','America/Phoenix',
                    'America/Los_Angeles','America/Anchorage','Pacific/Honolulu',
                    'America/Halifax','America/Toronto','America/Vancouver',
                    'Europe/London','Europe/Paris','Europe/Berlin','Europe/Amsterdam',
                    'Australia/Sydney','Australia/Melbourne','Pacific/Auckland',
                    'Asia/Tokyo','Asia/Seoul','Asia/Manila','Asia/Kolkata',
                    'Africa/Nairobi','Africa/Lagos',
                  ].includes(churchTimezone) ? churchTimezone : 'custom'}
                  onChange={e => { if (e.target.value !== 'custom') setChurchTimezone(e.target.value) }}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 text-sm focus:outline-none focus:border-blue-500 mb-2"
                >
                  <optgroup label="United States">
                    <option value="America/New_York">Eastern — America/New_York</option>
                    <option value="America/Chicago">Central — America/Chicago</option>
                    <option value="America/Denver">Mountain — America/Denver</option>
                    <option value="America/Phoenix">Mountain (no DST) — America/Phoenix</option>
                    <option value="America/Los_Angeles">Pacific — America/Los_Angeles</option>
                    <option value="America/Anchorage">Alaska — America/Anchorage</option>
                    <option value="Pacific/Honolulu">Hawaii — Pacific/Honolulu</option>
                  </optgroup>
                  <optgroup label="Canada">
                    <option value="America/Halifax">Atlantic — America/Halifax</option>
                    <option value="America/Toronto">Eastern — America/Toronto</option>
                    <option value="America/Vancouver">Pacific — America/Vancouver</option>
                  </optgroup>
                  <optgroup label="Europe">
                    <option value="Europe/London">London — Europe/London</option>
                    <option value="Europe/Paris">Paris — Europe/Paris</option>
                    <option value="Europe/Berlin">Berlin — Europe/Berlin</option>
                    <option value="Europe/Amsterdam">Amsterdam — Europe/Amsterdam</option>
                  </optgroup>
                  <optgroup label="Pacific / Oceania">
                    <option value="Australia/Sydney">Sydney — Australia/Sydney</option>
                    <option value="Australia/Melbourne">Melbourne — Australia/Melbourne</option>
                    <option value="Pacific/Auckland">Auckland — Pacific/Auckland</option>
                  </optgroup>
                  <optgroup label="Asia">
                    <option value="Asia/Tokyo">Tokyo — Asia/Tokyo</option>
                    <option value="Asia/Seoul">Seoul — Asia/Seoul</option>
                    <option value="Asia/Manila">Manila — Asia/Manila</option>
                    <option value="Asia/Kolkata">Kolkata — Asia/Kolkata</option>
                  </optgroup>
                  <optgroup label="Africa">
                    <option value="Africa/Nairobi">Nairobi — Africa/Nairobi</option>
                    <option value="Africa/Lagos">Lagos — Africa/Lagos</option>
                  </optgroup>
                  <option value="custom">Custom (type below)…</option>
                </select>
                <input
                  value={churchTimezone}
                  onChange={e => setChurchTimezone(e.target.value)}
                  placeholder="America/Chicago"
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 text-sm font-mono placeholder-gray-400 focus:outline-none focus:border-blue-500"
                />
              </div>
              <button
                onClick={saveTimezone}
                disabled={savingTz || !churchTimezone.trim()}
                className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 whitespace-nowrap mt-0.5">
                {savingTz ? 'Saving…' : 'Save'}
              </button>
            </div>
            {tzNotice && (
              <p className={`text-xs mt-2 ${tzNotice.startsWith('Failed') ? 'text-red-600' : 'text-emerald-700'}`}>
                {tzNotice}
              </p>
            )}
          </Card>

        </div>

        {/* ── Reporting ── */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Reporting</p>

          {/* Report export */}
          <Card className="p-5 mb-3">
            <p className="text-gray-900 text-sm font-semibold mb-1">Export a Report</p>
            <p className="text-gray-400 text-xs mb-4">Choose any service or special event and generate its report.</p>
            <div className="flex gap-3 items-center flex-wrap">
              <select
                value={selectedReportEventId}
                onChange={e => setSelectedReportEventId(e.target.value)}
                disabled={loadingReportEvents || reportEvents.length === 0}
                className="flex-1 min-w-[200px] bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="" disabled>{loadingReportEvents ? 'Loading events...' : 'Select an event...'}</option>
                {reportEvents.map(event => (
                  <option key={event.id} value={event.id}>{formatReportEventOption(event)}</option>
                ))}
              </select>
              <button
                onClick={exportReportPdf}
                disabled={exportingReport || !selectedReportEventId}
                className="flex items-center gap-2 bg-gray-900 text-white font-semibold text-sm px-4 py-2.5 rounded-lg
                  hover:bg-gray-800 active:scale-95 transition-all disabled:opacity-40 whitespace-nowrap">
                {exportingReport
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
                  : <><FileDown className="w-4 h-4" /> Export Report</>
                }
              </button>
            </div>
            {selectedReportEvent && (
              <p className="text-gray-500 text-xs mt-3">
                Selected: {reportEventName(selectedReportEvent)} on {formatEventDate(selectedReportEvent.date)}
                {selectedReportEvent.eventTime ? ` at ${formatEventTime(selectedReportEvent.eventTime)}` : ''}
              </p>
            )}
            {reportEventsError && <p className="text-red-600 text-xs mt-3">{reportEventsError}</p>}
          </Card>

          {/* Summary email status */}
          <Card className="p-5 mb-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-gray-900 text-sm font-semibold flex items-center gap-2">
                  <Mail className="w-4 h-4 text-blue-600" />
                  Automated Summary Email
                </p>
                <p className="text-gray-500 text-xs mt-1 leading-relaxed">
                  Sends one report per service or event with checklist exceptions, issues, service data, and evaluation notes.
                </p>
              </div>
              <span className={`text-[10px] font-bold px-2 py-1 rounded-full border flex-shrink-0 ${
                settings.enabled ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-500 border-gray-200'
              }`}>
                {settings.enabled ? 'Enabled' : 'Paused'}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                <p className="text-gray-400 text-[10px] font-semibold uppercase tracking-widest">Schedule</p>
                <p className="text-gray-900 text-sm font-semibold mt-1.5">{DAYS[settings.send_day]} at {settings.send_time}</p>
                <p className="text-gray-500 text-xs mt-0.5">{settings.timezone}</p>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                <p className="text-gray-400 text-[10px] font-semibold uppercase tracking-widest">Sender</p>
                <p className="text-gray-900 text-sm font-semibold mt-1.5">{settings.sender_name}</p>
                <p className="text-gray-500 text-xs mt-0.5">jerry@bethanynaz.org</p>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                <p className="text-gray-400 text-[10px] font-semibold uppercase tracking-widest">Recipients</p>
                <p className="text-gray-900 text-sm font-semibold mt-1.5">{activeRecipients.length} active</p>
                <p className="text-gray-500 text-xs mt-0.5">Reply-to: {settings.reply_to_email || 'Not set'}</p>
              </div>
            </div>
          </Card>

          {/* Email admin (admin only) */}
          {!isAdmin ? (
            <Card className="p-5">
              <p className="text-gray-500 text-sm">Admin access required to edit email settings and recipients.</p>
            </Card>
          ) : (
            <>
              <Card className="p-5 mb-3">
                <div className="flex items-center justify-between gap-4 mb-4">
                  <div>
                    <p className="text-gray-900 text-sm font-semibold">Email Settings</p>
                    <p className="text-gray-400 text-xs mt-0.5">Configure when the report sends and where replies go.</p>
                  </div>
                  {loadingEmail && <p className="text-gray-400 text-xs">Loading…</p>}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="flex items-center justify-between gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                    <div>
                      <p className="text-gray-900 text-sm font-medium">Enable summary email</p>
                      <p className="text-gray-400 text-[11px] mt-0.5">When disabled, the scheduler exits without sending.</p>
                    </div>
                    <input type="checkbox" checked={settings.enabled}
                      onChange={e => setSettings(p => ({ ...p, enabled: e.target.checked }))}
                      className="h-4 w-4" />
                  </label>

                  <div>
                    <label className="block text-gray-500 text-xs font-medium mb-1.5">Reply-To Email</label>
                    <input value={settings.reply_to_email || ''}
                      onChange={e => setSettings(p => ({ ...p, reply_to_email: e.target.value }))}
                      placeholder="production@bethanynaz.org"
                      className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-blue-500" />
                  </div>

                  <div>
                    <label className="block text-gray-500 text-xs font-medium mb-1.5">Send Day</label>
                    <select value={settings.send_day}
                      onChange={e => setSettings(p => ({ ...p, send_day: parseInt(e.target.value, 10) }))}
                      className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 text-sm focus:outline-none focus:border-blue-500">
                      {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-gray-500 text-xs font-medium mb-1.5">Send Time</label>
                    <input type="time" value={settings.send_time}
                      onChange={e => setSettings(p => ({ ...p, send_time: e.target.value }))}
                      className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 text-sm focus:outline-none focus:border-blue-500" />
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <button onClick={saveSettings} disabled={savingSettings || loadingEmail}
                    className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-60">
                    {savingSettings ? 'Saving…' : 'Save Email Settings'}
                  </button>
                  {notice && <p className="text-xs text-gray-500">{notice}</p>}
                </div>
              </Card>

              <Card className="p-5">
                <div className="flex items-center justify-between gap-4 mb-4">
                  <div>
                    <p className="text-gray-900 text-sm font-semibold">Recipients</p>
                    <p className="text-gray-400 text-xs mt-0.5">People who receive service and event reports.</p>
                  </div>
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                    {activeRecipients.length} active
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-[1fr_1.2fr_auto] gap-3 mb-4">
                  <input value={newName} onChange={e => setNewName(e.target.value)}
                    placeholder="Name (optional)"
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-blue-500" />
                  <input value={newEmail} onChange={e => setNewEmail(e.target.value)}
                    placeholder="name@bethanynaz.org"
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-blue-500" />
                  <button onClick={addRecipient} disabled={addingRecipient}
                    className="px-4 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-gray-800 disabled:opacity-60 flex items-center justify-center gap-1.5">
                    <Plus className="w-4 h-4" />
                    {addingRecipient ? 'Adding…' : 'Add'}
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
                        <input defaultValue={recipient.name || ''}
                          onBlur={e => {
                            if ((recipient.name || '') !== e.target.value)
                              void updateRecipient(recipient, { name: e.target.value })
                          }}
                          placeholder="Name"
                          className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-blue-500" />
                        <input defaultValue={recipient.email}
                          onBlur={e => {
                            if (recipient.email !== e.target.value)
                              void updateRecipient(recipient, { email: e.target.value })
                          }}
                          placeholder="name@bethanynaz.org"
                          className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-blue-500" />
                        <label className="flex items-center gap-2 text-sm text-gray-600">
                          <input type="checkbox" checked={recipient.active}
                            onChange={e => void updateRecipient(recipient, { active: e.target.checked })}
                            className="h-4 w-4" />
                          Active
                        </label>
                        <button onClick={() => void deleteRecipient(recipient)}
                          className="justify-self-start lg:justify-self-end p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          aria-label={`Delete ${recipient.email}`}>
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

        {/* ── People & Access ── */}
        {isAdmin && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-blue-500" />
              People &amp; Access
            </p>

            <Card className="p-5">
              <p className="text-gray-900 text-sm font-semibold mb-1">Admin Access</p>
              <p className="text-gray-400 text-xs mb-4 leading-relaxed">
                Everyone who has logged in to Sunday Ops via Planning Center. Toggle admin access to grant or revoke
                admin-only features. You cannot remove your own admin access.
              </p>

              {usersError && (
                <p className="text-red-600 text-xs mb-3">{usersError}</p>
              )}

              {loadingUsers ? (
                <div className="flex items-center gap-2 text-gray-400 text-sm py-4">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading…
                </div>
              ) : appUsers.length === 0 ? (
                <div className="border border-dashed border-gray-200 rounded-xl px-4 py-6 text-center">
                  <p className="text-gray-400 text-sm">No users have logged in yet.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {appUsers.map(u => {
                    const isSelf    = u.id === user?.id
                    const toggling  = togglingUser === u.id
                    const initials  = u.name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()
                    const lastLogin = u.last_login
                      ? new Date(u.last_login).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric',
                        })
                      : 'Never'

                    return (
                      <div key={u.id}
                        className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50">

                        {/* Avatar */}
                        {u.avatar_url ? (
                          <img src={u.avatar_url} alt={u.name}
                            className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center
                            text-xs font-bold flex-shrink-0">
                            {initials}
                          </div>
                        )}

                        {/* Name / email */}
                        <div className="flex-1 min-w-0">
                          <p className="text-gray-900 text-sm font-medium truncate">
                            {u.name}
                            {isSelf && (
                              <span className="ml-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">you</span>
                            )}
                          </p>
                          <p className="text-gray-400 text-xs truncate">{u.email ?? '—'}</p>
                        </div>

                        {/* Last login */}
                        <div className="hidden sm:block text-right flex-shrink-0">
                          <p className="text-gray-400 text-[11px] uppercase tracking-wide font-semibold">Last login</p>
                          <p className="text-gray-600 text-xs">{lastLogin}</p>
                        </div>

                        {/* Admin toggle */}
                        <button
                          onClick={() => void toggleAdmin(u)}
                          disabled={toggling || isSelf}
                          title={isSelf ? 'You cannot remove your own admin access' : undefined}
                          className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors
                            disabled:opacity-50 disabled:cursor-not-allowed
                            ${u.is_admin
                              ? 'bg-blue-600 text-white hover:bg-blue-700'
                              : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                            }`}>
                          {toggling
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : u.is_admin ? 'Admin' : 'Operator'
                          }
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>
          </div>
        )}

      </div>
    </div>
  )
}
