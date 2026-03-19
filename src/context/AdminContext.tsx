import { useState } from 'react'
import type { ReactNode } from 'react'
import { AdminContext } from './adminState'

const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || 'bfcadmin'

export function AdminProvider({ children }: { children: ReactNode }) {
  const [isAdmin, setIsAdmin] = useState(false)

  const login = (password: string) => {
    if (password === ADMIN_PASSWORD) {
      setIsAdmin(true)
      return true
    }
    return false
  }

  const logout = () => setIsAdmin(false)

  return (
    <AdminContext.Provider value={{ isAdmin, login, logout }}>
      {children}
    </AdminContext.Provider>
  )
}
