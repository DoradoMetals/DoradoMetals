import { z } from 'zod'
import { Address, addressSchema } from './address'
import { packageSchema } from './packaging'
import { serviceSchema } from './service'
import { pickupSchema } from './pickup'
import { Payout, payoutSchema } from './payout'
import { sellCartItemSchema } from './sellCart'
import { CarrierPickup, Shipment } from './shipments'
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
import { Scrap } from './scrap'
import { Product } from './product'
import { User } from './user'
import { insuranceSchema } from './insurance'

export interface PurchaseOrderItem {
  item_type: string
  id: string
  purchase_order_id: string
  scrap?: Scrap
  product?: Product
  quantity: number
  price?: number
  confirmed: boolean
  bullion_premium?: number
}

export interface PurchaseOrderMetal {
  id: string
  purchase_order_id: string
  type: string
  spot: number
  scrap_percentage: number
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
  carrier_pickup?: CarrierPickup
  payout: Payout
  user: {
    user_name: string
    user_email: string
  }
}

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
  'Unsettled',
  'Filled',
  'Accepted',
  'Rejected',
  'Settled',
  'Cancelled',
  'Completed',
]

export type StatusConfigEntry = {
  text_color: string
  background_color: string
  hover_background_color: string
  border_color: string
  icon: LucideIcon
  value_label: string
}

export type StatusConfig = Record<string, StatusConfigEntry>

export const statusConfig: StatusConfig = {
  'In Transit': {
    background_color: 'bg-cyan-300',
    hover_background_color: 'hover:bg-cyan-300',
    text_color: 'text-cyan-300',
    border_color: 'border-cyan-300',
    icon: Truck,
    value_label: 'Estimate',
  },
  Unsettled: {
    background_color: 'bg-fuchsia-400',
    hover_background_color: 'hover:bg-fuchsia-400',
    text_color: 'text-fuchsia-400',
    border_color: 'border-fuchsia-400',
    icon: PackageOpen,
    value_label: 'Estimate',
  },
  Filled: {
    background_color: 'bg-yellow-400',
    hover_background_color: 'hover:bg-yellow-400',
    text_color: 'text-yellow-400',
    border_color: 'border-yellow-400',
    icon: Hourglass,
    value_label: 'Offer',
  },
  Accepted: {
    background_color: 'bg-orange-500',
    hover_background_color: 'hover:bg-orange-500',
    text_color: 'text-orange-500',
    border_color: 'border-orange-500',
    icon: Handshake,
    value_label: 'Payout',
  },
  Rejected: {
    background_color: 'bg-rose-400',
    hover_background_color: 'hover:bg-rose-400',
    text_color: 'text-rose-400',
    border_color: 'border-rose-400',
    icon: X,
    value_label: 'Offer',
  },
  Settled: {
    background_color: 'bg-sky-600',
    hover_background_color: 'hover:bg-sky-600',
    text_color: 'text-sky-600',
    border_color: 'border-sky-600',
    icon: CreditCard,
    value_label: 'Payout',
  },
  Cancelled: {
    background_color: 'bg-red-600',
    hover_background_color: 'hover:bg-red-600',
    text_color: 'text-red-600',
    border_color: 'border-red-600',
    icon: Ban,
    value_label: '',
  },
  Completed: {
    background_color: 'bg-green-500',
    hover_background_color: 'hover:bg-green-500',
    text_color: 'text-green-500',
    border_color: 'border-green-500',
    icon: ShieldCheck,
    value_label: 'Payout',
  },
}

export interface PurchaseOrderDrawerProps {
  user_id?: string
  order_id: string,
  user?: User
}

export interface PurchaseOrderDrawerHeaderProps {
  order: PurchaseOrder
  username: string
  setIsOrderActive: (open: boolean) => void // <-- add this
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

  // Only consider items that contain a scrap object with a valid metal
  const validScrapItems = scrapItems.filter((item) => item.scrap?.metal)

  // Sort by metal order
  validScrapItems.sort((a, b) => {
    const indexA = metalOrder.indexOf(a.scrap!.metal!)
    const indexB = metalOrder.indexOf(b.scrap!.metal!)
    return indexA - indexB
  })

  // Group by metal
  const grouped: Record<string, PurchaseOrderItem[]> = {}
  validScrapItems.forEach((item) => {
    const metal = item.scrap!.metal!
    if (!grouped[metal]) grouped[metal] = []
    grouped[metal].push(item)
  })

  // Assign names
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