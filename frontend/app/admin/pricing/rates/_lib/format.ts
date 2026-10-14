const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 2 })
const quantity = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
})

export const formatFraction = (value: number | null | undefined): string =>
  value == null ? '—' : percent.format(value)

export function rangeLabel(min: number | null, max: number | null, unit = 'ozt'): string {
  if (min == null) return '—'
  const low = quantity.format(min)
  return max == null ? `${low}+ ${unit}` : `${low} – ${quantity.format(max)} ${unit}`
}
