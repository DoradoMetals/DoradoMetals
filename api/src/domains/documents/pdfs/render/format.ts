import { formatDate, formatDateTimeZone } from '#shared/text/time.ts'

const ZONE = 'America/Chicago'

export const DASH = '-'

export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return DASH
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

export function formatAmount(value: number | null | undefined): string {
  if (value == null) return DASH
  const whole = Number.isInteger(value)
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  })
}

export function minus(value: number | null | undefined): string {
  return value == null ? DASH : `−${formatCurrency(value)}`
}

function longDate(date: Date): string {
  return formatDate(date)
}

export function formatIssued(date: Date = new Date()): string {
  return `Issued ${longDate(date)}`
}

export function formatCreated(date: Date = new Date()): string {
  return `Created ${longDate(date)}`
}

export function formatSent(date: Date = new Date()): string {
  return `Sent ${longDate(date)}`
}

export function formatQuoted(date: Date = new Date()): string {
  return `Quoted ${longDate(date)}`
}

export function quoteNumber(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const part = (type: string): string => parts.find((p) => p.type === type)?.value ?? '00'
  return `Q-${part('month')}${part('day')}-${part('hour')}${part('minute')}`
}

export function formatMonth(date: Date = new Date()): string {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: ZONE })
}

export function formatSpotsAt(iso: string): string {
  const date = new Date(iso)
  return formatDateTimeZone(date)
}

function decimal(value: number, min: number, max: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: min, maximumFractionDigits: max })
}

export function labelled(label: string, value: string): string {
  return `${label} ${value}`
}

export function grossFact(value: number | null | undefined, unit: string | null): string {
  const amount = value == null ? DASH : decimal(value, 1, 1)
  return labelled('Gross weight', [amount, unit].filter(Boolean).join(' '))
}

export function percent(value: number | null | undefined): string {
  return value == null ? DASH : `${decimal(value * 100, 1, 1)}%`
}

export function ounces(value: number | null | undefined): string {
  return value == null ? DASH : `${decimal(value, 3, 3)} oz`
}

export function rate(value: number | null | undefined): string {
  return value == null ? DASH : `${decimal(value * 100, 0, 1)}%`
}

export function pctFact(value: number | null | undefined, label: string): string {
  return `${value == null ? DASH : `${decimal(value * 100, 1, 1)}%`} ${label}`
}

export function rateFact(value: number | null | undefined, label: string): string {
  return `${rate(value)} ${label}`
}

export function unitsFact(value: number | null | undefined): string {
  return `${value == null ? DASH : value} ${value === 1 ? 'unit' : 'units'}`
}

export function priceFact(
  value: number | null | undefined,
  per: string,
  premium: number | null | undefined
): string {
  return `Price ${value == null ? DASH : formatCurrency(value)} ${per} (${rate(premium)} of spot)`
}

export function moneyFact(value: number | null | undefined, label: string): string {
  return `${value == null ? DASH : formatCurrency(value)} ${label}`
}
