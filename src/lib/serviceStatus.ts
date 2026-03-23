import { getChurchDayOfWeek, CHURCH_TIME_ZONE } from './churchTime'

export interface ServicePhase {
  label: string
  bg: string       // Tailwind bg class (for sidebar pill)
  text: string     // Tailwind text class
  pulse: boolean   // whether to show pulsing radio dot
}

function minutesCT(date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CHURCH_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const h = Number(parts.find(p => p.type === 'hour')?.value ?? 0)
  const m = Number(parts.find(p => p.type === 'minute')?.value ?? 0)
  return h * 60 + m
}

const t = (h: number, m = 0) => h * 60 + m

/** Returns the current service phase (Chicago time), or null if not Sunday / outside crew hours. */
export function getServicePhase(date = new Date()): ServicePhase | null {
  if (getChurchDayOfWeek(date) !== 0) return null

  const mins = minutesCT(date)

  if (mins < t(7))     return null
  if (mins < t(8, 30)) return { label: 'Pre-Service',       bg: 'bg-emerald-500/15', text: 'text-emerald-400', pulse: true  }
  if (mins < t(9, 55)) return { label: 'Service 1 – Live',  bg: 'bg-red-500/20',     text: 'text-red-400',     pulse: true  }
  if (mins < t(10,15)) return { label: 'Between Services',  bg: 'bg-amber-500/15',   text: 'text-amber-400',   pulse: false }
  if (mins < t(11,45)) return { label: 'Service 2 – Live',  bg: 'bg-red-500/20',     text: 'text-red-400',     pulse: true  }
  if (mins < t(18))    return { label: 'Post-Service',       bg: 'bg-blue-500/15',    text: 'text-blue-400',    pulse: false }
  return null
}
