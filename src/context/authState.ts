import { createContext, useContext } from 'react'
import type { PCOUser } from '../lib/pcoAuth'
import type { AppAccessLevel } from '../types'

export interface AuthContextType {
  user:         PCOUser | null
  accessLevel:  AppAccessLevel
  isManager:    boolean           // manager or admin
  isAdmin:      boolean
  isLoading:    boolean           // true while restoring session or exchanging OAuth code
  sessionToken: string | null     // passed to protected edge functions
  login:        () => void        // starts PCO OAuth flow (redirect, fast path)
  switchAccount: () => void       // starts PCO OAuth flow forcing the account chooser
  logout:       () => void
}

export const AuthContext = createContext<AuthContextType>({
  user:         null,
  accessLevel:  'user',
  isManager:    false,
  isAdmin:      false,
  isLoading:    true,
  sessionToken: null,
  login:         () => {},
  switchAccount: () => {},
  logout:        () => {},
})

export function useAuth() {
  return useContext(AuthContext)
}

// Backward-compatible alias — existing code that imports useAdmin() keeps working.
// The shape is slightly different (no adminPassword / login(password)), but
// the properties actually used — isAdmin, logout — are present.
export { useAuth as useAdmin }
