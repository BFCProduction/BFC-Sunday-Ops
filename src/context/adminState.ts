// ─────────────────────────────────────────────────────────────────────────────
// adminState.ts — backward-compat shim
//
// Auth is now handled by AuthContext (PCO OAuth). This file re-exports so
// existing imports from './adminState' continue to work during the transition.
// ─────────────────────────────────────────────────────────────────────────────
export { useAuth as useAdmin, AuthContext, type AuthContextType } from './authState'
