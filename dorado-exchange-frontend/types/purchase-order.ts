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
    icon: React.ElementType; // still a component, not JSX
  }
> = {
  'In Transit': {
    background_color: 'bg-cyan-300',
    text_color: 'text-cyan-300',
    icon: Truck,
  },
  Unsettled: {
    background_color: 'bg-fuchsia-400',
    text_color: 'text-fuchsia-400',
    icon: PackageOpen,
  },
  Filled: {
    background_color: 'bg-yellow-400',
    text_color: 'text-yellow-400',
    icon: FlaskConical,
  },
  Accepted: {
    background_color: 'bg-orange-500',
    text_color: 'text-orange-500',
    icon: CheckCheck,
  },
  Rejected: {
    background_color: 'bg-rose-400',
    text_color: 'text-rose-400',
    icon: X,
  },
  Settled: {
    background_color: 'bg-sky-600',
    text_color: 'text-sky-600',
    icon: CreditCard,
  },
  Cancelled: {
    background_color: 'bg-red-600',
    text_color: 'text-red-600',
    icon: Ban,
  },
  Completed: {
    background_color: 'bg-green-500',
    text_color: 'text-green-500',
    icon: ShieldCheck,
  },
};

