import { useState } from 'react'
import type { ReactNode } from 'react'
import { AdminContext } from './adminState'
import { verifyAdminPassword } from '../lib/adminApi'

export function AdminProvider({ children }: { children: ReactNode }) {
  const [isAdmin, setIsAdmin] = useState(false)
  const [adminPassword, setAdminPassword] = useState<string | null>(null)

  const login = async (password: string) => {
    const ok = await verifyAdminPassword(password)
    if (ok) {
      setIsAdmin(true)
      setAdminPassword(password)
      return true
    }
    return false
  }

  const logout = () => {
    setIsAdmin(false)
    setAdminPassword(null)
  }

  return (
    <AdminContext.Provider value={{ isAdmin, adminPassword, login, logout }}>
      {children}
    </AdminContext.Provider>
  )
}
