import { ZelleIcon } from '@/components/icons/logo'
import { Bank, CreditCard, CurrencyDollar, Globe } from '@phosphor-icons/react'

export interface SalesOrder {}

export interface SalesOrderShippingOptions {
  label: string
  cost: number
  time: string
}

export const salesOrderServiceOptions: Record<string, SalesOrderShippingOptions> = {
  STANDARD: {
    label: 'Standard',
    cost: 25,
    time: '3 Days',
  },
  OVERNIGHT: {
    label: 'Overnight',
    cost: 50,
    time: '1 Day',
  },
}

export type PaymentMethodType = 'ACH' | 'WIRE' | 'CARD' | 'ZELLE'

export interface PaymentMethod {
  method: PaymentMethodType
  label: string
  description?: string
  icon: any
  cost: string
  time_delay: string
}

export const paymentOptions: PaymentMethod[] = [
  {
    method: 'ACH',
    label: 'ACH',
    description: 'Direct deposit to our account.',
    icon: Bank,
    cost: 'Free',
    time_delay: '1-24 hours',
  },
  {
    method: 'WIRE',
    label: 'Wire',
    description: 'Domestic wire transfer to our account.',
    icon: Globe,
    cost: '$20.00',
    time_delay: '1-5 hours',
  },
  {
    method: 'CARD',
    label: 'Card',
    description: 'Secure card transaction through Stripe.',
    icon: CreditCard,
    cost: '3%',
    time_delay: 'Instant',
  },
  {
    method: 'ZELLE',
    label: 'Zelle',
    description: 'Secure peer-to-peer money transfer through Zelle.',
    icon: CurrencyDollar,
    cost: 'Free',
    time_delay: 'Instant',
  },
]
