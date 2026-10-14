import type { DocumentEnd, MailerRow } from '@dorado/contracts'

const ZONE = 'America/Chicago'
const ZONE_LABEL = 'CT'
const EN_DASH = '–'

type Moment = Date | string | number

interface Parts {
  year: string
  month: string
  day: string
  hour: string
  minute: string
  period: string
}

function partsOf(moment: Moment): Parts {
  const found = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(new Date(moment))
  const pick = (type: string): string => found.find((part) => part.type === type)?.value ?? ''
  return {
    year: pick('year'),
    month: pick('month'),
    day: pick('day'),
    hour: pick('hour'),
    minute: pick('minute'),
    period: pick('dayPeriod').toUpperCase(),
  }
}

function dayOf(parts: Parts, now: Moment): string {
  const day = `${parts.month} ${parts.day}`
  return parts.year === partsOf(now).year ? day : `${day}, ${parts.year}`
}

function clockOf(parts: Parts): string {
  return `${parts.hour}:${parts.minute} ${parts.period}`
}

export function formatDate(moment: Moment, now: Moment = new Date()): string {
  return dayOf(partsOf(moment), now)
}

export function formatClock(moment: Moment): string {
  return clockOf(partsOf(moment))
}

export function formatDateTime(moment: Moment, now: Moment = new Date()): string {
  const parts = partsOf(moment)
  return `${dayOf(parts, now)}, ${clockOf(parts)}`
}

export function formatDateTimeZone(moment: Moment, now: Moment = new Date()): string {
  return `${formatDateTime(moment, now)} ${ZONE_LABEL}`
}

export function formatDateAtClockZone(moment: Moment, now: Moment = new Date()): string {
  const parts = partsOf(moment)
  return `${dayOf(parts, now)} at ${clockOf(parts)} ${ZONE_LABEL}`
}

export function formatWindow(start: Moment, end: Moment | null, now: Moment = new Date()): string {
  if (end === null) return formatDateTime(start, now)
  const from = partsOf(start)
  const to = partsOf(end)
  const sameDay = from.year === to.year && from.month === to.month && from.day === to.day
  if (!sameDay) return `${formatDateTime(start, now)} ${EN_DASH} ${formatDateTime(end, now)}`
  const opening = from.period === to.period ? `${from.hour}:${from.minute}` : clockOf(from)
  return `${dayOf(from, now)}, ${opening} ${EN_DASH} ${clockOf(to)}`
}

export function formatDuration(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(whole / 60)
  const rest = String(whole % 60).padStart(2, '0')
  return `${minutes}:${rest}`
}

function shaped(
  shape: NonNullable<MailerRow['shape']>,
  at: string,
  until: string | null | undefined,
  now: Moment
): string {
  if (shape === 'date') return formatDate(at, now)
  if (shape === 'datetime') return formatDateTime(at, now)
  if (shape === 'zoned') return formatDateTimeZone(at, now)
  return formatWindow(at, until ?? null, now)
}

export function timedRows(rows: MailerRow[], now: Moment = new Date()): MailerRow[] {
  return rows.map((row) =>
    row.at && row.shape
      ? { label: row.label, value: shaped(row.shape, row.at, row.until, now) }
      : row
  )
}

export function timedEnd(end: DocumentEnd, now: Moment = new Date()): DocumentEnd {
  if (!end.at || !end.shape) return end
  return { label: end.label, who: shaped(end.shape, end.at, end.until, now), lines: end.lines }
}
