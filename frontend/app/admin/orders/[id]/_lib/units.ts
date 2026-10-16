const decimal = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

const fixed = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const share = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 0 })

export const WEIGHT_LABELS = { gross: 'Gross', net: 'Net' } as const

export const formatDecimal = (value: number | null | undefined): string =>
  value == null ? '' : decimal.format(value)

export const formatFixed = (value: number | null | undefined): string =>
  value == null ? '' : fixed.format(value)

export const ratioToPercent = (ratio: number | null | undefined): number | null =>
  ratio == null ? null : Math.round(ratio * 10000) / 100

export const percentToRatio = (percent: number | null): number | null =>
  percent == null ? null : Math.round(percent * 100) / 10000

export const formatRatio = (ratio: number | null | undefined): string =>
  ratio == null ? '—' : `${decimal.format(ratioToPercent(ratio) ?? 0)}%`

export const formatShare = (ratio: number): string => share.format(ratio)

export const parseDecimal = (text: string): number | null => {
  const clean = text.replace(/,/g, '').trim()
  if (clean === '') return null
  const value = Number(clean)
  return Number.isFinite(value) ? value : null
}
