const cents = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

const ounces = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
})

const weight = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

const percent = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

export const DASH = '—'

export const formatMoney = (value: number | null | undefined): string =>
  value == null ? DASH : cents.format(value)

export const formatOunces = (value: number | null | undefined): string =>
  value == null ? DASH : `${ounces.format(value)} oz`

export const formatWeight = (value: number | null | undefined): string =>
  value == null ? DASH : weight.format(value)

export const formatPercent = (fraction: number | null | undefined): string =>
  fraction == null ? DASH : percent.format(fraction * 100)

export const percentToFraction = (text: string): number | null => {
  const trimmed = text.trim()
  if (trimmed === '') return null
  const value = Number(trimmed.replace(/,/g, ''))
  return Number.isFinite(value) ? value / 100 : null
}

export const parseWeight = (text: string): number | null => {
  const trimmed = text.trim()
  if (trimmed === '') return null
  const value = Number(trimmed.replace(/,/g, ''))
  return Number.isFinite(value) ? value : null
}

export const lastFour = (digits: string | null | undefined): string =>
  digits ? `•••• ${digits}` : DASH

export const ordersToDate = (count: number): string =>
  `${count} ${count === 1 ? 'order' : 'orders'} to date`

export const eyebrowFor = (direction: 'sell' | 'buy', draft: boolean): string =>
  `${draft ? 'Draft ' : ''}${direction === 'sell' ? 'sales order' : 'purchase order'}`.replace(
    /^./,
    (first) => first.toUpperCase()
  )

export const lotCount = (count: number): string => `${count} ${count === 1 ? 'item' : 'items'}`

export const offered = <T extends { name: string }>(
  actions: readonly T[] | undefined,
  name: string
): T | undefined => actions?.find((action) => action.name === name)

type SourceLike = {
  reference: string | null
  parents: readonly { reference: string }[]
}

export const lotSubtitle = (sources: readonly SourceLike[], fallback: string | null): string => {
  const parents = sources.flatMap((source) => source.parents)
  if (parents.length > 1) {
    return `Combined · ${parents.map((parent) => parent.reference.replace(/^Lot /, '')).join(' + ')}`
  }
  return sources[0]?.reference ?? parents[0]?.reference ?? fallback ?? DASH
}
