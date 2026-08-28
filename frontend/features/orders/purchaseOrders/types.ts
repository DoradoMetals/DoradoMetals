import { z } from 'zod/v4'

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
  type PurchaseOrder as PurchaseOrderContract,
  type PurchaseOrderItem as PurchaseOrderItemContract,
  type PayoutOnOrder,
} from '@dorado/contracts'
import { pickupSchema } from '@/features/handoff/types'
import { payoutSchema } from '@/features/payouts/types'
import { packageSchema } from '@/features/packaging/types'
import { serviceSchema } from '@/features/service/types'
import { sellCartItemSchema } from '@/features/cart/types'
import { insuranceSchema } from '@/features/insurance/types'
import { User } from '@/features/users/types'

// EIGHTH CONVERTED FEATURE (2026-08-28) - the last one. The order IS the
// contracts shape: `number` / `status` where the legacy wire said
// order_number / purchase_order_status, money nested as `totals`, the
// address a SNAPSHOT (postal facts plus recipient_name), embedded products
// speaking name/description/type and order spots name/ask/bid. The whole
// seam layer (orderSpots / orderProducts / orderAddresses) died with this -
// there is nothing left to map.
export type PurchaseOrderItem = PurchaseOrderItemContract

// The contract's PayoutSlotOnOrder is built by mapping nullability over
// PayoutOnOrder at runtime, which erases the field types to `unknown` in
// inference. Same shape, stated statically: every field, nullable - an order
// with no payout row carries an object of nulls, not a null.
export type PayoutSlot = { [K in keyof PayoutOnOrder]: PayoutOnOrder[K] | null }

export type PurchaseOrder = Omit<PurchaseOrderContract, 'payout'> & {
  payout: PayoutSlot
}

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

export function assignScrapItemNames(scrapItems: PurchaseOrderItem[]): PurchaseOrderItem[] {
  const metalOrder = ['Gold', 'Silver', 'Platinum', 'Palladium']

  const validScrapItems = scrapItems.filter((item) => item.scrap?.metal)

  validScrapItems.sort((a, b) => {
    const indexA = metalOrder.indexOf(a.scrap!.metal!)
    const indexB = metalOrder.indexOf(b.scrap!.metal!)
    return indexA - indexB
  })

  const grouped: Record<string, PurchaseOrderItem[]> = {}
  validScrapItems.forEach((item) => {
    const metal = item.scrap!.metal!
    if (!grouped[metal]) grouped[metal] = []
    grouped[metal].push(item)
  })

  return validScrapItems.map((item) => {
    const metal = item.scrap!.metal!
    const group = grouped[metal]
    const index = group.indexOf(item)

    return {
      ...item,
      scrap: {
        ...item.scrap!,
        name: `${metal} Item ${index + 1}`,
      },
    }
  })
}

// ProfitMetalsDict / ProfitCategoriesDict / PurchaseOrderTotals lived here
// until 2026-08-28: the shape of the LAST client money math. The profit
// breakdown is served by POST /quotes/profit_breakdown now and its shape is
// the contracts' ProfitBreakdown.