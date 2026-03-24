import { createContext, useContext } from 'react'
import { CHURCH_TIME_ZONE } from '../lib/churchTime'

export interface SundayContextType {
  sundayId: string
  sundayDate: string
  timezone: string
}

export const SundayContext = createContext<SundayContextType>({
  sundayId: '',
  sundayDate: '',
  timezone: CHURCH_TIME_ZONE,
})

export function useSunday() {
  return useContext(SundayContext)
}
