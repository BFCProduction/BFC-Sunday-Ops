import { createContext, useContext } from 'react'
import type { PCOUser } from '../lib/pcoAuth'

export interface AuthContextType {
  user:         PCOUser | null
  isAdmin:      boolean           // true when user.is_admin === true
  isLoading:    boolean           // true while restoring session or exchanging OAuth code
  sessionToken: string | null     // passed to protected edge functions
  login:        () => void        // starts PCO OAuth flow (redirect)
  logout:       () => void
}

export const AuthContext = createContext<AuthContextType>({
  user:         null,
  isAdmin:      false,
  isLoading:    true,
  sessionToken: null,
  login:        () => {},
  logout:       () => {},
})

export function useAuth() {
  return useContext(AuthContext)
}

// Backward-compatible alias — existing code that imports useAdmin() keeps working.
// The shape is slightly different (no adminPassword / login(password)), but
// the properties actually used — isAdmin, logout — are present.
export { useAuth as useAdmin }
