export interface Sunday {
  id: string
  date: string
  status: 'pre_service' | 'service_1' | 'between' | 'service_2' | 'post_service' | 'complete'
  created_at: string
}

export interface ChecklistCompletion {
  id: string
  sunday_id: string
  item_id: number
  initials: string
  completed_at: string
}

export interface Issue {
  id: string
  sunday_id: string
  title: string
  description: string
  severity: 'Low' | 'Medium' | 'High' | 'Critical'
  monday_item_id: string | null
  pushed_to_monday: boolean
  created_at: string
}

export interface Attendance {
  id: string
  sunday_id: string
  service_1_count: number | null
  service_2_count: number | null
  notes: string | null
  submitted_at: string
}

export interface Loudness {
  id: string
  sunday_id: string
  service_1_max_db: number | null
  service_1_laeq: number | null
  service_2_max_db: number | null
  service_2_laeq: number | null
  logged_at: string
}

export interface ServiceRuntimes {
  id: string
  sunday_id: string
  service_1_runtime: string | null
  service_1_message_runtime: string | null
  service_2_runtime: string | null
  service_2_message_runtime: string | null
  flip_time: string | null
  saved_at: string
}

export interface Evaluation {
  id: string
  sunday_id: string
  audio_rating: number | null
  video_rating: number | null
  lighting_rating: number | null
  stage_rating: number | null
  stream_rating: number | null
  overall_rating: number | null
  went_well: string | null
  didnt_go: string | null
  submitted_at: string
}

export interface StreamAnalytics {
  id: string
  sunday_id: string
  youtube_peak: number | null
  youtube_total_views: number | null
  resi_peak: number | null
  church_online_peak: number | null
  pulled_at: string
}

export interface WeatherConfig {
  key: string
  location_label: string | null
  zip_code: string
  pull_day: number
  pull_time: string
  created_at: string
  updated_at: string
}

export interface ChecklistItem {
  id: number
  task: string
  role: 'A1' | 'Video' | 'Graphics' | 'Lighting' | 'Stage'
  section: string
  subsection?: string
  note?: string
}

export type Role = 'All' | 'A1' | 'Video' | 'Graphics' | 'Lighting' | 'Stage'
