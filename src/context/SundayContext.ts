import { createContext, useContext } from 'react'
import { CHURCH_TIME_ZONE } from '../lib/churchTime'

export interface SundayContextType {
  // ── Sunday fields (populated when sessionType === 'sunday') ──────────────
  sundayId: string
  sundayDate: string

  // ── Event fields (populated when sessionType === 'event') ────────────────
  eventId: string | null
  eventName: string | null

  // ── Common session fields ────────────────────────────────────────────────
  /** 'sunday' or 'event' — which type of session is currently active */
  sessionType: 'sunday' | 'event'
  /** ISO date string (YYYY-MM-DD) of the currently viewed session */
  sessionDate: string

  // ── Navigation / timezone ────────────────────────────────────────────────
  timezone: string
  todaySundayDate: string
  isViewingPast: boolean
  /** Navigate to any session by its ISO date string. The app resolves
   *  whether that date is a Sunday or a special event. */
  navigateSunday: (date: string) => void
}

export const SundayContext = createContext<SundayContextType>({
  sundayId: '',
  sundayDate: '',
  eventId: null,
  eventName: null,
  sessionType: 'sunday',
  sessionDate: '',
  timezone: CHURCH_TIME_ZONE,
  todaySundayDate: '',
  isViewingPast: false,
  navigateSunday: () => {},
})

export function useSunday() {
  return useContext(SundayContext)
}
