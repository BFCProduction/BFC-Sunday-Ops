import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Cloud, FileDown, Globe, Loader2, Mail, Plus, RefreshCw, Settings as SettingsIcon, Trash2 } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { useAdmin } from '../context/adminState'
import { requestSummaryEmailAdmin, triggerPcoSync, type PcoSyncResult } from '../lib/adminApi'
import { useSunday } from '../context/SundayContext'
import { fetchReportData } from '../lib/reportData'
import { generateReportHtml } from '../lib/generateReportHtml'
import { supabase } from '../lib/supabase'
import type { ReportEmailRecipient, ReportEmailSettings, Session } from '../types'
import bfcLogo from '../assets/BFC_Production_Logo_Hor reverse.png'
import { SpecialEventManager } from '../components/admin/SpecialEventManager'

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

interface SundayRecord { id: string; date: string }
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

async function openPdf(sundayId: string, sundayDate: string) {
  const [data, logoBase64] = await Promise.all([
    fetchReportData(sundayId, sundayDate),
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

interface SettingsProps {
  onSessionsChange?: (sessions: Session[]) => void
}

export function Settings({ onSessionsChange }: SettingsProps = {}) {
  const { isAdmin, sessionToken } = useAdmin()
  const { sundayId, sundayDate, timezone } = useSunday()

  // ── Timezone state ──
  const [churchTimezone, setChurchTimezone] = useState(timezone)
  const [savingTz, setSavingTz]             = useState(false)
  const [tzNotice, setTzNotice]             = useState('')

  // ── Focus flip state ──
  const [flipDay,      setFlipDay]      = useState(1)
  const [flipHour,     setFlipHour]     = useState(12)
  const [savingFlip,   setSavingFlip]   = useState(false)
  const [flipNotice,   setFlipNotice]   = useState('')

  // ── PDF Export state ──
  const [exportingCurrent, setExportingCurrent] = useState(false)
  const [exportingPast, setExportingPast]       = useState(false)
  const [pastSundays, setPastSundays]           = useState<SundayRecord[]>([])
  const [selectedPast, setSelectedPast]         = useState<SundayRecord | null>(null)

  // ── PCO Sync state ──
  const [syncing,      setSyncing]      = useState(false)
  const [syncResult,   setSyncResult]   = useState<PcoSyncResult | null>(null)
  const [syncError,    setSyncError]    = useState('')
  const [lastSynced,   setLastSynced]   = useState<string | null>(null)

  // ── Email settings state ──
  const [settings, setSettings]           = useState<ReportEmailSettings>(DEFAULT_SETTINGS)
  const [recipients, setRecipients]       = useState<ReportEmailRecipient[]>([])
  const [loadingEmail, setLoadingEmail]   = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [addingRecipient, setAddingRecipient] = useState(false)
  const [notice, setNotice]               = useState('')
  const [newName, setNewName]             = useState('')
  const [newEmail, setNewEmail]           = useState('')

  // Load last PCO sync time
  useEffect(() => {
    supabase.from('app_config').select('value').eq('key', 'pco_last_synced').maybeSingle()
      .then(({ data }) => { if (data?.value) setLastSynced(data.value) })
  }, [])

  // Load past Sundays for the picker + flip config
  useEffect(() => {
    supabase.from('sundays').select('id, date')
      .order('date', { ascending: false })
      .limit(14)
      .then(({ data }) => {
        setPastSundays(data || [])
        const prev = (data || []).find(s => s.date !== sundayDate)
        if (prev) setSelectedPast(prev)
      })
    supabase.from('app_config').select('key, value')
      .in('key', ['sunday_flip_day', 'sunday_flip_hour'])
      .then(({ data }) => {
        const map: Record<string, string> = {}
        ;(data || []).forEach((r: { key: string; value: string }) => { map[r.key] = r.value })
        if (map['sunday_flip_day'])  setFlipDay(parseInt(map['sunday_flip_day'], 10))
        if (map['sunday_flip_hour']) setFlipHour(parseInt(map['sunday_flip_hour'], 10))
      })
  }, [sundayDate])

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

  const exportCurrentPdf = async () => {
    setExportingCurrent(true)
    try { await openPdf(sundayId, sundayDate) }
    catch { alert('Failed to generate report. Please try again.') }
    finally { setExportingCurrent(false) }
  }

  const exportPastPdf = async () => {
    if (!selectedPast) return
    setExportingPast(true)
    try { await openPdf(selectedPast.id, selectedPast.date) }
    catch { alert('Failed to generate report. Please try again.') }
    finally { setExportingPast(false) }
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

  const saveFlip = async () => {
    setSavingFlip(true)
    setFlipNotice('')
    const { error } = await supabase.from('app_config').upsert([
      { key: 'sunday_flip_day',  value: String(flipDay),  updated_at: new Date().toISOString() },
      { key: 'sunday_flip_hour', value: String(flipHour), updated_at: new Date().toISOString() },
    ])
    setSavingFlip(false)
    if (error) { setFlipNotice('Failed to save: ' + error.message); return }
    setFlipNotice('Saved — takes effect on next page load.')
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

  const runPcoSync = async () => {
    if (!sessionToken) return
    setSyncing(true)
    setSyncResult(null)
    setSyncError('')
    try {
      const result = await triggerPcoSync(sessionToken)
      setSyncResult(result)
      setLastSynced(new Date().toISOString())
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Sync failed. Please try again.')
    } finally {
      setSyncing(false)
    }
  }

  const formatSundayDate = (dateStr: string) =>
    new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    })

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

          {/* Focus flip */}
          <Card className="p-5">
            <p className="text-gray-900 text-sm font-semibold flex items-center gap-2 mb-1">
              <RefreshCw className="w-4 h-4 text-blue-600" />
              Sunday Focus Flip
            </p>
            <p className="text-gray-400 text-xs mb-4 leading-relaxed">
              Controls when the app switches from last Sunday to next Sunday as the active date.
              Before this point the app stays on last Sunday for post-service review;
              after it the focus moves forward to the upcoming Sunday.
            </p>
            <div className="flex gap-3 flex-wrap items-end">
              <div>
                <label className="text-gray-500 text-[11px] font-semibold uppercase tracking-wide block mb-1">Day</label>
                <select
                  value={flipDay}
                  onChange={e => setFlipDay(Number(e.target.value))}
                  className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 text-sm focus:outline-none focus:border-blue-500"
                >
                  {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((d, i) => (
                    <option key={d} value={i + 1}>{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-gray-500 text-[11px] font-semibold uppercase tracking-wide block mb-1">Time</label>
                <select
                  value={flipHour}
                  onChange={e => setFlipHour(Number(e.target.value))}
                  className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 text-sm focus:outline-none focus:border-blue-500"
                >
                  {Array.from({ length: 18 }, (_, i) => i + 6).map(h => {
                    const label = h === 12 ? '12:00 PM (noon)'
                      : h < 12 ? `${h}:00 AM`
                      : `${h - 12}:00 PM`
                    return <option key={h} value={h}>{label}</option>
                  })}
                </select>
              </div>
              <button
                onClick={saveFlip}
                disabled={savingFlip}
                className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 whitespace-nowrap">
                {savingFlip ? 'Saving…' : 'Save'}
              </button>
            </div>
            {flipNotice && (
              <p className={`text-xs mt-2 ${flipNotice.startsWith('Failed') ? 'text-red-600' : 'text-emerald-700'}`}>
                {flipNotice}
              </p>
            )}
          </Card>
        </div>

        {/* ── Reporting ── */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Reporting</p>

          {/* Most recent Sunday PDF */}
          <div className="rounded-xl p-5 flex items-center justify-between gap-4 mb-3"
            style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #1e40af 100%)' }}>
            <div>
              <p className="text-white font-bold text-sm">Most Recent Sunday</p>
              <p className="text-blue-200 text-xs mt-1">{formatSundayDate(sundayDate)}</p>
            </div>
            <button onClick={exportCurrentPdf} disabled={exportingCurrent}
              className="flex items-center gap-2 bg-white text-blue-700 font-bold text-xs px-4 py-2.5 rounded-lg
                shadow-md hover:bg-blue-50 active:scale-95 transition-all disabled:opacity-60 flex-shrink-0 whitespace-nowrap">
              {exportingCurrent
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
                : <><FileDown className="w-4 h-4" /> Export PDF</>
              }
            </button>
          </div>

          {/* Previous Sunday picker */}
          <Card className="p-5 mb-3">
            <p className="text-gray-900 text-sm font-semibold mb-1">Export a Previous Sunday</p>
            <p className="text-gray-400 text-xs mb-4">Pick any past Sunday to download its full report.</p>
            <div className="flex gap-3 items-center flex-wrap">
              <select
                value={selectedPast?.id ?? ''}
                onChange={e => {
                  const found = pastSundays.find(s => s.id === e.target.value)
                  setSelectedPast(found ?? null)
                }}
                className="flex-1 min-w-[200px] bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="" disabled>Select a Sunday…</option>
                {pastSundays
                  .filter(s => s.date !== sundayDate)
                  .map(s => (
                    <option key={s.id} value={s.id}>{formatSundayDate(s.date)}</option>
                  ))
                }
              </select>
              <button
                onClick={exportPastPdf}
                disabled={exportingPast || !selectedPast}
                className="flex items-center gap-2 bg-gray-900 text-white font-semibold text-sm px-4 py-2.5 rounded-lg
                  hover:bg-gray-800 active:scale-95 transition-all disabled:opacity-40 whitespace-nowrap">
                {exportingPast
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
                  : <><FileDown className="w-4 h-4" /> Export PDF</>
                }
              </button>
            </div>
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
                  Sends a Sunday afternoon report with checklist exceptions, issues, service data, and evaluation notes.
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
                    <p className="text-gray-400 text-xs mt-0.5">People who receive the Sunday afternoon summary.</p>
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

        {/* ── Planning Center Sync ── */}
        {isAdmin && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2">
              <Cloud className="w-3.5 h-3.5 text-blue-500" />
              Planning Center Sync
            </p>
            <Card className="p-5">
              <p className="text-gray-900 text-sm font-semibold mb-1">Sync Upcoming Services</p>
              <p className="text-gray-400 text-xs mb-4 leading-relaxed">
                Pulls the next {3} months of service plans from Planning Center and creates
                matching events in Sunday Ops. Runs automatically when you log in.
                Existing events are updated in place — no data is lost.
              </p>

              <div className="flex items-center gap-4 flex-wrap">
                <button
                  onClick={runPcoSync}
                  disabled={syncing || !sessionToken}
                  className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold
                    hover:bg-blue-700 disabled:opacity-60 transition-colors">
                  {syncing
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Syncing…</>
                    : <><RefreshCw className="w-4 h-4" /> Sync Now</>
                  }
                </button>
                {lastSynced && !syncing && (
                  <p className="text-gray-400 text-xs">
                    Last synced: {new Date(lastSynced).toLocaleString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric',
                      hour: 'numeric', minute: '2-digit',
                    })}
                  </p>
                )}
              </div>

              {syncError && (
                <p className="text-red-600 text-xs mt-3">{syncError}</p>
              )}

              {syncResult && !syncError && (
                <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                  <p className="text-emerald-700 text-sm font-semibold">
                    ✓ Sync complete — {syncResult.synced} event{syncResult.synced !== 1 ? 's' : ''} synced
                    {syncResult.skipped > 0 ? `, ${syncResult.skipped} skipped` : ''}
                  </p>
                  {syncResult.details.filter(d => d.action === 'error').length > 0 && (
                    <div className="mt-2 space-y-1">
                      {syncResult.details.filter(d => d.action === 'error').map((d, i) => (
                        <p key={i} className="text-red-600 text-xs">{d.name}: {d.error}</p>
                      ))}
                    </div>
                  )}
                  {syncResult.details.filter(d => d.action === 'upserted').length > 0 && (
                    <div className="mt-2 space-y-0.5">
                      {syncResult.details.filter(d => d.action === 'upserted').map((d, i) => (
                        <p key={i} className="text-emerald-600 text-xs">
                          {new Date(d.event_date + 'T12:00:00').toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric',
                          })} — {d.name}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Card>
          </div>
        )}

        {/* ── Special Events ── */}
        {isAdmin && (
          <div className="mt-6">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2">
              <CalendarDays className="w-3.5 h-3.5 text-purple-500" />
              Special Events
            </p>
            <Card className="p-5">
              <SpecialEventManager onSessionsChange={onSessionsChange ?? (() => {})} />
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
