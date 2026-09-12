export function getPayoutDelay(method: string | null | undefined): string {
  if (method === 'WIRE') return '1-5 hours'
  if (method === 'ACH') return '1-24 hours'
  return 'Instant'
}

export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '-'
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

export const DASH = '-'

export function longDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

export function formatIssued(date: Date = new Date()): string {
  return `Issued ${longDate(date)}`
}

/** "3:45 PM on September 9, 2026", for a Hero status sentence. */
export function formatSpotsAt(iso: string): string {
  const date = new Date(iso)
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return `${time} on ${longDate(date)}`
}

/** "Tue, Sep 9 · 1:00 PM", for a pickup or appointment slot. */
export function formatSlot(iso: string): string {
  const date = new Date(iso)
  const day = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return `${day} · ${time}`
}

/** A weight, never NaN or the word null - always a dash when the value is missing. */
export function weightFact(
  value: number | null | undefined,
  unit: string | null,
  label: string
): string {
  if (value == null) return [DASH, unit, label].filter(Boolean).join(' ')
  const withUnit = unit === 'g' ? `${value}g` : unit ? `${value} ${unit}` : String(value)
  return `${withUnit} ${label}`
}

export function pctFact(value: number | null | undefined, label: string): string {
  const amount = value == null ? DASH : `${(value * 100).toFixed(1)}%`
  return `${amount} ${label}`
}

export function unitsFact(value: number | null | undefined): string {
  return `${value == null ? DASH : value} units`
}

export function moneyFact(value: number | null | undefined, label: string): string {
  return `${value == null ? DASH : formatCurrency(value)} ${label}`
}
