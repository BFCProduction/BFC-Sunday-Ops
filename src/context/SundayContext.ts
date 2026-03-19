import { createContext, useContext } from 'react'

export interface SundayContextType {
  sundayId: string
  sundayDate: string
}

export const SundayContext = createContext<SundayContextType>({
  sundayId: '',
  sundayDate: '',
})

export function useSunday() {
  return useContext(SundayContext)
}
