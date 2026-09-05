export function getPayoutDelay(method: string | null | undefined): string {
  if (method === 'WIRE') return '1-5 hours'
  if (method === 'ACH') return '1-24 hours'
  return 'Instant'
}

export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '-'
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}
