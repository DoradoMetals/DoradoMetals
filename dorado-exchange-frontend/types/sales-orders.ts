import {
  CreditCardIcon,
  AirplaneInFlightIcon,
  TruckIcon as PhosphorTruckIcon,
  PackageIcon,
  HourglassIcon,
  TruckIcon,
  ShieldCheckIcon,
} from '@phosphor-icons/react'

import { z } from 'zod'
import { Address, addressSchema } from './address'
import { packageSchema } from './packaging'
import { serviceSchema } from './service'
import { pickupSchema } from './pickup'
import { Payout } from './payout'
import { LucideIcon } from 'lucide-react'

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
  user_id: string
  sales_order_status: string
  notes: string
  created_at: Date
  updated_at: Date
  created_by: string
  updated_by: string
  order_number: number
  order_total: number
  review_created: boolean
  shipping_service: string
  shipping_cost: number
  pre_charges_amount: number
  post_charges_amount: number
  subject_to_charges_amount: number
  used_funds: boolean
  item_total: number
  base_total: number
  charges_amount: number

  order_items: SalesOrderItem[]
  address: Address
  payout: Payout
  user: {
    user_name: string
    user_email: string
  }
  total_price?: number
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
    background_color: 'bg-orange-700',
    hover_background_color: 'hover:bg-orange-700',
    text_color: 'text-orange-700',
    border_color: 'border-orange-700',
    stroke_color: 'stroke-orange-700',
    icon: HourglassIcon,
    value_label: 'Payout',
    gradient: 'bg-gradient-to-l from-orange-600 via-orange-700 to-orange-800',
  },
  Paid: {
    background_color: 'bg-fuchsia-600',
    hover_background_color: 'hover:bg-fuchsia-600',
    text_color: 'text-fuchsia-600',
    border_color: 'border-fuchsia-600',
    stroke_color: 'stroke-fuchsia-600',
    icon: CreditCardIcon,
    value_label: 'Estimate',
    gradient: 'bg-gradient-to-l from-fuchsia-500 via-fuchsia-600 to-fuchsia-700',
  },
  Preparing: {
    background_color: 'bg-yellow-500',
    hover_background_color: 'hover:bg-yellow-500',
    text_color: 'text-yellow-500',
    border_color: 'border-yellow-500',
    stroke_color: 'stroke-yellow-500',
    icon: PackageIcon,
    value_label: 'Offer',
    gradient: 'bg-gradient-to-l from-yellow-400 via-yellow-500 to-yellow-600',
  },
  'In Transit': {
    background_color: 'bg-cyan-600',
    hover_background_color: 'hover:bg-cyan-600',
    text_color: 'text-cyan-600',
    border_color: 'border-cyan-600',
    stroke_color: 'stroke-cyan-600',
    icon: TruckIcon,
    value_label: 'Estimate',
    gradient: 'bg-gradient-to-l from-cyan-400 via-cyan-500 to-cyan-600',
  },
  Completed: {
    background_color: 'bg-green-700',
    hover_background_color: 'hover:bg-green-700',
    text_color: 'text-green-700',
    border_color: 'border-green-700',
    stroke_color: 'stroke-green-700',
    icon: ShieldCheckIcon,
    value_label: 'Payout',
    gradient: 'bg-gradient-to-l from-green-600 via-green-700 to-green-800',
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

export interface SalesOrderDrawerContentProps {
  order: SalesOrder
}

export interface SalesOrderDrawerFooterProps {
  order: SalesOrder
}

export interface SalesOrderActionButtonsProps {
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
