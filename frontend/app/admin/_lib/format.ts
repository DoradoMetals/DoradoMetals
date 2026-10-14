const MONEY = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const OUNCES = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 3,
  maximumFractionDigits: 4,
})

const PLAIN = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 4,
})

export const DASH = '—'

export const money = (value: number | null | undefined): string =>
  value === null || value === undefined ? DASH : MONEY.format(value)

export const ounces = (value: number | null | undefined): string =>
  value === null || value === undefined ? DASH : `${OUNCES.format(value)} oz`

export const plain = (value: number | null | undefined): string =>
  value === null || value === undefined ? DASH : PLAIN.format(value)

export const percent = (value: number | null | undefined): string =>
  value === null || value === undefined ? DASH : `${PLAIN.format(value * 100)}%`

export const premium = (value: number | null | undefined): string =>
  value === null || value === undefined ? DASH : PLAIN.format(value)

export const last4 = (value: string | null | undefined): string => (value ? `•••• ${value}` : DASH)

export const when = (value: string | null | undefined): string => {
  if (!value) return DASH
  const at = new Date(value)
  if (Number.isNaN(at.getTime())) return DASH
  return at.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export const day = (value: string | null | undefined): string => {
  if (!value) return DASH
  const at = new Date(value)
  if (Number.isNaN(at.getTime())) return DASH
  return at.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export const place = (city: string | null, state: string | null): string =>
  [city, state].filter(Boolean).join(', ')
