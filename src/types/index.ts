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
  sunday_id: string | null
  event_id?: string | null
  title: string
  description: string
  severity: 'Low' | 'Medium' | 'High' | 'Critical'
  monday_item_id: string | null
  pushed_to_monday: boolean
  created_at: string
  resolved_at: string | null
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
  submitted_at: string
  service_feel: 'excellent' | 'solid' | 'rough_spots' | 'significant_issues' | null
  broken_moment: boolean | null
  broken_moment_detail: string | null
  went_well: string | null
  needed_attention: string | null
  area_notes: string | null
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

export interface ReportEmailSettings {
  key: string
  enabled: boolean
  send_day: number
  send_time: string
  timezone: string
  sender_name: string
  reply_to_email: string | null
  created_at?: string
  updated_at?: string
}

export interface ReportEmailRecipient {
  id: string
  name: string | null
  email: string
  active: boolean
  sort_order: number
  created_at?: string
  updated_at?: string
}

export interface ReportEmailRun {
  id: string
  sunday_id: string
  status: 'pending' | 'sent' | 'failed'
  sent_at: string | null
  recipient_count: number
  error: string | null
  provider_message_id: string | null
  created_at: string
  updated_at: string
}

export interface IssuePhoto {
  id: string
  issue_id: string
  storage_path: string
  filename: string
  uploaded_at: string
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

// ── Special Events ────────────────────────────────────────────────────────────

export interface EventTemplate {
  id: string
  name: string
  notes: string | null
  created_at: string
}

export interface EventTemplateItem {
  id: string
  template_id: string
  source_checklist_item_id: number | null
  label: string
  section: string
  subsection: string | null
  item_notes: string | null
  sort_order: number
  created_at: string
}

export interface SpecialEvent {
  id: string
  name: string
  event_date: string   // YYYY-MM-DD
  event_time: string | null  // HH:MM
  template_id: string | null
  notes: string | null
  created_at: string
}

export interface EventChecklistItem {
  id: string
  event_id: string
  source_template_item_id: string | null
  source_checklist_item_id: number | null
  label: string
  section: string
  subsection: string | null
  item_notes: string | null
  sort_order: number
  created_at: string
}

export interface EventChecklistCompletion {
  id: string
  event_id: string
  item_id: string
  initials: string
  completed_at: string
}

// A unified session: either a regular Sunday or a special event.
// Used for chronological navigation across both types.
export type Session =
  | { type: 'sunday'; id: string; date: string }
  | { type: 'event';  id: string; date: string; name: string; eventTime: string | null }
