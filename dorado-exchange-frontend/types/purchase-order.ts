import { boolean, z } from 'zod'
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
  offer_sent_at?: Date
  offer_expires_at?: Date
  offer_status: string
  spots_locked: boolean
  offer_notes?: string
  total_price?: number
  num_rejections: number
  waive_shipping_fee: boolean
  waive_payout_fee: boolean
  return_shipping_paid: boolean
  review_created: boolean
  shipping_fee_actual?: number
  refiner_fee?: number
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
  text_color: string
  background_color: string
  hover_background_color: string
  muted_color: string
  border_color: string
  stroke_color: string
  icon: LucideIcon
  value_label: string
  gradient: string
}

export type StatusConfig = Record<string, StatusConfigEntry>

export const statusConfig: StatusConfig = {
  'In Transit': {
    background_color: 'bg-cyan-300',
    hover_background_color: 'hover:bg-cyan-300',
    muted_color: 'hover:bg-cyan-300/20',
    text_color: 'text-cyan-300',
    border_color: 'border-cyan-300',
    stroke_color: 'stroke-cyan-300',
    icon: Truck,
    value_label: 'Estimate',
    gradient: 'bg-gradient-to-l from-cyan-200 via-cyan-300 to-cyan-400',
  },
  Received: {
    background_color: 'bg-fuchsia-400',
    hover_background_color: 'hover:bg-fuchsia-400',
    muted_color: 'hover:bg-fuchsia-400/20',
    text_color: 'text-fuchsia-400',
    border_color: 'border-fuchsia-400',
    stroke_color: 'stroke-fuchsia-400',
    icon: PackageOpen,
    value_label: 'Estimate',
    gradient: 'bg-gradient-to-l from-fuchsia-300 via-fuchsia-400 to-fuchsia-500',
  },
  'Offer Sent': {
    background_color: 'bg-yellow-400',
    hover_background_color: 'hover:bg-yellow-400',
    muted_color: 'hover:bg-yellow-400/20',
    text_color: 'text-yellow-400',
    border_color: 'border-yellow-400',
    stroke_color: 'stroke-yellow-400',
    icon: Hourglass,
    value_label: 'Offer',
    gradient: 'bg-gradient-to-l from-yellow-300 via-yellow-400 to-yellow-500',
  },
  Accepted: {
    background_color: 'bg-orange-500',
    hover_background_color: 'hover:bg-orange-500',
    muted_color: 'hover:bg-orange-500/20',
    text_color: 'text-orange-500',
    border_color: 'border-orange-500',
    stroke_color: 'stroke-orange-500',
    icon: Handshake,
    value_label: 'Payout',
    gradient: 'bg-gradient-to-l from-orange-400 via-orange-500 to-orange-600',
  },
  Rejected: {
    background_color: 'bg-rose-400',
    hover_background_color: 'hover:bg-rose-400',
    muted_color: 'hover:bg-rose-400/20',
    text_color: 'text-rose-400',
    border_color: 'border-rose-400',
    stroke_color: 'stroke-rose-400',
    icon: X,
    value_label: 'Offer',
    gradient: 'bg-gradient-to-l from-rose-300 via-rose-400 to-rose-500',
  },
  'Payment Processing': {
    background_color: 'bg-sky-600',
    hover_background_color: 'hover:bg-sky-600',
    muted_color: 'hover:bg-sky-600/20',
    text_color: 'text-sky-600',
    border_color: 'border-sky-600',
    stroke_color: 'stroke-sky-600',
    icon: CreditCard,
    value_label: 'Payout',
    gradient: 'bg-gradient-to-l from-sky-500 via-sky-600 to-sky-700',
  },
  Cancelled: {
    background_color: 'bg-red-600',
    hover_background_color: 'hover:bg-red-600',
    muted_color: 'hover:bg-red-600/20',
    text_color: 'text-red-600',
    border_color: 'border-red-600',
    stroke_color: 'stroke-red-600',
    icon: Ban,
    value_label: '',
    gradient: 'bg-gradient-to-l from-red-500 via-red-600 to-red-700',
  },
  Completed: {
    background_color: 'bg-green-500',
    hover_background_color: 'hover:bg-green-500',
    muted_color: 'hover:bg-green-500/20',
    text_color: 'text-green-500',
    border_color: 'border-green-500',
    stroke_color: 'stroke-green-500',
    icon: ShieldCheck,
    value_label: 'Payout',
    gradient: 'bg-gradient-to-l from-green-400 via-green-500 to-green-600',
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
  shipping_fee: number
  refiner_fee: number
  spot_net: number
  total_profit: number
}

export interface PurchaseOrderTotals {
  refiner: ProfitCategoriesDict
  dorado: ProfitCategoriesDict
  customer: ProfitCategoriesDict
}
