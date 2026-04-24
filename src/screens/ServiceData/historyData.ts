import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../../lib/supabase'

export interface ServiceHistoryRecord {
  id: string
  service_date: string
  service_type: 'sunday-9am' | 'sunday-11am' | 'special'
  service_label: string | null
  in_person_attendance: number | null
  church_online_unique_viewers: number | null
  youtube_unique_viewers: number | null
  service_run_time_secs: number | null
  message_run_time_secs: number | null
  stage_flip_time_secs: number | null
  weather_temp_f: number | null
  weather_condition: string | null
}

interface ServiceHistoryState {
  rows: ServiceHistoryRecord[]
  loading: boolean
  error: string | null
}

export interface ServiceHistoryColumn {
  key: string
  label: string
  align?: 'left' | 'right'
  mono?: boolean
  render: (row: ServiceHistoryRecord) => ReactNode
}

export function useRecentServiceHistory(serviceTypeSlug: string, beforeDate: string, limit = 10) {
  const [state, setState] = useState<ServiceHistoryState>({
    rows: [],
    loading: true,
    error: null,
  })

  useEffect(() => {
    let cancelled = false

    async function load() {
      let query = supabase
        .from('analytics_records')
        .select(`
          id,
          service_date,
          service_type,
          service_label,
          in_person_attendance,
          church_online_unique_viewers,
          youtube_unique_viewers,
          service_run_time_secs,
          message_run_time_secs,
          stage_flip_time_secs,
          weather_temp_f,
          weather_condition
        `)
        .eq('service_type', serviceTypeSlug)
        .order('service_date', { ascending: false })
        .limit(limit)

      if (beforeDate) {
        query = query.lt('service_date', beforeDate)
      }

      const { data, error } = await query
      if (cancelled) return

      setState({
        rows: (data ?? []) as ServiceHistoryRecord[],
        loading: false,
        error: error?.message ?? null,
      })
    }

    load()
    return () => { cancelled = true }
  }, [serviceTypeSlug, beforeDate, limit])

  return state
}

export function formatHistoryDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatHistoryInt(value: number | null | undefined) {
  return value == null ? '-' : value.toLocaleString()
}

export function formatHistoryDuration(seconds: number | null | undefined) {
  if (seconds == null) return '-'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`
}

export function formatHistoryTemp(value: number | null | undefined) {
  return value == null ? '-' : `${Math.round(value)}°F`
}

export function combinedAttendance(row: ServiceHistoryRecord) {
  if (
    row.in_person_attendance == null &&
    row.church_online_unique_viewers == null &&
    row.youtube_unique_viewers == null
  ) {
    return null
  }

  return (
    (row.in_person_attendance ?? 0) +
    (row.church_online_unique_viewers ?? 0) +
    (row.youtube_unique_viewers ?? 0)
  )
}
