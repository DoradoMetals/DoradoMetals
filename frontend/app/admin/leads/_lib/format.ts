import type { LeadStage, LeadSummary, LeadView } from '@dorado/contracts'

import { BUSINESS_TIME_ZONE } from '@/shared/utils/formatStamp'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const dollars = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const tenths = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

const hundredths = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

export const DASH = '—'

export function formatLocation(lead: { city: string | null; state: string | null }): string {
  const city = lead.city?.trim()
  const state = lead.state?.trim()
  if (city && state) return `${city}, ${state}`
  return city || state || ''
}

export function formatHours(hours: number | null | undefined): string {
  if (hours == null) return DASH
  const minutes = Math.round(hours * 60)
  const whole = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (whole === 0) return `${rest}m`
  return rest === 0 ? `${whole}h` : `${whole}h ${rest}m`
}

export const formatRate = (rate: number): string => `${Math.round(rate * 100)}%`

export const formatPurity = (purity: number): string => `${(purity * 100).toFixed(1)}%`

export const formatWeight = (weight: number, unit: string): string =>
  `${unit === 'g' ? tenths.format(weight) : hundredths.format(weight)} ${unit}`

export const formatGrams = (grams: number): string => formatWeight(grams, 'g')

export const unitShort = (key: string): string => key.replace(/_/g, ' ')

export const formatMoney = (value: number): string => dollars.format(value)

export const formatEstimate = (value: number): string => `${dollars.format(value)} est.`

export function formatRelative(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return 'Never'
  const elapsed = now.getTime() - new Date(iso).getTime()
  if (elapsed < MINUTE) return 'just now'
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`
  if (elapsed < 2 * DAY) return 'yesterday'
  const days = Math.floor(elapsed / DAY)
  if (days < 7) return `${days} days ago`
  if (days < 14) return 'last week'
  return `${Math.floor(days / 7)} weeks ago`
}

export const pluralize = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`

export function formatLeadTotals(totals: LeadSummary['totals']): string {
  const parts = [pluralize(totals.count, 'lead', 'leads'), `${totals.unowned} unowned`]
  if (totals.median_hours_to_first_contact != null) {
    parts.push(`median ${Math.round(totals.median_hours_to_first_contact)}h to first contact`)
  }
  return parts.join(' · ')
}

export type LeadBadge = LeadStage | 'Archived'

export const leadBadge = (lead: Pick<LeadView, 'lead_stage' | 'archived_at'>): LeadBadge =>
  lead.archived_at ? 'Archived' : lead.lead_stage

export function initialsOf(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  const first = words[0]![0]!
  const last = words.length > 1 ? words[words.length - 1]![0]! : ''
  return `${first}${last}`.toUpperCase()
}

export function formatPoints(points: number): string {
  const rounded = Math.round(points)
  return `${rounded > 0 ? '+' : ''}${rounded} pts`
}

export function formatMinutesDelta(minutes: number): string {
  const rounded = Math.round(minutes)
  const sign = rounded > 0 ? '+' : rounded < 0 ? '-' : ''
  return `${sign}${formatHours(Math.abs(rounded) / 60)}`
}

export const formatCountDelta = (count: number): string => `${count > 0 ? '+' : ''}${count}`

export const toIsoDate = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

export function formatShortDate(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return DASH
  const at = new Date(iso)
  const year = (date: Date) =>
    new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: BUSINESS_TIME_ZONE }).format(date)
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: year(at) === year(now) ? undefined : 'numeric',
    timeZone: BUSINESS_TIME_ZONE,
  }).format(at)
}

const CONSENT_METHODS: Record<string, string> = {
  verbal: 'Verbal',
  web_form: 'Web form',
  via_text: 'Via text',
}

export function formatConsent(
  lead: Pick<LeadView, 'sms_consent_at' | 'sms_consent_method'>
): string {
  if (!lead.sms_consent_at) return 'Not opted in'
  const method = lead.sms_consent_method ? CONSENT_METHODS[lead.sms_consent_method] : undefined
  const day = `Opted in ${formatShortDate(lead.sms_consent_at)}`
  return method ? `${day} · ${method}` : day
}
