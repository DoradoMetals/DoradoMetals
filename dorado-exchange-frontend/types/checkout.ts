import { z } from 'zod'

import { Address, addressSchema } from "./address";
import { Package } from "./packaging";

// export interface PurchaseOrderCheckout {
//   address: Address,
//   package: Package,
//   pickup_type: string,
//   pickup_time: Date,
//   shipping_service: string,
//   payment: string,
//   confirmation: boolean,
// }

const packageSchema = z.object({
  weight: z.object({
    units: z.literal('LB'),
    value: z.number().min(0.1),
  }),
  dimensions: z.object({
    length: z.number().positive(),
    width: z.number().positive(),
    height: z.number().positive(),
    units: z.literal('IN'),
  }),
})

export const purchaseOrderCheckoutSchema = z.object({
  address: addressSchema,
  package: packageSchema,
  pickup_type: z.enum(['FEDEX_PICKUP', 'DROPOFF_AT_FEDEX_LOCATION']),
  pickup_time: z.date(),
  shipping_service: z.string().min(1), // e.g. FEDEX_GROUND, FEDEX_OVERNIGHT
  payment: z.string().min(1), // you can later enum this if needed
  confirmation: z.boolean(),
})

export type PurchaseOrderCheckout = z.infer<typeof purchaseOrderCheckoutSchema>