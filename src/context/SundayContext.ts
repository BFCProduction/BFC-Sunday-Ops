import { createContext, useContext } from 'react'
import { CHURCH_TIME_ZONE } from '../lib/churchTime'

export interface SundayContextType {
  // ── New unified event model ───────────────────────────────────────────────
  /** The events.id of the currently active session */
  activeEventId: string
  /** Service type slug: 'sunday-9am' | 'sunday-11am' | 'special' */
  serviceTypeSlug: string
  /** Display name: 'Sunday 9:00 AM' */
  serviceTypeName: string
  /** Hex color for the active service type */
  serviceTypeColor: string

  // ── Backward-compat fields (used by data screens until they go event-native) ──
  /** sundays.id — set for Sunday 9am/11am services; empty string for specials */
  sundayId: string
  /** The Sunday date (YYYY-MM-DD) — same for both 9am and 11am events */
  sundayDate: string
  /** Display name of a named/standalone event; null for regular Sunday services */
  eventName: string | null

  // ── Common session fields ────────────────────────────────────────────────
  /** ISO date string (YYYY-MM-DD) of the currently viewed session */
  sessionDate: string

  // ── Navigation / timezone ────────────────────────────────────────────────
  timezone: string
  /** The operational Sunday date (anchor for "back to today" and isViewingPast) */
  todaySundayDate: string
  isViewingPast: boolean

  /**
   * Navigate to an event by its events.id.
   * This is the primary navigation method.
   */
  navigateToEvent: (eventId: string) => void

  /**
   * Navigate to the first event on a given date.
   * Kept for backward compat (e.g. "back to today" button).
   */
  navigateSunday: (date: string) => void
}

export const SundayContext = createContext<SundayContextType>({
  activeEventId:    '',
  serviceTypeSlug:  'sunday-9am',
  serviceTypeName:  'Sunday 9:00 AM',
  serviceTypeColor: '#3b82f6',
  sundayId:         '',
  sundayDate:       '',
  eventName:        null,
  sessionDate:      '',
  timezone:         CHURCH_TIME_ZONE,
  todaySundayDate:  '',
  isViewingPast:    false,
  navigateToEvent:  () => {},
  navigateSunday:   () => {},
})

export function useSunday() {
  return useContext(SundayContext)
}
