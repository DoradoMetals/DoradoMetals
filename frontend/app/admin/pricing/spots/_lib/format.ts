import { formatClock, formatStamp } from '@/shared/utils/formatStamp'

const wholeMoney = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})
const signedMoney = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  signDisplay: 'exceptZero',
})
const bareMoney = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  signDisplay: 'never',
})
const bareNumber = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: 'never',
})
const signedNumber = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
})
const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 2 })
const quantity = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
})
const dayLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
const weekdayLabel = new Intl.DateTimeFormat('en-US', { weekday: 'short' })
const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'short' })
const etOffset = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  timeZoneName: 'longOffset',
})
const slotLabel = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'UTC',
})

export const formatAxisMoney = (value: number): string => wholeMoney.format(value)

export const formatChange = (
  dollars: number | null | undefined,
  pct: number | null | undefined,
  signed: boolean
): string => {
  if (dollars == null) return '—'
  const head = signed ? signedMoney.format(dollars) : bareMoney.format(dollars)
  return pct == null ? head : `${head} (${bareNumber.format(pct)}%)`
}

export const formatQuantity = (value: number, unit = 'ozt'): string =>
  `${quantity.format(value)} ${unit}`

export const formatMarketOpen = (iso: string): string =>
  `${formatStamp(iso, 'America/New_York')} ET`

export const formatAmount = (value: number, unit: string): string => {
  if (unit === 'percent') return `${signedNumber.format(value)}%`
  return signedMoney.format(value)
}

export const unsigned = (value: number): string => bareNumber.format(value).replace(/,/g, '')

export function formatAgo(iso: string | null | undefined, now: number): string {
  if (!iso) return 'never'
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours}h ago`
  return formatStamp(iso)
}

export function formatSince(iso: string | null | undefined, now: number): string {
  if (!iso) return 'no tick yet'
  return formatAgo(iso, now).replace(/ ago$/, '')
}

export function candleLabel(iso: string, range: string): string {
  const at = new Date(iso)
  if (range === '1D') return formatClock(iso)
  if (range === '1W') return weekdayLabel.format(at)
  if (range === '1M') return dayLabel.format(at)
  return monthLabel.format(at)
}

export function adjustmentAmount(adjustment: {
  mode: string
  unit: string
  bid_amount: number
  ask_amount: number
}): string {
  if (adjustment.mode === 'freeze') return 'Frozen'
  if (adjustment.bid_amount === adjustment.ask_amount) {
    return formatAmount(adjustment.bid_amount, adjustment.unit)
  }
  return `Bid ${formatAmount(adjustment.bid_amount, adjustment.unit)} · Ask ${formatAmount(adjustment.ask_amount, adjustment.unit)}`
}

export function adjustmentExpiry(adjustment: {
  expires_at_market_open: boolean
  expires_at_resolved: string | null
}): string {
  if (adjustment.expires_at_market_open) return 'Expires at market open'
  if (adjustment.expires_at_resolved) return `Until ${formatStamp(adjustment.expires_at_resolved)}`
  return 'No expiry'
}

export const sourceName = (
  sources: { id: string; name: string }[],
  id: string | null | undefined
): string => (id ? (sources.find((source) => source.id === id)?.name ?? id) : 'none')

export function adjustmentWindow(adjustment: {
  updated_at: string
  expires_at_resolved: string | null
}): string {
  return `${formatStamp(adjustment.updated_at)} - ${formatStamp(adjustment.expires_at_resolved)}`
}

export function easternInstant(day: Date, time: string): string {
  const date = [
    day.getFullYear(),
    String(day.getMonth() + 1).padStart(2, '0'),
    String(day.getDate()).padStart(2, '0'),
  ].join('-')
  const noon = new Date(`${date}T12:00:00Z`)
  const offset =
    etOffset
      .formatToParts(noon)
      .find((part) => part.type === 'timeZoneName')
      ?.value.replace('GMT', '') || '+00:00'
  return new Date(`${date}T${time}:00${offset}`).toISOString()
}

export const EASTERN_SLOTS = Array.from({ length: 48 }, (_, index) => {
  const hours = String(Math.floor(index / 2)).padStart(2, '0')
  const minutes = index % 2 === 0 ? '00' : '30'
  const value = `${hours}:${minutes}`
  return { value, label: `${slotLabel.format(new Date(`2000-01-01T${value}:00Z`))} ET` }
})

const RANGE_DAYS = { '1D': 1, '1W': 7, '1M': 30, '1Y': 365 }

export function rangeWindow(
  range: keyof typeof RANGE_DAYS,
  now: number,
  buckets: string[]
): { x: number[]; min: number; max: number; format: (value: number) => string } {
  return {
    x: buckets.map((bucket) => Date.parse(bucket)),
    min: now - RANGE_DAYS[range] * 86_400_000,
    max: now,
    format: (value: number) => candleLabel(new Date(value).toISOString(), range),
  }
}
