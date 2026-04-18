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

// Returns the current Sunday's date, or the upcoming Sunday if today is a weekday.
// Used purely for data-integrity: ensuring this Sunday's events exist in the DB.
export function getUpcomingSundayDateString(date = new Date(), tz = CHURCH_TIME_ZONE): string {
  const dayOfWeek = getChurchDayOfWeek(date, tz)
  if (dayOfWeek === 0) return getChurchDateString(date, tz)
  return addDaysToDateString(getChurchDateString(date, tz), 7 - dayOfWeek)
}

export function getOperationalSundayDateString(
  date = new Date(),
  tz = CHURCH_TIME_ZONE,
  flipDay = 1,   // day of week (1 = Monday) to flip focus to next Sunday
  flipHour = 12  // hour in church timezone at which the flip happens
): string {
  const dayOfWeek = getChurchDayOfWeek(date, tz)

  if (dayOfWeek === 0) {
    return getChurchDateString(date, tz)
  }

  // Determine current hour in church timezone
  const hourParts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: '2-digit', hour12: false,
  }).formatToParts(date)
  const currentHour = Number(hourParts.find(p => p.type === 'hour')?.value ?? 0)

  const pastFlipPoint =
    dayOfWeek > flipDay ||
    (dayOfWeek === flipDay && currentHour >= flipHour)

  if (pastFlipPoint) {
    // Look forward to next Sunday
    return addDaysToDateString(getChurchDateString(date, tz), 7 - dayOfWeek)
  } else {
    // Look back to last Sunday
    return addDaysToDateString(getChurchDateString(date, tz), -dayOfWeek)
  }
}
