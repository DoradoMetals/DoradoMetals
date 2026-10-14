export const WEIGHT_UNITS = [
  { value: 'troy_oz', label: 'Troy ounce', short: 'ozt' },
  { value: 'g', label: 'Gram', short: 'g' },
  { value: 'dwt', label: 'Pennyweight', short: 'dwt' },
  { value: 'lb', label: 'Pound', short: 'lb' },
]

export const DEFAULT_UNIT = 'g'

export const unitShort = (key: string): string =>
  WEIGHT_UNITS.find((unit) => unit.value === key)?.short ?? key
