const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const stamp = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

export const formatMoney = (value: number | null | undefined): string =>
  value == null ? '—' : money.format(value)

export const formatStamp = (iso: string | null | undefined): string =>
  iso ? stamp.format(new Date(iso)).replace(' at ', ', ') : '—'

export const capitalize = (text: string): string =>
  text.length === 0 ? text : `${text[0].toUpperCase()}${text.slice(1)}`
