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
