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

import { packageSchema } from '@/features/packaging/types'
import { pickupSchema } from '@/features/handoff/types'
import { serviceSchema } from '@/features/service/types'
import { insuranceSchema } from '@/features/insurance/types'
import { User } from '@/features/users/types'
import { Address, AdminUser, UserAddressRead } from "@dorado/contracts";

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
  OrderViewProps as SalesOrderDrawerContentProps,
  OrderViewProps as SalesOrderDrawerFooterProps,
  OrderViewProps as SalesOrderActionButtonsProps,
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

// THE METHOD ROWS COME FROM THE DATABASE NOW (D207). `paymentOptions` - six
// hardcoded records duplicating payments.methods field for field - is gone;
// consumers read usePaymentMethods('sale') (features/payments/queries) and
// look rows up by `type`, which speaks the same vocabulary as this enum
// (migration 109 reconciled the two rows that did not). The enum stays: it is
// the form state's vocabulary rather than data.
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

// THE SALES CHECKOUT'S OWN FORM STATE. The basket is not a field of it: the
// lines live in the checkout items store and on checkout.items (ruling 50),
// and the schema that parsed a whole array of catalogue products as if it
// were the basket died with them.
export type SaleCheckoutForm = {
  address: Address
  user_address?: UserAddressRead
  service: SalesOrderService
  payment_method?: PaymentMethodType
}

// The admin create adds ONE thing a customer never picks: WHOSE order it is.
// `order_metals` used to sit here too - the spots the drawer let an admin
// type over - and nothing ever sent them: both create endpoints price from
// the server's own live feed, and the placement is one checkout_id.
export type AdminSaleCheckoutForm = SaleCheckoutForm & {
  user: AdminUser
}

// SalesOrderTotals lived here until 2026-08-28: the return shape of
// calculateSalesOrderPrices, the last client money math on the sales side.
// Every preview is the server's quote now (SalesOrderQuote).
