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

// ── Special Events (legacy — kept for checklist/template system) ──────────────

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

// ── Production Documents ──────────────────────────────────────────────────────

export interface ProductionDoc {
  id: string
  event_id: string
  doc_type: 'stage_plot' | 'input_list' | 'run_sheet' | 'other'
  title: string
  storage_path: string | null      // Supabase Storage path (production-docs bucket)
  gdrive_file_id: string | null    // Google Drive file ID
  gdrive_url: string | null        // Google Drive webViewLink
  source: 'drive_sync' | 'manual'
  synced_at: string | null
  uploaded_at: string
}

// ── Unified Event Model ───────────────────────────────────────────────────────

/** A service type definition (Sunday 9am, 11am, Special Events, etc.) */
export interface ServiceType {
  id: string
  name: string
  slug: string          // 'sunday-9am' | 'sunday-11am' | 'special'
  color: string
  sortOrder: number
}

/**
 * A unified session — every service instance across all types.
 *
 * Backward compat fields:
 *   type             'sunday' for 9am/11am services, 'event' for special events
 *   legacySundayId   sundays.id — passed to data queries for 9am/11am services
 *   legacySpecialEventId  special_events.id — passed to data queries for specials
 *
 * These legacy fields are removed once all data tables are event-native.
 */
export interface Session {
  id: string                        // events.id (new primary key for navigation)
  type: 'sunday' | 'event'          // 'sunday' = regular service, 'event' = special
  serviceTypeSlug: string           // 'sunday-9am' | 'sunday-11am' | 'special'
  serviceTypeName: string           // 'Sunday 9:00 AM'
  serviceTypeColor: string          // '#3b82f6'
  name: string                      // 'Sunday 9:00 AM · April 13, 2026'
  date: string                      // event_date YYYY-MM-DD
  eventTime: string | null

  // ── Backward-compat bridges ───────────────────────────────────────────────
  legacySundayId: string | null        // sundays.id for 9am/11am events
  legacySpecialEventId: string | null  // special_events.id for special events
}
