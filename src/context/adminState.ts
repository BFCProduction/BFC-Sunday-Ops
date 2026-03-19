import { createContext, useContext } from 'react'

export interface AdminContextType {
  isAdmin: boolean
  login: (password: string) => boolean
  logout: () => void
}

export const AdminContext = createContext<AdminContextType>({
  isAdmin: false,
  login: () => false,
  logout: () => {},
})

export function useAdmin() {
  return useContext(AdminContext)
}
