import { z } from 'zod'
import { addressSchema } from "./address";
import { packageSchema } from "./packaging";
import { serviceSchema } from './service';
import { pickupSchema } from './pickup';
import { payoutSchema } from './payout';
import { sellCartItemSchema } from './sellCart';

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