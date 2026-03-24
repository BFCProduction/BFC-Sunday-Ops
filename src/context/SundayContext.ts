import { createContext, useContext } from 'react'
import { CHURCH_TIME_ZONE } from '../lib/churchTime'

export interface SundayContextType {
  sundayId: string
  sundayDate: string
  timezone: string
  todaySundayDate: string
  isViewingPast: boolean
  navigateSunday: (date: string) => void
}

export const SundayContext = createContext<SundayContextType>({
  sundayId: '',
  sundayDate: '',
  timezone: CHURCH_TIME_ZONE,
  todaySundayDate: '',
  isViewingPast: false,
  navigateSunday: () => {},
})

export function useSunday() {
  return useContext(SundayContext)
}
