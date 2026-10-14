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
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: ZONE,
  })
}

function clock(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: ZONE })
}

export function formatIssued(date: Date = new Date()): string {
  return `Issued ${longDate(date)}`
}

export function formatCreated(date: Date = new Date()): string {
  return `Created ${longDate(date)}`
}

export function formatQuoted(date: Date = new Date()): string {
  return `Quoted ${longDate(date)}`
}

export function formatMonth(date: Date = new Date()): string {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: ZONE })
}

export function formatSpotsAt(iso: string): string {
  const date = new Date(iso)
  return `${clock(date)} CT on ${longDate(date)}`
}

function decimal(value: number, min: number, max: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: min, maximumFractionDigits: max })
}

export function weightFact(
  value: number | null | undefined,
  unit: string | null,
  label: string
): string {
  if (value == null) return [DASH, unit, label].filter(Boolean).join(' ')
  const amount = decimal(value, 1, 1)
  const withUnit = unit === 'g' ? `${amount}g` : unit ? `${amount} ${unit}` : amount
  return `${withUnit} ${label}`
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

export function moneyFact(value: number | null | undefined, label: string): string {
  return `${value == null ? DASH : formatCurrency(value)} ${label}`
}
