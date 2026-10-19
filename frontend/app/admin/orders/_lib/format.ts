import type { Direction, OrderListSummary, OrderState } from '@dorado/contracts'

const whole = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const cents = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

const ounces = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

const grams = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

const percent = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
})

export const formatEstimate = (value: number): string => whole.format(value)

export const formatTotal = (value: number): string => cents.format(value)

export const formatFineOz = (metal: string, oz: number): string =>
  `${ounces.format(oz)} oz fine ${metal.toLowerCase()}`

export const formatWeight = (weight: number | null, unit: string): string | undefined =>
  weight == null
    ? undefined
    : `${unit === 'g' ? grams.format(weight) : ounces.format(weight)} ${unit}`

export const formatPurity = (purity: number | null): string | undefined =>
  purity == null ? undefined : `${percent.format(purity <= 1 ? purity * 100 : purity)}%`

export const pluralize = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`

// The totals line under the Orders title: the whole direction, never the
// filters. Which states it names is this screen's choice; the counts are the
// server's (GET /orders/summary).
const SUMMARY_STATES: Record<Direction, OrderState[]> = {
  purchase: ['Awaiting Receipt', 'Ready to Pay'],
  sale: ['Awaiting Payment', 'Preparing', 'In Transit'],
}

export const summaryLine = (direction: Direction, summary: OrderListSummary): string =>
  [
    pluralize(summary.orders, 'order', 'orders'),
    ...SUMMARY_STATES[direction].map(
      (state) =>
        `${summary.states.find((row) => row.state === state)?.count ?? 0} ${state.toLowerCase()}`
    ),
    ...(direction === 'purchase'
      ? [pluralize(summary.unassigned_lots, 'unassigned lot', 'unassigned lots')]
      : []),
  ].join(' · ')
