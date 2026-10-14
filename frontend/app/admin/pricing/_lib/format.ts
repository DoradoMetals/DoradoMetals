const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export const formatMoney = (value: number | null | undefined): string =>
  value == null ? '—' : money.format(value)

export const capitalize = (text: string): string =>
  text.length === 0 ? text : `${text[0].toUpperCase()}${text.slice(1)}`
