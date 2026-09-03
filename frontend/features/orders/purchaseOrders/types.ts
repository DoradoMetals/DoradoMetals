import { z } from 'zod/v4'


import {
  Truck,
  PackageOpen,
  CreditCard,
  Ban,
  ShieldCheck,
} from 'lucide-react'

import { orders, places } from "@dorado/contracts";
import { pickupSchema } from '@/features/handoff/types'
import { payoutSchema } from '@/features/payouts/types'
import { packageSchema } from '@/features/packaging/types'
import { serviceSchema } from '@/features/service/types'
import { sellCartItemSchema } from '@/features/cart/types'
import { insuranceSchema } from '@/features/insurance/types'
import { User } from '@/features/users/types'

// THE SHARED HALF LIVES IN ../types.ts. Wave 3 collapsed the two directions
// into one contract shape, and these were the leftovers of the old pair: the
// order type, the return-shipment schema, the status-config types and the four
// drawer prop interfaces were declared identically in this file and in
// salesOrders/types.ts. They are declared ONCE now and re-exported here under
// the names this tree's components already use (CLAUDE.md: the frontend keeps
// local names for UI concerns).
export type { Order as PurchaseOrder } from '@/features/orders/types'
export {
  orderReturnShipmentSchema as purchaseOrderReturnShipmentSchema,
} from '@/features/orders/types'
export type {
  OrderReturnShipment as PurchaseOrderReturnShipment,
  StatusConfigEntry,
  StatusConfig,
  OrderDrawerProps as PurchaseOrderDrawerProps,
  OrderDrawerHeaderProps as PurchaseOrderDrawerHeaderProps,
  OrderDrawerContentProps as PurchaseOrderDrawerContentProps,
  OrderDrawerFooterProps as PurchaseOrderDrawerFooterProps,
  OrderActionButtonsProps as PurchaseOrderActionButtonsProps,
} from '@/features/orders/types'

import type { StatusConfig } from '@/features/orders/types'

// THE CHECKOUT FORM, which stays here because it is purchase-direction FORM
// POLICY rather than a table-derived shape - deliberately stricter than the
// columns (CLAUDE.md: the frontend keeps only UI-policy schemas of its own).
export const purchaseOrderCheckoutSchema = z.object({
  address: places.addresses.Row,
  user_address: places.user_addresses.Read.optional(),
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

// "Gold Item 1", "Silver Item 2" - a DISPLAY label for a scrap line, which
// has no name of its own because a scrap line is a weight and a purity.
//
// IT TAKES THE METAL NAME AS DATA NOW. The composed wire carried
// item.scrap.metal, a joined string; an orders.items row carries metal_id,
// and the caller maps it against the spots reference list it already caches
// (features/orders/spots.ts does the same for spot rows). So this is handed
// `[row, metalName]` pairs and stays a pure function of them - which is why
// it is the one thing in this file with a unit test.
export type NamedScrapItem = orders.items.Row & { metal: string; name: string }

export function assignScrapItemNames(
  scrapItems: orders.items.Row[],
  metalNameOf: (metal_id: string) => string | null
): NamedScrapItem[] {
  const metalOrder = ['Gold', 'Silver', 'Platinum', 'Palladium']

  const named = scrapItems
    .map((item) => ({ item, metal: metalNameOf(item.metal_id) }))
    .filter((n): n is { item: orders.items.Row; metal: string } => !!n.metal)

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