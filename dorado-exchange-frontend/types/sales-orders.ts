import {
  CreditCardIcon,
  AirplaneInFlightIcon,
  TruckIcon as PhosphorTruckIcon,
} from '@phosphor-icons/react'

import { z } from 'zod'
import { Address, addressSchema } from './address'
import { packageSchema } from './packaging'
import { serviceSchema } from './service'
import { pickupSchema } from './pickup'
import { Payout } from './payout'
import { Truck, PackageOpen, ShieldCheck, Hourglass, Handshake, LucideIcon } from 'lucide-react'

import { Product, productSchema } from './product'
import { User } from './user'
import { insuranceSchema } from './insurance'

export interface SalesOrderItem {
  id: string
  sales_order_id: string
  product?: Product
  quantity: number
  price?: number
  bullion_premium?: number
}

export interface SalesOrderMetal {
  id: string
  sales_order_id: string
  type: string
  spot: number
  created_at: Date
}

export interface SalesOrder {
  id: string
  order_number: number
  sales_order_status: string
  notes: string
  created_at: Date
  updated_at: Date
  user_id: string
  order_items: SalesOrderItem[]
  address: Address
  payout: Payout
  user: {
    user_name: string
    user_email: string
  }
  total_price?: number
  review_created: boolean
}

export const salesOrderReturnShipmentSchema = z.object({
  address: addressSchema,
  package: packageSchema,
  pickup: pickupSchema,
  service: serviceSchema,
  insurance: insuranceSchema,
})
export type SalesOrderReturnShipment = z.infer<typeof salesOrderReturnShipmentSchema>

export const SalesOrderStatuses = ['Pending', 'Paid', 'Preparing', 'In Transit', 'Completed']

export type StatusConfigEntry = {
  text_color: string
  background_color: string
  hover_background_color: string
  border_color: string
  stroke_color: string
  icon: LucideIcon
  value_label: string
  gradient: string
}

export type StatusConfig = Record<string, StatusConfigEntry>

export const statusConfig: StatusConfig = {
  Pending: {
    background_color: 'bg-orange-500',
    hover_background_color: 'hover:bg-orange-500',
    text_color: 'text-orange-500',
    border_color: 'border-orange-500',
    stroke_color: 'stroke-orange-500',
    icon: Handshake,
    value_label: 'Payout',
    gradient: 'bg-gradient-to-l from-orange-400 via-orange-500 to-orange-600',
  },

  Paid: {
    background_color: 'bg-fuchsia-400',
    hover_background_color: 'hover:bg-fuchsia-400',
    text_color: 'text-fuchsia-400',
    border_color: 'border-fuchsia-400',
    stroke_color: 'stroke-fuchsia-400',
    icon: PackageOpen,
    value_label: 'Estimate',
    gradient: 'bg-gradient-to-l from-fuchsia-300 via-fuchsia-400 to-fuchsia-500',
  },
  Preparing: {
    background_color: 'bg-yellow-400',
    hover_background_color: 'hover:bg-yellow-400',
    text_color: 'text-yellow-400',
    border_color: 'border-yellow-400',
    stroke_color: 'stroke-yellow-400',
    icon: Hourglass,
    value_label: 'Offer',
    gradient: 'bg-gradient-to-l from-yellow-300 via-yellow-400 to-yellow-500',
  },
  'In Transit': {
    background_color: 'bg-cyan-300',
    hover_background_color: 'hover:bg-cyan-300',
    text_color: 'text-cyan-300',
    border_color: 'border-cyan-300',
    stroke_color: 'stroke-cyan-300',
    icon: Truck,
    value_label: 'Estimate',
    gradient: 'bg-gradient-to-l from-cyan-200 via-cyan-300 to-cyan-400',
  },
  Completed: {
    background_color: 'bg-green-500',
    hover_background_color: 'hover:bg-green-500',
    text_color: 'text-green-500',
    border_color: 'border-green-500',
    stroke_color: 'stroke-green-500',
    icon: ShieldCheck,
    value_label: 'Payout',
    gradient: 'bg-gradient-to-l from-green-400 via-green-500 to-green-600',
  },
}

export interface SalesOrderDrawerProps {
  user_id?: string
  order_id: string
  user?: User
}

export interface SalesOrderDrawerHeaderProps {
  order: SalesOrder
  username: string
  setIsOrderActive: (open: boolean) => void
}

export interface PurchaseOrderDrawerContentProps {
  order: SalesOrder
}

export interface PurchaseOrderDrawerFooterProps {
  order: SalesOrder
}

export interface PurchaseOrderActionButtonsProps {
  order: SalesOrder
}

export type PaymentMethodType = 'CARD' | 'FUNDS' | 'CARD_AND_FUNDS'

export interface PaymentMethod {
  method: PaymentMethodType
  label: string
  description?: string
  icon: any
  subcharge: string
  time_delay: string
  disabled: boolean
}

export const paymentOptions: PaymentMethod[] = [
  // {
  //   method: 'ACH',
  //   label: 'ACH',
  //   description: 'Direct deposit to our account.',
  //   icon: BankIcon,
  //   cost: 'Free',
  //   time_delay: '1-24 hours',
  //   disabled: true,
  // },
  {
    method: 'CARD',
    label: 'Card',
    description: 'Secure card transaction through Stripe.',
    icon: CreditCardIcon,
    subcharge: '2.9%',
    time_delay: 'Instant',
    disabled: false,
  },
  {
    method: 'CARD_AND_FUNDS',
    label: 'Card',
    description: 'Secure card transaction through Stripe.',
    icon: CreditCardIcon,
    subcharge: '2.9%',
    time_delay: 'Instant',
    disabled: false,
  },
]

const salesOrderServiceSchema = z.object({
  label: z.string().min(1, 'Selected required'),
  value: z.string().min(1, 'Selected required'),
  cost: z.number(),
  time: z.string(),
})
export type SalesOrderService = z.infer<typeof salesOrderServiceSchema>

type SalesOrderServiceUIOption = SalesOrderService & {
  icon?: any
  highValue: boolean
}

export const salesOrderServiceOptions: Record<string, SalesOrderServiceUIOption> = {
  STANDARD: {
    label: 'Standard',
    value: 'STANDARD',
    cost: 25,
    time: '3 Days',
    icon: PhosphorTruckIcon,
    highValue: false,
  },
  OVERNIGHT: {
    label: 'Overnight',
    value: 'OVERNIGHT',
    cost: 50,
    time: '1 Day',
    icon: AirplaneInFlightIcon,
    highValue: false,
  },
}

export const salesOrderCheckoutSchema = z.object({
  address: addressSchema,
  service: salesOrderServiceSchema,
  using_funds: z.boolean(),
  payment_method: z.enum(['CARD', 'FUNDS', 'CARD_AND_FUNDS']),
  items: z.array(productSchema).min(1, 'At least one item is required'),
})

export type SalesOrderCheckout = z.infer<typeof salesOrderCheckoutSchema>

export interface SalesOrderTotals {
  itemTotal: number
  baseTotal: number
  shippingCharge: number
  beginningFunds: number
  appliedFunds: number
  endingFunds: number
  subjectToChargesAmount: number
  postChargesAmount: number
  subchargeAmount: number
  orderTotal: number
}
