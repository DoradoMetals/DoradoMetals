import { z } from 'zod'
import { Address, addressSchema } from "./address";
import { packageSchema } from "./packaging";
import { serviceSchema } from './service';
import { pickupSchema } from './pickup';
import { Payout, payoutSchema } from './payout';
import { sellCartItemSchema } from './sellCart';
import { CarrierPickup, Shipment } from './shipments';
import {
  Truck,
  PackageOpen,
  FlaskConical,
  CheckCheck,
  X,
  CreditCard,
  Ban,
  ShieldCheck,
} from 'lucide-react';
import { Scrap } from './scrap';
import { Product } from './product';
import { Dispatch } from 'react';
import { User } from './user';

export interface PurchaseOrderItem {
  item_type: string,
  id: string,
  purchase_order_id: string,
  scrap?: Scrap,
  product?: Product,
  quantity: number,
  price: number,
}

export interface PurchaseOrder {
  id: string,
  order_number: number,
  purchase_order_status: string,
  notes: string,
  created_at: Date,
  updated_at: Date,
  user_id: string,
  order_items: PurchaseOrderItem[],
  address: Address,
  shipment: Shipment,
  carrier_pickup?: CarrierPickup,
  payout: Payout,
}

export const purchaseOrderCheckoutSchema = z.object({
  address: addressSchema,
  package: packageSchema,
  insured: z.boolean(),
  pickup: pickupSchema,
  service: serviceSchema,
  payoutValid: z.boolean(),
  payout: payoutSchema,
  confirmation: z.boolean(),
  items: z.array(sellCartItemSchema).min(1, 'At least one item is required'),
})

export type PurchaseOrderCheckout = z.infer<typeof purchaseOrderCheckoutSchema>

export const statusConfig: Record<
  string,
  {
    text_color: string;
    background_color: string;
    icon: React.ElementType;
    value_label: string;
  }
> = {
  'In Transit': {
    background_color: 'bg-cyan-300',
    text_color: 'text-cyan-300',
    icon: Truck,
    value_label: 'Estimate',
  },
  Unsettled: {
    background_color: 'bg-fuchsia-400',
    text_color: 'text-fuchsia-400',
    icon: PackageOpen,
    value_label: 'Estimate',
  },
  Filled: {
    background_color: 'bg-yellow-400',
    text_color: 'text-yellow-400',
    icon: FlaskConical,
    value_label: 'Offer',
  },
  Accepted: {
    background_color: 'bg-orange-500',
    text_color: 'text-orange-500',
    icon: CheckCheck,
    value_label: 'Payout',
  },
  Rejected: {
    background_color: 'bg-rose-400',
    text_color: 'text-rose-400',
    icon: X,
    value_label: 'Offer',
  },
  Settled: {
    background_color: 'bg-sky-600',
    text_color: 'text-sky-600',
    icon: CreditCard,
    value_label: 'Payout',
  },
  Cancelled: {
    background_color: 'bg-red-600',
    text_color: 'text-red-600',
    icon: Ban,
    value_label: '',
  },
  Completed: {
    background_color: 'bg-green-500',
    text_color: 'text-green-500',
    icon: ShieldCheck,
    value_label: 'Payout',
  },
}

export interface PurchaseOrderDrawerProps {
  order: PurchaseOrder
  user: User
  isOrderActive: boolean
  setIsOrderActive: Dispatch<React.SetStateAction<boolean>>
}

export interface PurchaseOrderDrawerHeaderProps {
  order: PurchaseOrder
  username: string
}

export interface PurchaseOrderDrawerContentProps {
  order: PurchaseOrder
}

export interface PurchaseOrderDrawerFooterProps {
  order: PurchaseOrder
}

function getValueLabel(status: string): string {
  switch (status) {
    case 'In Transit':
    case 'Unsettled':
      return 'Estimate'
    case 'Filled':
    case 'Rejected':
      return 'Offer'
    case 'Accepted':
    case 'Settled':
    case 'Completed':
      return 'Payout'
    case 'Cancelled':
    default:
      return 'N/A'
  }
}


