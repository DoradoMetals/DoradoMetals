export const BUSINESS_TIME_ZONE = 'America/Chicago'

const partsOf = (at: Date, timeZone: string, withYear: boolean) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: withYear ? 'numeric' : undefined,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone,
  }).formatToParts(at)

const pick = (parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) =>
  parts.find((part) => part.type === type)?.value ?? ''

const yearIn = (at: Date, timeZone: string) =>
  new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone }).format(at)

export function formatStamp(
  iso: string | null | undefined,
  timeZone: string = BUSINESS_TIME_ZONE
): string {
  if (!iso) return '—'
  const at = new Date(iso)
  const withYear = yearIn(at, timeZone) !== yearIn(new Date(), timeZone)
  const parts = partsOf(at, timeZone, withYear)
  const day = `${pick(parts, 'month')} ${pick(parts, 'day')}`
  const time = `${pick(parts, 'hour')}:${pick(parts, 'minute')} ${pick(parts, 'dayPeriod')}`
  return withYear ? `${day}, ${pick(parts, 'year')}, ${time}` : `${day}, ${time}`
}

export function formatClock(
  iso: string | null | undefined,
  timeZone: string = BUSINESS_TIME_ZONE
): string {
  if (!iso) return '—'
  const parts = partsOf(new Date(iso), timeZone, false)
  return `${pick(parts, 'hour')}:${pick(parts, 'minute')} ${pick(parts, 'dayPeriod')}`
}

export function formatDay(
  iso: string | null | undefined,
  timeZone: string = BUSINESS_TIME_ZONE
): string {
  if (!iso) return '—'
  const at = new Date(iso)
  const withYear = yearIn(at, timeZone) !== yearIn(new Date(), timeZone)
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: withYear ? 'numeric' : undefined,
    timeZone,
  }).format(at)
}

export function formatWindow(
  start: string | null | undefined,
  end: string | null | undefined,
  timeZone: string = BUSINESS_TIME_ZONE
): string {
  if (!start) return '—'
  const range = end
    ? `${formatClock(start, timeZone)} – ${formatClock(end, timeZone)}`
    : formatClock(start, timeZone)
  return `${formatDay(start, timeZone)} · ${range}`
}
