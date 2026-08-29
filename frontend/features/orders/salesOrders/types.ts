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

import { z } from 'zod/v4'

import { productSchema } from '@/features/products/types'
import { packageSchema } from '@/features/packaging/types'
import { pickupSchema } from '@/features/handoff/types'
import { serviceSchema } from '@/features/service/types'
import { insuranceSchema } from '@/features/insurance/types'
import { User, userSchema } from '@/features/users/types'
import {
  Address as AddressContract,
  SpotPrice as SpotPriceContract,
  UserAddress as UserAddressContract,
  type Order as OrderContract,
} from '@dorado/contracts'

// THE SHARED HALF LIVES IN ../types.ts - the order type, the return-shipment
// schema, the status-config types and the drawer prop interfaces, declared once
// and re-exported here under the names this tree already uses. Wave 3 made a
// sales order and a purchase order ONE row with a `direction` column; these
// were the last place the old pair survived.
//
// Two fields this tree reads off the order document are NOT on the order row:
// `used_funds` and `shipping_service` are columns of orders.transactions, so
// they are `order.totals?.used_funds` and `order.totals?.shipping_service`; the
// refinery is the ENGAGEMENT's refiner_id, useRefinerOrder(order.id).
export type { Order as SalesOrder } from '@/features/orders/types'
export {
  orderReturnShipmentSchema as salesOrderReturnShipmentSchema,
} from '@/features/orders/types'
export type {
  OrderReturnShipment as SalesOrderReturnShipment,
  StatusConfigEntry,
  StatusConfig,
  OrderDrawerProps as SalesOrderDrawerProps,
  OrderDrawerHeaderProps as SalesOrderDrawerHeaderProps,
  OrderDrawerContentProps as SalesOrderDrawerContentProps,
  OrderDrawerFooterProps as SalesOrderDrawerFooterProps,
  OrderActionButtonsProps as SalesOrderActionButtonsProps,
} from '@/features/orders/types'

import type { StatusConfig } from '@/features/orders/types'

export const SalesOrderStatuses = ['Pending', 'Preparing', 'In Transit', 'Completed']

export const statusConfig: StatusConfig = {
  Pending: {
    icon: HourglassIcon,
    value_label: 'Price',
  },
  Preparing: {
    icon: PackageIcon,
    value_label: 'Price',
  },
  'In Transit': {
    icon: TruckIcon,
    value_label: 'Price',
  },
  Completed: {
    icon: ShieldCheckIcon,
    value_label: 'Price',
  },
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
  address: AddressContract,
  user_address: UserAddressContract.optional(),
  service: salesOrderServiceSchema,
  using_funds: z.boolean(),
  payment_method: paymentMethodTypeSchema,
  items: z.array(productSchema).min(1, 'At least one item is required'),
})
export type SalesOrderCheckout = z.infer<typeof salesOrderCheckoutSchema>

export const adminSalesOrderCheckoutSchema = z.object({
  address: AddressContract,
  user_address: UserAddressContract.optional(),
  service: salesOrderServiceSchema,
  using_funds: z.boolean(),
  payment_method: paymentMethodTypeSchema,
  items: z.array(productSchema).min(1, 'At least one item is required'),
  // Client-side form state: the admin picks the spots the order is
  // quoted at. Both create endpoints price server-side and ignore what
  // is sent, so this embeds the contract's live-spot schema directly.
  order_metals: z.array(SpotPriceContract),
  user: userSchema,
})
export type AdminSalesOrderCheckout = z.infer<typeof adminSalesOrderCheckoutSchema>

// SalesOrderTotals lived here until 2026-08-28: the return shape of
// calculateSalesOrderPrices, the last client money math on the sales side.
// Every preview is the server's quote now (SalesOrderQuote).
