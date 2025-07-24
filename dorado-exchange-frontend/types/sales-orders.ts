import {
  CreditCardIcon,
  AirplaneInFlightIcon,
  TruckIcon as PhosphorTruckIcon,
  PackageIcon,
  HourglassIcon,
  TruckIcon,
  ShieldCheckIcon,
  CurrencyDollarIcon,
  BankIcon,
} from '@phosphor-icons/react'

import { z } from 'zod'
import { Address, addressSchema } from './address'
import { packageSchema } from './packaging'
import { serviceSchema } from './service'
import { pickupSchema } from './pickup'
import { Payout } from './payout'
import { LucideIcon } from 'lucide-react'

import { Product, productSchema } from './product'
import { User, userSchema } from './user'
import { insuranceSchema } from './insurance'
import { Shipment } from './shipments'
import { spotPriceSchema } from './metal'

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
  order_sent: boolean
  tracking_updated: boolean
  supplier_id: string
  order_items: SalesOrderItem[]
  address: Address
  payout: Payout
  shipment: Shipment
  user: {
    user_name: string
    user_email: string
  }
  sales_tax: number
}

export const salesOrderReturnShipmentSchema = z.object({
  address: addressSchema,
  package: packageSchema,
  pickup: pickupSchema,
  service: serviceSchema,
  insurance: insuranceSchema,
})
export type SalesOrderReturnShipment = z.infer<typeof salesOrderReturnShipmentSchema>

export const SalesOrderStatuses = ['Pending', 'Preparing', 'In Transit', 'Completed']

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
    background_color: 'bg-rose-600',
    hover_background_color: 'hover:bg-rose-600',
    text_color: 'text-rose-600',
    border_color: 'border-rose-600',
    stroke_color: 'stroke-rose-600',
    icon: HourglassIcon,
    value_label: 'Price',
    gradient: 'bg-gradient-to-l from-rose-500 via-rose-600 to-rose-700',
  },
  Preparing: {
    background_color: 'bg-amber-500',
    hover_background_color: 'hover:bg-amber-500',
    text_color: 'text-amber-500',
    border_color: 'border-amber-500',
    stroke_color: 'stroke-amber-500',
    icon: PackageIcon,
    value_label: 'Price',
    gradient: 'bg-gradient-to-l from-amber-400 via-amber-500 to-amber-600',
  },
  'In Transit': {
    background_color: 'bg-cyan-600',
    hover_background_color: 'hover:bg-cyan-600',
    text_color: 'text-cyan-600',
    border_color: 'border-cyan-600',
    stroke_color: 'stroke-cyan-600',
    icon: TruckIcon,
    value_label: 'Price',
    gradient: 'bg-gradient-to-l from-cyan-400 via-cyan-500 to-cyan-600',
  },
  Completed: {
    background_color: 'bg-green-700',
    hover_background_color: 'hover:bg-green-700',
    text_color: 'text-green-700',
    border_color: 'border-green-700',
    stroke_color: 'stroke-green-700',
    icon: ShieldCheckIcon,
    value_label: 'Price',
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

export interface PaymentMethod {
  method: PaymentMethodType
  label: string
  description?: string
  icon: any
  surcharge_label: string
  surcharge: number
  time_delay: string
  disabled: boolean
  value: string
  display: boolean
}

export const PaymentMethodTypeValues = [
  'CARD',
  'ACH',
  'CREDIT',
  'WIRE',
  'APPLE PAY',
  'GOOGLE PAY',
] as const

export type PaymentMethodType = (typeof PaymentMethodTypeValues)[number]

export const paymentMethodTypeSchema = z.enum(PaymentMethodTypeValues)

export const paymentOptions: PaymentMethod[] = [
  {
    method: 'CARD',
    label: 'Card',
    description: 'Secure card transaction through Stripe.',
    icon: CreditCardIcon,
    surcharge_label: '2.9%',
    surcharge: 0.029,
    time_delay: 'Instant',
    disabled: false,
    value: 'card',
    display: true,
  },
  {
    method: 'ACH',
    label: 'ACH',
    description: 'Pay directly from your bank account via secure ACH debit.',
    icon: BankIcon,
    surcharge_label: '0.5%',
    surcharge: 0.005,
    time_delay: '1-3 business days',
    disabled: false,
    value: 'us_bank_account',
    display: true,
  },
  {
    method: 'CREDIT',
    label: 'Dorado Credit',
    description:
      'Pay in full or partially using Dorado Credit – obtained by selling your metals to us.',
    icon: CreditCardIcon,
    surcharge_label: 'No Fee',
    surcharge: 0,
    time_delay: 'Instant',
    disabled: false,
    value: 'dorado_credit',
    display: true,
  },
  {
    method: 'WIRE',
    label: 'Wire Transfer',
    description: 'Avoid fees by placing a wire using your bank.',
    icon: BankIcon,
    surcharge_label: 'No Fee',
    surcharge: 0,
    time_delay: '1-2 business days',
    disabled: true,
    value: 'us_domestic_wire',
    display: false,
  },
  {
    method: 'APPLE PAY',
    label: 'Apple Pay',
    description: 'Pay instantly using Apple Pay.',
    icon: CreditCardIcon,
    surcharge_label: '2.9%',
    surcharge: 0.029,
    time_delay: 'Instant',
    disabled: false,
    value: 'apple_pay',
    display: false,
  },
  {
    method: 'GOOGLE PAY',
    label: 'Google Pay',
    description: 'Pay instantly using Google Pay.',
    icon: CreditCardIcon,
    surcharge_label: '2.9%',
    surcharge: 0.029,
    time_delay: 'Instant',
    disabled: false,
    value: 'google_pay',
    display: false,
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

export const adminSalesOrderServiceOptions: Record<string, SalesOrderServiceUIOption> = {
  FREE: {
    label: 'Free',
    value: 'FREE',
    cost: 0,
    time: '1 Days',
    icon: CurrencyDollarIcon,
    highValue: false,
  },
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
  payment_method: paymentMethodTypeSchema,
  items: z.array(productSchema).min(1, 'At least one item is required'),
})
export type SalesOrderCheckout = z.infer<typeof salesOrderCheckoutSchema>

export const adminSalesOrderCheckoutSchema = z.object({
  address: addressSchema,
  service: salesOrderServiceSchema,
  using_funds: z.boolean(),
  payment_method: paymentMethodTypeSchema,
  items: z.array(productSchema).min(1, 'At least one item is required'),
  order_metals: z.array(spotPriceSchema),
  user: userSchema,
})
export type AdminSalesOrderCheckout = z.infer<typeof adminSalesOrderCheckoutSchema>

export interface SalesOrderTotals {
  itemTotal: number
  baseTotal: number
  shippingCharge: number
  beginningFunds: number
  appliedFunds: number
  endingFunds: number
  subjectToChargesAmount: number
  postChargesAmount: number
  surchargeAmount: number
  salesTax: number
  orderTotal: number
}
