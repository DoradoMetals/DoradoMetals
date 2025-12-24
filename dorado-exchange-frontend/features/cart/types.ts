import { Product, productSchema } from '@/features/products/types'
import { Scrap, scrapSchema } from '@/features/scrap/types'
import { z } from 'zod';

export type SellCartItem =
  | { type: 'product'; data: Product & { quantity?: number } }
  | { type: 'scrap'; data: Scrap & { quantity?: number } }

  export const sellCartItemSchema = z.union([
    z.object({
      type: z.literal('product'),
      data: productSchema,
    }),
    z.object({
      type: z.literal('scrap'),
      data: scrapSchema,
    }),
  ])