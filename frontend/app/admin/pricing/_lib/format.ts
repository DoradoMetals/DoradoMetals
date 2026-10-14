const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
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
const stamp = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})
const clock = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})
const marketOpen = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'America/New_York',
})
const dayLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
const weekdayLabel = new Intl.DateTimeFormat('en-US', { weekday: 'short' })
const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'short' })

export const formatMoney = (value: number | null | undefined): string =>
  value == null ? '—' : money.format(value)

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

export const formatFraction = (value: number | null | undefined): string =>
  value == null ? '—' : percent.format(value)

export const formatQuantity = (value: number, unit = 'ozt'): string =>
  `${quantity.format(value)} ${unit}`

export const formatStamp = (iso: string | null | undefined): string =>
  iso ? stamp.format(new Date(iso)).replace(' at ', ', ') : '—'

export const formatClock = (iso: string | null | undefined): string =>
  iso ? clock.format(new Date(iso)) : '—'

export const formatMarketOpen = (iso: string): string =>
  `${marketOpen.format(new Date(iso)).replace(' at ', ', ')} ET`

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
  if (range === '1D') return clock.format(at)
  if (range === '1W') return weekdayLabel.format(at)
  if (range === '1M') return dayLabel.format(at)
  return monthLabel.format(at)
}

export function rangeLabel(min: number | null, max: number | null, unit = 'ozt'): string {
  if (min == null) return '—'
  const low = quantity.format(min)
  return max == null ? `${low}+ ${unit}` : `${low} – ${quantity.format(max)} ${unit}`
}

export const capitalize = (text: string): string =>
  text.length === 0 ? text : `${text[0].toUpperCase()}${text.slice(1)}`

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
