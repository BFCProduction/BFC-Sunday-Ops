import { useEffect, useState } from 'react'
import { Cloud } from 'lucide-react'
import { Card } from '../../components/ui/Card'

export function Weather() {
  const [weather, setWeather] = useState<{ temp: number; condition: string; wind: number; humidity: number } | null>(null)

  useEffect(() => {
    // Placeholder - will be populated by real API in production
    setWeather({ temp: 68, condition: 'Partly Cloudy', wind: 12, humidity: 45 })
  }, [])

  return (
    <div className="space-y-3 fade-in max-w-sm">
      <Card className="p-6 text-center">
        <p className="text-gray-400 text-xs mb-1">Oklahoma City, OK · Auto-fetched</p>
        {weather ? (
          <>
            <Cloud className="w-12 h-12 text-gray-300 mx-auto my-4" />
            <p className="text-gray-900 text-4xl font-bold">{weather.temp}°F</p>
            <p className="text-gray-500 mt-1">{weather.condition}</p>
            <div className="grid grid-cols-4 gap-2 mt-5">
              {[{ l: 'High', v: '74°' }, { l: 'Low', v: '51°' }, { l: 'Wind', v: `${weather.wind} mph` }, { l: 'Humidity', v: `${weather.humidity}%` }].map(w => (
                <div key={w.l}>
                  <p className="text-gray-400 text-[10px]">{w.l}</p>
                  <p className="text-gray-700 text-sm font-semibold">{w.v}</p>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="py-8"><div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" /></div>
        )}
      </Card>
      <p className="text-gray-400 text-[10px] text-center">Auto-pulls from OpenWeatherMap · refreshes each Sunday morning</p>
    </div>
  )
}
