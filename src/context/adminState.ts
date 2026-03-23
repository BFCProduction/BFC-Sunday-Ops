import { createContext, useContext } from 'react'

export interface AdminContextType {
  isAdmin: boolean
  adminPassword: string | null
  login: (password: string) => Promise<boolean>
  logout: () => void
}

export const AdminContext = createContext<AdminContextType>({
  isAdmin: false,
  adminPassword: null,
  login: async () => false,
  logout: () => {},
})

export function useAdmin() {
  return useContext(AdminContext)
}
