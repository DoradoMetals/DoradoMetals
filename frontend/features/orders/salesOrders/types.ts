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
import { User } from '@/features/users/types'
import {
  Address as AddressContract,
  SpotPrice as SpotPriceContract,
  User as UserContract,
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

export const PaymentMethodTypeValues = [
  'CARD',
  'ACH',
  'CREDIT',
  'WIRE',
  'APPLE PAY',
  'GOOGLE PAY',
] as const

type PaymentMethodType = (typeof PaymentMethodTypeValues)[number]

const paymentMethodTypeSchema = z.enum(PaymentMethodTypeValues)

// THE METHOD ROWS COME FROM THE DATABASE NOW (D207). `paymentOptions` - six
// hardcoded records duplicating payments.methods field for field - is gone;
// consumers read usePaymentMethods('sale') (features/payments/queries) and
// look rows up by `type`, which speaks the same vocabulary as this enum
// (migration 109 reconciled the two rows that did not). The enum stays: it is
// the checkout schema's validation contract, a vocabulary rather than data.
//
// The ICON is the one thing that stays client-side, deliberately (Jacob's
// standing call from the handoff conversion): a picture is a client concern
// and has no business on the wire.
export const paymentMethodIcon: Record<PaymentMethodType, any> = {
  CARD: CreditCardIcon,
  ACH: BankIcon,
  CREDIT: CreditCardIcon,
  WIRE: BankIcon,
  'APPLE PAY': CreditCardIcon,
  'GOOGLE PAY': CreditCardIcon,
}

const salesOrderServiceSchema = z.object({
  label: z.string().min(1, 'Selected required'),
  value: z.string().min(1, 'Selected required'),
  cost: z.number(),
  time: z.string(),
})
type SalesOrderService = z.infer<typeof salesOrderServiceSchema>

export type SalesOrderServiceUIOption = SalesOrderService & {
  icon?: any
  highValue: boolean
}

// THE SALE SERVICES COME FROM THE DATABASE NOW (D207, corrected by D208).
// The two hardcoded records (salesOrderServiceOptions /
// adminSalesOrderServiceOptions) duplicated getShippingCharge's constants a
// second time; the business's carrier-agnostic rows in shipping.services are
// the one reference home, read through useSaleShippingServices
// (features/shipping/queries). Customer surfaces filter to `display`; the
// admin drawer takes all rows - which is the whole difference the two records
// used to encode. The icon is the client's, keyed by the row's opaque `code`.
export const serviceTierIcon: Record<string, any> = {
  STANDARD: PhosphorTruckIcon,
  OVERNIGHT: AirplaneInFlightIcon,
  FREE: CurrencyDollarIcon,
}

export const transitLabel = (min?: number | null, max?: number | null): string => {
  const days = max ?? min
  return days == null ? '' : days === 1 ? '1 Day' : `${days} Days`
}

export const saleServiceToOption = (svc: {
  code: string | null
  name: string
  price: number | null
  min_transit_days: number | null
  max_transit_days: number | null
}): SalesOrderServiceUIOption => ({
  label: svc.name,
  value: svc.code ?? svc.name.toUpperCase(),
  cost: Number(svc.price ?? 0),
  time: transitLabel(svc.min_transit_days, svc.max_transit_days),
  icon: serviceTierIcon[svc.code ?? ''],
  highValue: false,
})

// The stores need a service BEFORE any query resolves - the checkout schema
// requires one and the selector heals it with the live row on mount. Display
// seed only: the server prices shipping itself, and the reference-drift test
// on the API side pins the row to the same numbers.
export const DEFAULT_SALES_SERVICE: SalesOrderService = {
  label: 'Standard',
  value: 'STANDARD',
  cost: 25,
  time: '3 Days',
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
  // THE CUSTOMER THE ORDER IS FOR, AND IT IS THE CONTRACT NOW (phase 3).
  //
  // This was the ACCOUNT FORM's schema in features/users/types.ts -
  // better-auth's camelCase session shape with `name` required non-empty. The
  // value that reaches it has never been that: `setCreateSalesOrderUser` is
  // called from the admin users drawer with a row off GET /users/get_all, so
  // it is snake_case and API-sourced. It compiled because every field of the
  // form schema is optional except email and name, so a snake_case object
  // satisfied it vacuously. (The form schema is NOT NAMED here on purpose:
  // audit:frontend-nullability walks a parsed schema's body for `\w+Schema`
  // to build its transitive closure, and that regex reads comments too - so
  // spelling the old identifier inside this object would keep reporting it as
  // parsed at runtime after it stopped being.)
  //
  // *** DELIBERATE BEHAVIOUR CHANGE ON THE CHECKOUT PATH, and it is the one
  //     `audit:frontend-nullability` was pointing at. *** Two things differ:
  //   - `created_at`, `updated_at` and `email_verified` were STRIPPED by zod
  //     on every admin sales order and now travel;
  //   - a customer whose `users.name` is NULL threw a ZodError in the browser
  //     at the Stripe confirm, and now does not. The column is nullable.
  // Safe in both directions because the server reads exactly two fields off
  // this object - api/features/orders/service.ts adminCreateSalesOrder types
  // its own parameter `{ id: string; dorado_funds?: number | null }` - and
  // both shapes carry both.
  user: UserContract,
})
export type AdminSalesOrderCheckout = z.infer<typeof adminSalesOrderCheckoutSchema>

// SalesOrderTotals lived here until 2026-08-28: the return shape of
// calculateSalesOrderPrices, the last client money math on the sales side.
// Every preview is the server's quote now (SalesOrderQuote).
