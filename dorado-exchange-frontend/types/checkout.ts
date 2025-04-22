import { z } from 'zod'
import { addressSchema } from "./address";
import { packageSchema } from "./packaging";
import { serviceSchema } from './service';
import { pickupSchema } from './pickup';
import { payoutSchema } from './payout';

export const purchaseOrderCheckoutSchema = z.object({
  address: addressSchema,
  package: packageSchema,
  insured: z.boolean(),
  pickup: pickupSchema,
  service: serviceSchema,
  payoutValid: z.boolean(),
  payout: payoutSchema,
  confirmation: z.boolean(),
})

export type PurchaseOrderCheckout = z.infer<typeof purchaseOrderCheckoutSchema>