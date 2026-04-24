import { useEffect, useState } from 'react'
import { Cloud } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { supabase } from '../../lib/supabase'
import { useAdmin } from '../../context/adminState'
import { useSunday } from '../../context/SundayContext'
import type { WeatherConfig } from '../../types'
import {
  formatHistoryTemp,
  useRecentServiceHistory,
} from './historyData'
import { ServiceHistoryTable } from './history'

interface WeatherRecord {
  temp_f: number | null
  condition: string | null
  wind_mph: number | null
  humidity: number | null
  fetched_at: string | null
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// Sunday services each get their own config key; everything else uses 'default'
function configKey(serviceTypeSlug: string) {
  return serviceTypeSlug === 'sunday-9am' || serviceTypeSlug === 'sunday-11am'
    ? serviceTypeSlug
    : 'default'
}

function hasWeatherValues(weather: WeatherRecord | null): weather is WeatherRecord {
  return !!weather && (
    weather.temp_f != null ||
    !!weather.condition ||
    weather.wind_mph != null ||
    weather.humidity != null
  )
}

export function Weather() {
  const { isAdmin } = useAdmin()
  const { activeEventId, sundayId, serviceTypeSlug, serviceTypeName, serviceTypeColor, sessionDate } = useSunday()
  const eventId = activeEventId
  const cfgKey  = configKey(serviceTypeSlug)
  const [weather, setWeather] = useState<WeatherRecord | null>(null)
  const [config, setConfig] = useState<WeatherConfig | null>(null)
  const [locationLabel, setLocationLabel] = useState('')
  const [zipCode, setZipCode] = useState('')
  const [pullDay, setPullDay] = useState(0)
  const [pullTime, setPullTime] = useState('07:00')
  const [loading, setLoading] = useState(true)
  const [weatherError, setWeatherError] = useState('')
  const [savingConfig, setSavingConfig] = useState(false)
  const [configNotice, setConfigNotice] = useState('')
  const {
    rows: historyRows,
    loading: historyLoading,
    error: historyError,
  } = useRecentServiceHistory(serviceTypeSlug, sessionDate)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setWeatherError('')
      setWeather(null)

      // Config: service-specific key first, then fall back to 'default'
      async function loadConfig() {
        let res = await supabase.from('weather_config').select('*').eq('key', cfgKey).maybeSingle()
        if (!res.data && !res.error && cfgKey !== 'default') {
          res = await supabase.from('weather_config').select('*').eq('key', 'default').maybeSingle()
        }
        return res
      }

      async function loadWeather() {
        if (!eventId && !sundayId) return { data: null, error: null }

        const weatherQ = supabase.from('weather').select('*')
        return eventId
          ? weatherQ.eq('event_id', eventId).maybeSingle()
          : weatherQ.eq('sunday_id', sundayId).maybeSingle()
      }

      const [configRes, weatherRes] = await Promise.all([loadConfig(), loadWeather()])

      if (cancelled) return   // service switched while loading — discard stale result

      const nextConfig = (configRes.data || null) as WeatherConfig | null
      setConfig(nextConfig)
      setLocationLabel(nextConfig?.location_label || '')
      setZipCode(nextConfig?.zip_code || '')
      setPullDay(nextConfig?.pull_day ?? 0)
      setPullTime(nextConfig?.pull_time || '07:00')
      setWeather((weatherRes.data || null) as WeatherRecord | null)
      setWeatherError(configRes.error?.message || weatherRes.error?.message || '')
      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [eventId, sundayId, cfgKey])

  const saveConfig = async () => {
    if (!zipCode.trim()) {
      setConfigNotice('ZIP code is required.')
      return
    }

    setSavingConfig(true)
    setConfigNotice('')

    const payload = {
      key: cfgKey,
      location_label: locationLabel.trim() || null,
      zip_code: zipCode.trim(),
      pull_day: pullDay,
      pull_time: pullTime,
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabase.from('weather_config').upsert(payload).select().single()

    setSavingConfig(false)

    if (error) {
      setConfigNotice(error.message)
      return
    }

    const nextConfig = data as WeatherConfig
    setConfig(nextConfig)
    setLocationLabel(nextConfig.location_label || '')
    setZipCode(nextConfig.zip_code)
    setPullDay(nextConfig.pull_day)
    setPullTime(nextConfig.pull_time)
    setConfigNotice('Weather settings saved.')
  }

  const locationText = config?.location_label || (config?.zip_code ? `ZIP ${config.zip_code}` : 'Weather location not configured')
  const hasUsableWeather = hasWeatherValues(weather)
  const emptyTitle = weatherError
    ? 'Weather could not be loaded.'
    : !config
      ? 'Weather import is not configured for this service.'
      : weather
        ? 'Weather import ran, but no usable values were saved.'
        : 'Weather has not been imported for this event yet.'
  const emptyDetail = weatherError
    ? weatherError
    : config
      ? `Configured for ${locationText}; scheduled ${DAYS[pullDay]} at ${pullTime}.`
      : 'An admin can save a location and pull schedule below.'

  return (
    <div className="space-y-4 fade-in max-w-3xl">
      <Card className="p-6 text-center">
        <p className="text-gray-400 text-xs mb-1">{locationText}</p>
        {hasUsableWeather ? (
          <>
            <Cloud className="w-12 h-12 text-gray-300 mx-auto my-4" />
            <p className="text-gray-900 text-4xl font-bold">
              {weather.temp_f != null ? `${weather.temp_f}°F` : '—'}
            </p>
            <p className="text-gray-500 mt-1">{weather.condition || 'Condition unavailable'}</p>
            <div className="grid grid-cols-4 gap-2 mt-5">
              {[
                { l: 'Temp', v: weather.temp_f != null ? `${weather.temp_f}°` : '—' },
                { l: 'Wind', v: weather.wind_mph != null ? `${weather.wind_mph} mph` : '—' },
                { l: 'Humidity', v: weather.humidity != null ? `${weather.humidity}%` : '—' },
                {
                  l: 'Updated',
                  v: weather.fetched_at
                    ? new Date(weather.fetched_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                    : '—',
                },
              ].map(w => (
                <div key={w.l}>
                  <p className="text-gray-400 text-[10px]">{w.l}</p>
                  <p className="text-gray-700 text-sm font-semibold">{w.v}</p>
                </div>
              ))}
            </div>
          </>
        ) : loading ? (
          <div className="py-8"><div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" /></div>
        ) : (
          <div className="py-6">
            <Cloud className="w-12 h-12 text-gray-200 mx-auto mb-4" />
            <p className="text-gray-700 text-sm font-medium">{emptyTitle}</p>
            <p className="text-gray-400 text-xs mt-1">{emptyDetail}</p>
          </div>
        )}
      </Card>

      <ServiceHistoryTable
        title="Past 10 Sundays"
        subtitle={`${serviceTypeName} weather`}
        color={serviceTypeColor}
        rows={historyRows}
        loading={historyLoading}
        error={historyError}
        columns={[
          {
            key: 'temp',
            label: 'Temp',
            align: 'right',
            mono: true,
            render: row => formatHistoryTemp(row.weather_temp_f),
          },
          {
            key: 'condition',
            label: 'Condition',
            render: row => row.weather_condition || '-',
          },
        ]}
      />

      <Card className="p-4">
        <p className="text-gray-900 text-sm font-semibold">Weather Import Settings</p>
        <p className="text-gray-400 text-xs mt-1">
          {config
            ? `Configured to pull on ${DAYS[config.pull_day]} at ${config.pull_time}.`
            : 'No weather import settings have been saved yet.'}
        </p>

        {isAdmin ? (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-500 text-xs font-medium mb-1.5">Location Label</label>
              <input
                value={locationLabel}
                onChange={e => setLocationLabel(e.target.value)}
                placeholder="Bethany, OK"
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-gray-500 text-xs font-medium mb-1.5">ZIP Code</label>
              <input
                value={zipCode}
                onChange={e => setZipCode(e.target.value)}
                placeholder="73008"
                inputMode="numeric"
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-gray-500 text-xs font-medium mb-1.5">Pull Day</label>
              <select
                value={pullDay}
                onChange={e => setPullDay(parseInt(e.target.value, 10))}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 text-sm focus:outline-none focus:border-blue-500"
              >
                {DAYS.map((day, index) => <option key={day} value={index}>{day}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-gray-500 text-xs font-medium mb-1.5">Pull Time</label>
              <input
                type="time"
                value={pullTime}
                onChange={e => setPullTime(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="md:col-span-2 flex items-center gap-3">
              <button
                onClick={saveConfig}
                disabled={savingConfig}
                className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-60"
              >
                {savingConfig ? 'Saving...' : 'Save Weather Settings'}
              </button>
              {configNotice && <p className="text-xs text-gray-500">{configNotice}</p>}
            </div>
          </div>
        ) : (
          <p className="text-gray-400 text-[10px] mt-3">
            Weather values appear here after a scheduled import succeeds. An admin can manage the location and pull schedule here.
          </p>
        )}
      </Card>
    </div>
  )
}
