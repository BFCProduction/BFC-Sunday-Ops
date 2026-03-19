import { useEffect, useState } from 'react'
import { Cloud } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { supabase } from '../../lib/supabase'

interface WeatherProps {
  sundayId: string
}

interface WeatherRecord {
  temp_f: number | null
  condition: string | null
  wind_mph: number | null
  humidity: number | null
  fetched_at: string | null
}

export function Weather({ sundayId }: WeatherProps) {
  const [weather, setWeather] = useState<WeatherRecord | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('weather').select('*').eq('sunday_id', sundayId).single()
      .then(({ data }) => {
        setWeather((data || null) as WeatherRecord | null)
        setLoading(false)
      })
  }, [sundayId])

  return (
    <div className="space-y-3 fade-in max-w-sm">
      <Card className="p-6 text-center">
        <p className="text-gray-400 text-xs mb-1">Bethany, OK weather</p>
        {weather ? (
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
            <p className="text-gray-700 text-sm font-medium">No weather data has been imported yet.</p>
            <p className="text-gray-400 text-xs mt-1">This tab stays available, but it does not use mock data anymore.</p>
          </div>
        )}
      </Card>
      <p className="text-gray-400 text-[10px] text-center">
        Weather values appear here when the `weather` table is populated.
      </p>
    </div>
  )
}
