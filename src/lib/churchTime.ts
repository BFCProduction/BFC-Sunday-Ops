export const CHURCH_TIME_ZONE = 'America/Chicago'
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function getChurchDateString(date = new Date(), tz = CHURCH_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const year = parts.find(part => part.type === 'year')?.value
  const month = parts.find(part => part.type === 'month')?.value
  const day = parts.find(part => part.type === 'day')?.value

  if (!year || !month || !day) {
    throw new Error('Unable to format church date')
  }

  return `${year}-${month}-${day}`
}

export function getChurchDayOfWeek(date = new Date(), tz = CHURCH_TIME_ZONE) {
  const dayName = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'long',
  }).format(date)

  return DAY_NAMES.indexOf(dayName)
}

function addDaysToDateString(dateString: string, daysToAdd: number) {
  const [year, month, day] = dateString.split('-').map(Number)
  const base = new Date(Date.UTC(year, month - 1, day))
  base.setUTCDate(base.getUTCDate() + daysToAdd)
  return base.toISOString().slice(0, 10)
}

export function getOperationalSundayDateString(date = new Date(), tz = CHURCH_TIME_ZONE) {
  const dayOfWeek = getChurchDayOfWeek(date, tz)

  if (dayOfWeek === 0) {
    return getChurchDateString(date, tz)
  }

  const daysUntilSunday = (7 - dayOfWeek) % 7
  return addDaysToDateString(getChurchDateString(date, tz), daysUntilSunday)
}
