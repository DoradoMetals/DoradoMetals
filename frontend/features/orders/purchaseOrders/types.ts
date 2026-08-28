import { z } from 'zod'

import {
  Truck,
  PackageOpen,
  X,
  CreditCard,
  Ban,
  ShieldCheck,
  Hourglass,
  Handshake,
  LucideIcon,
} from 'lucide-react'

import { Address, addressSchema } from '@/features/addresses/types'
import { CarrierPickup, pickupSchema } from '@/features/handoff/types'
import { Payout, payoutSchema } from '@/features/payouts/types'
import { packageSchema } from '@/features/packaging/types'
import { serviceSchema } from '@/features/service/types'
import { sellCartItemSchema } from '@/features/cart/types'
import { Scrap } from '@/features/scrap/types'
import { Product } from '@/features/products/types'
import { insuranceSchema } from '@/features/insurance/types'
import { User } from '@/features/users/types'
import { Shipment } from '@/features/shipping/types'
import { OrderProduct } from '@/features/orders/orderProducts'

export interface PurchaseOrderItem {
  item_type: string
  id: string
  purchase_order_id: string
  scrap?: Scrap
  // The ORDERS wire's embedded product - legacy names until orders converts.
  product?: OrderProduct
  quantity: number
  price?: number
  confirmed: boolean
  premium?: number
  refiner_premium?: number
}

export interface PurchaseOrderMetal {
  id: string
  purchase_order_id: string
  type: string
  spot: number
  created_at: Date
}

export interface PurchaseOrder {
  id: string
  order_number: number
  purchase_order_status: string
  notes: string
  created_at: Date
  updated_at: Date
  user_id: string
  order_items: PurchaseOrderItem[]
  address: Address
  shipment: Shipment
  return_shipment: Shipment
  carrier_pickup?: CarrierPickup
  payout: Payout
  user: {
    user_id: string
    user_name: string
    user_email: string
  }
  spots_locked: boolean
  total_price?: number
  waive_shipping_fee: boolean
  waive_payout_fee: boolean
  return_shipping_paid: boolean
  review_created: boolean
  shipping_fee_actual?: number
  refiner_fee?: number
  pool_oz_deducted?: number
  pool_remediation?: number
}

export const purchaseOrderReturnShipmentSchema = z.object({
  address: addressSchema,
  package: packageSchema,
  pickup: pickupSchema,
  service: serviceSchema,
  insurance: insuranceSchema,
})

export type PurchaseOrderReturnShipment = z.infer<typeof purchaseOrderReturnShipmentSchema>

export const purchaseOrderCheckoutSchema = z.object({
  address: addressSchema,
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
  'Offer Sent',
  'Accepted',
  'Rejected',
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
  'Offer Sent': {
    icon: Hourglass,
    value_label: 'Offer',
  },
  Accepted: {
    icon: Handshake,
    value_label: 'Payout',
  },
  Rejected: {
    icon: X,
    value_label: 'Offer',
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

export interface ProfitMetalsDict {
  gold: {
    content: number
    percentage: number
    profit: number
  }
  silver: {
    content: number
    percentage: number
    profit: number
  }
  platinum: {
    content: number
    percentage: number
    profit: number
  }
  palladium: {
    content: number
    percentage: number
    profit: number
  }
}

export interface ProfitCategoriesDict {
  scrap: ProfitMetalsDict
  bullion: ProfitMetalsDict
  total: ProfitMetalsDict
  shipping_net: number
  refiner_fee_net: number
  spot_net: number
  total_profit: number
}

export interface PurchaseOrderTotals {
  refiner: ProfitCategoriesDict
  dorado: ProfitCategoriesDict
  customer: ProfitCategoriesDict
}