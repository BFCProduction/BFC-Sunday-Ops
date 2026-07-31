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
  event_id: string | null
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
  sunday_id: string | null
  event_id: string | null
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
  role: 'A1' | 'Video' | 'Graphics' | 'PTZ' | 'Lighting' | 'Stage'
  section: string
  subsection?: string
  note?: string
}

export type Role = 'All' | 'A1' | 'Video' | 'Graphics' | 'PTZ' | 'Lighting' | 'Stage'

// ── Event checklist templates ────────────────────────────────────────────────

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
  role: string | null
  section: string
  subsection: string | null
  item_notes: string | null
  sort_order: number
  created_at: string
}

export interface EventChecklistItem {
  id: string
  event_id: string
  source_template_item_id: string | null
  source_checklist_item_id: number | null
  label: string
  role: string | null
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

// -- Workbooks / Schedule ------------------------------------------------------

export interface Workbook {
  id: string
  name: string
  start_date: string
  end_date: string
  venue: string | null
  description: string | null
  status: 'draft' | 'published' | 'archived'
  published_version: number
  published_at: string | null
  created_at: string
  updated_at: string
}

// -- Production Config (account-level reference data, managed in Settings) ------

export interface Location {
  id: string
  name: string
  sort_order: number
  created_at: string
}

export interface Department {
  id: string
  name: string
  sort_order: number
  created_at: string
}

export interface CrewRole {
  id: string
  name: string
  hourly_rate: number
  department_id: string | null
  sort_order: number
  created_at: string
}

export interface ScheduleItemType {
  id: string
  key: string
  label: string
  icon: string | null
  color: string | null
  sort_order: number
  created_at: string
}

// The schedule item type is now a managed, extensible list (see
// schedule_item_types); stored as the type's `key` string.
export type WorkbookScheduleItemType = string

export interface WorkbookScheduleAssignment {
  id: string
  schedule_item_id: string
  user_id: string | null
  person_name: string | null
  role: string | null
  department: string | null
  is_open: boolean
  created_at: string
}

export interface WorkbookScheduleItem {
  id: string
  workbook_id: string
  event_id: string | null
  location_id: string | null
  title: string
  item_type: WorkbookScheduleItemType
  scheduled_date: string
  start_time: string
  end_time: string | null
  notes: string | null
  departments: string[]
  tags: string[]
  sort_order: number
  created_at: string
  updated_at: string
  assignments: WorkbookScheduleAssignment[]
}

export interface WorkbookCrewMember {
  id: string
  workbook_id: string
  event_id: string | null
  scheduled_date: string
  user_id: string | null
  person_name: string | null
  is_open: boolean
  role_id: string | null
  call_time: string | null
  release_time: string | null
  is_paid: boolean
  sort_order: number
  sort_order_overridden: boolean
  source: 'manual' | 'pco'
  pco_plan_person_id: string | null
  pco_person_id: string | null
  pco_role_name: string | null
  pco_status: string | null
  pco_photo_url: string | null
  pco_synced_at: string | null
  created_at: string
  updated_at: string
}

// -- Workbook supplies ---------------------------------------------------------

export interface WorkbookSupplyItem {
  id: string
  workbook_id: string
  department_id: string | null
  item_name: string
  description: string | null
  quantity: number
  unit_price: number
  purchase_url: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

// -- Workbook input lists ------------------------------------------------------

export type InputListColumnSource = 'room' | 'workbook'
export type InputListConnectionType =
  | 'audio_input'
  | 'audio_output'
  | 'monitor_output'
  | 'network'
  | 'fiber'
  | 'bnc'

export interface InputListSectionColumn {
  id: string
  section_id: string
  name: string
  value_source: InputListColumnSource
  sort_order: number
  created_at: string
  updated_at: string
}

export interface InputListRoomValue {
  row_id: string
  column_id: string
  value: string
  updated_at: string
}

export interface InputListRoomRow {
  id: string
  section_id: string
  connection_type: InputListConnectionType
  sort_order: number
  created_at: string
  updated_at: string
  room_values: InputListRoomValue[]
}

export interface InputListSection {
  id: string
  location_id: string
  name: string
  sort_order: number
  created_at: string
  updated_at: string
  columns: InputListSectionColumn[]
  rows: InputListRoomRow[]
}

export interface WorkbookInputListValue {
  workbook_id: string
  row_id: string
  column_id: string
  value: string
  updated_at: string
}

// -- Workbook intercom grid ----------------------------------------------------

export type IntercomPackTypeKey = 'wired' | 'wireless'
export type IntercomButtonMode = 'momentary' | 'latch'

export interface IntercomPackType {
  key: IntercomPackTypeKey
  label: string
  available_count: number
  sort_order: number
  created_at: string
  updated_at: string
}

export interface IntercomChannel {
  id: string
  name: string
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface RoleIntercomDefault {
  role_id: string
  pack_type: IntercomPackTypeKey | null
  channel_modes: Record<string, IntercomButtonMode>
}

export interface WorkbookIntercomChannel {
  id: string
  workbook_id: string
  event_id: string
  master_channel_id: string | null
  name: string
  sort_order: number
  created_at: string
}

export interface WorkbookIntercomAssignment {
  id: string
  workbook_id: string
  event_id: string
  crew_key: string
  role_id: string | null
  pack_type: IntercomPackTypeKey | null
  channel_modes: Record<string, IntercomButtonMode>
  created_at: string
  updated_at: string
}

export interface WorkbookScheduleVersion {
  id: string
  workbook_id: string
  version_number: number
  published_by: string | null
  published_at: string
  snapshot: unknown
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
 *   legacySundayId   sundays.id — passed to data queries for 9am/11am services
 *   legacySpecialEventId  historical special_events.id bridge for old rows
 *
 * These legacy fields are removed once all data tables are event-native.
 */
export interface Session {
  id: string                        // events.id (new primary key for navigation)
  serviceTypeSlug: string           // 'sunday-9am' | 'sunday-11am' | 'special'
  serviceTypeName: string           // 'Sunday 9:00 AM'
  serviceTypeColor: string          // '#3b82f6'
  name: string                      // 'Sunday 9:00 AM · April 13, 2026'
  date: string                      // event_date YYYY-MM-DD
  eventTime: string | null
  eventEndTime: string | null
  workbookId: string | null
  workbookLocationId: string | null
  includeInAnalytics: boolean       // whether this event shows in Data Explorer

  // ── Backward-compat bridges ───────────────────────────────────────────────
  legacySundayId: string | null        // sundays.id for 9am/11am events
  legacySpecialEventId: string | null  // historical special_events.id bridge
}
