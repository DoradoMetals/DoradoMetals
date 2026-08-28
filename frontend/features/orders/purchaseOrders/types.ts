import { z } from 'zod/v4'

import type { OrderItem as OrderItemRow } from '@dorado/contracts'

import {
  Truck,
  PackageOpen,
  CreditCard,
  Ban,
  ShieldCheck,
  LucideIcon,
} from 'lucide-react'

import {
  Address as AddressContract,
  UserAddress as UserAddressContract,
  type Order as OrderContract,
} from '@dorado/contracts'
import { pickupSchema } from '@/features/handoff/types'
import { payoutSchema } from '@/features/payouts/types'
import { packageSchema } from '@/features/packaging/types'
import { serviceSchema } from '@/features/service/types'
import { sellCartItemSchema } from '@/features/cart/types'
import { insuranceSchema } from '@/features/insurance/types'
import { User } from '@/features/users/types'

// THE ORDER IS THE ROW (wave 3). `PurchaseOrder` is a LOCAL NAME for the one
// contract shape - orders.orders verbatim plus `totals` - because this tree's
// components are per-direction and the name reads. There is no purchase
// order type any more: `direction` is the column that tells the two apart.
//
// Everything that used to hang off it is its own hook now:
//   order_items      useOrderItems(order.id)          features/orders/reads
//   address          useOrderAddress(order.id)        features/orders/reads
//   shipment /       useOrderShipments(order.id)      features/shipping
//   return_shipment    + outboundOf / returnOf
//   payout           useOrderPayouts(order.id)        features/payouts
//   carrier_pickup   useShipmentPickups(shipment.id)  features/shipping
//   user             user_id, mapped off useAdminUsers
//   the assay        useRefinerItems(order.id)        features/refiners
// and the money that was flattened onto the order - shipping_paid,
// waive_shipping_fee, waive_payout_fee, shipping_fee_actual - is on
// `totals`, which is the orders.transactions row it always came from.
export type PurchaseOrder = OrderContract

export const purchaseOrderReturnShipmentSchema = z.object({
  address: AddressContract,
  user_address: UserAddressContract.optional(),
  package: packageSchema,
  pickup: pickupSchema,
  service: serviceSchema,
  insurance: insuranceSchema,
})

export type PurchaseOrderReturnShipment = z.infer<typeof purchaseOrderReturnShipmentSchema>

export const purchaseOrderCheckoutSchema = z.object({
  address: AddressContract,
  user_address: UserAddressContract.optional(),
  package: packageSchema,
  fedexPackageToggle: z.boolean(),
  pickup: pickupSchema,
  service: serviceSchema,
  payoutValid: z.boolean(),
  payout: payoutSchema,
  confirmation: z.boolean(),
  items: z.array(sellCartItemSchema).min(1, 'At least one item is required'),
  insurance: insuranceSchema,
})

export type PurchaseOrderCheckout = z.infer<typeof purchaseOrderCheckoutSchema>

export const PurchaseOrderStatuses = [
  'In Transit',
  'Received',
  'Payment Processing',
  'Cancelled',
  'Completed',
]

export type StatusConfigEntry = {
  icon: LucideIcon
  value_label: string
}

export type StatusConfig = Record<string, StatusConfigEntry>

export const statusConfig: StatusConfig = {
  'In Transit': {
    icon: Truck,
    value_label: 'Estimate',
  },
  Received: {
    icon: PackageOpen,
    value_label: 'Estimate',
  },
  'Payment Processing': {
    icon: CreditCard,
    value_label: 'Payout',
  },
  Cancelled: {
    icon: Ban,
    value_label: '',
  },
  Completed: {
    icon: ShieldCheck,
    value_label: 'Payout',
  },
}

export interface PurchaseOrderDrawerProps {
  user_id?: string
  order_id: string
  user?: User
}

export interface PurchaseOrderDrawerHeaderProps {
  order: PurchaseOrder
  username: string
  setIsOrderActive: (open: boolean) => void
}

export interface PurchaseOrderDrawerContentProps {
  order: PurchaseOrder
}

export interface PurchaseOrderDrawerFooterProps {
  order: PurchaseOrder
}

export interface PurchaseOrderActionButtonsProps {
  order: PurchaseOrder
}

// "Gold Item 1", "Silver Item 2" - a DISPLAY label for a scrap line, which
// has no name of its own because a scrap line is a weight and a purity.
//
// IT TAKES THE METAL NAME AS DATA NOW. The composed wire carried
// item.scrap.metal, a joined string; an orders.items row carries metal_id,
// and the caller maps it against the spots reference list it already caches
// (features/orders/spots.ts does the same for spot rows). So this is handed
// `[row, metalName]` pairs and stays a pure function of them - which is why
// it is the one thing in this file with a unit test.
export type NamedScrapItem = OrderItemRow & { metal: string; name: string }

export function assignScrapItemNames(
  scrapItems: OrderItemRow[],
  metalNameOf: (metal_id: string) => string | null
): NamedScrapItem[] {
  const metalOrder = ['Gold', 'Silver', 'Platinum', 'Palladium']

  const named = scrapItems
    .map((item) => ({ item, metal: metalNameOf(item.metal_id) }))
    .filter((n): n is { item: OrderItemRow; metal: string } => !!n.metal)

  named.sort((a, b) => metalOrder.indexOf(a.metal) - metalOrder.indexOf(b.metal))

  const grouped: Record<string, typeof named> = {}
  named.forEach((n) => {
    if (!grouped[n.metal]) grouped[n.metal] = []
    grouped[n.metal].push(n)
  })

  return named.map((n) => ({
    ...n.item,
    metal: n.metal,
    name: `${n.metal} Item ${grouped[n.metal].indexOf(n) + 1}`,
  }))
}

// ProfitMetalsDict / ProfitCategoriesDict / PurchaseOrderTotals lived here
// until 2026-08-28: the shape of the LAST client money math. The profit
// breakdown is served by POST /quotes/profit_breakdown now and its shape is
// the contracts' ProfitBreakdown.