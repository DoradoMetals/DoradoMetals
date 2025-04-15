import { boolean, z } from 'zod'
import { addressSchema } from "./address";
import { packageSchema } from "./packaging";
import { serviceSchema } from './service';



export const purchaseOrderCheckoutSchema = z.object({
  address: addressSchema,
  package: packageSchema,
  insuranceToggle: z.boolean(),
  pickup_type: z.enum(['FEDEX_PICKUP', 'DROPOFF_AT_FEDEX_LOCATION']),
  pickup_time: z.date(),
  service: serviceSchema, // e.g. FEDEX_GROUND, FEDEX_OVERNIGHT
  payment: z.string().min(1), // you can later enum this if needed
  confirmation: z.boolean(),
})

export type PurchaseOrderCheckout = z.infer<typeof purchaseOrderCheckoutSchema>