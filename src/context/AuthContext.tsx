import { useState, useEffect, type ReactNode } from 'react'
import { AuthContext } from './authState'
import {
  extractOAuthCode,
  exchangeCodeForSession,
  getStoredSession,
  storeSession,
  clearSession,
  initiatePCOLogin,
  type PCOUser,
} from '../lib/pcoAuth'

interface Props { children: ReactNode }

export function AuthProvider({ children }: Props) {
  const [user,         setUser]         = useState<PCOUser | null>(null)
  const [sessionToken, setSessionToken] = useState<string | null>(null)
  const [isLoading,    setIsLoading]    = useState(true)

  useEffect(() => {
    async function init() {
      // ── Check if this page load is a PCO OAuth callback ───────────────────
      const code = extractOAuthCode()
      if (code) {
        try {
          const session = await exchangeCodeForSession(code)
          storeSession(session)
          setUser(session.user)
          setSessionToken(session.token)
        } catch (err) {
          console.error('PCO auth exchange failed:', err)
          // Fall through to login screen — don't leave the user stuck
        }
        setIsLoading(false)
        return
      }

      // ── Restore session from localStorage ────────────────────────────────
      const stored = getStoredSession()
      if (stored) {
        setUser(stored.user)
        setSessionToken(stored.token)
      }

      setIsLoading(false)
    }

    void init()
  }, [])

  function login() {
    initiatePCOLogin()
  }

  function logout() {
    clearSession()
    setUser(null)
    setSessionToken(null)
  }

  return (
    <AuthContext.Provider value={{
      user,
      isAdmin:      user?.is_admin === true,
      isLoading,
      sessionToken,
      login,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  )
}
