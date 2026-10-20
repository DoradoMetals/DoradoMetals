import type { AddressBookEntry, LinkedAccount } from '@dorado/contracts'

import type { OrderKind } from './createOrder'

export const STEPS = ['Order', 'Fulfillment', 'Transaction', 'Review'] as const

export const KIND_TILES: { kind: OrderKind; title: string; description: string }[] = [
  {
    kind: 'customer_purchase',
    title: 'Customer Purchase',
    description: 'We buy scrap or bullion from a customer.',
  },
  {
    kind: 'customer_sale',
    title: 'Customer Sale',
    description: 'A customer buys bullion from us.',
  },
  {
    kind: 'refiner_purchase',
    title: 'Refiner Purchase',
    description: 'We buy refined metal back from a refiner.',
  },
  { kind: 'refiner_sale', title: 'Refiner Sale', description: 'We send our lots to a refiner.' },
]

export const KIND_LABEL: Record<OrderKind, string> = {
  customer_purchase: 'Customer purchase',
  customer_sale: 'Customer sale',
  refiner_purchase: 'Refiner purchase',
  refiner_sale: 'Refiner sale',
}

export const METALS = ['Gold', 'Silver', 'Platinum', 'Palladium']

export const UNITS = [
  { value: 'g', label: 'g' },
  { value: 't oz', label: 't oz' },
  { value: 'dwt', label: 'dwt' },
  { value: 'lb', label: 'lb' },
]

export const PURITIES = [
  { value: '0.417', label: '10K · 41.7%' },
  { value: '0.583', label: '14K · 58.3%' },
  { value: '0.75', label: '18K · 75%' },
  { value: '0.916', label: '22K · 91.6%' },
  { value: '0.925', label: 'Sterling · 92.5%' },
  { value: '0.999', label: 'Fine · 99.9%' },
]

export const PURITY_NAME: Record<string, string> = {
  '0.417': '10 Karat',
  '0.583': '14 Karat',
  '0.75': '18 Karat',
  '0.916': '22 Karat',
  '0.925': 'Sterling',
  '0.999': 'Fine',
}

export const SETTLEMENT_TYPES = [
  { value: 'pooled', label: 'Pooled' },
  { value: 'paid', label: 'Paid' },
]

export const PAYOUT_LABEL: Record<string, string> = {
  ACH: 'ACH',
  ECHECK: 'eCheck',
  WIRE: 'Wire',
  DORADO_ACCOUNT: 'Dorado balance',
}

export const BANK_METHODS = ['ACH', 'WIRE']

export const HANDOFF_LABEL: Record<string, string> = {
  'CARRIER DROPOFF': 'Carrier drop-off',
  'CARRIER PICKUP': 'Carrier pickup',
  'OWN LABEL': 'Own label',
  DROPSHIP: 'Carrier drop-off',
}

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export const formatMoney = (value: number): string => money.format(value)

const clock = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' })

export const formatTime = (iso: string): string => clock.format(new Date(iso))

export const formatOz = (oz: number): string => `${oz.toFixed(3)} t oz fine`

export const lotsWord = (count: number): string => `${count} ${count === 1 ? 'lot' : 'lots'}`

export const accountLabel = (link: LinkedAccount): string =>
  [
    link.bank_name ?? 'Bank pending',
    link.account_name,
    link.last_four ? `···· ${link.last_four}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

export const addressLabel = (entry: AddressBookEntry): string =>
  [entry.address.line_1, entry.address.city, entry.address.state].filter(Boolean).join(', ')

export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return ''
  const digits = phone.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')
  if (digits.length !== 10) return phone
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

export const TIME_SLOTS = [9, 10, 11, 12, 13, 14, 15, 16].map((hour) => ({
  hour,
  label: `${hour > 12 ? hour - 12 : hour}:00 ${hour >= 12 ? 'PM' : 'AM'}`,
}))

export function slotOn(day: Date, hour: number): string {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour).toISOString()
}

export const PICKUP_WINDOWS = [
  { value: '09:00', label: 'Morning · 9 AM to 12 PM' },
  { value: '12:00', label: 'Afternoon · 12 PM to 5 PM' },
]
