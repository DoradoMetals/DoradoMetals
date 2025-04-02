import { Product } from '@/types/product'
import { Scrap } from '@/types/scrap'

export type SellCartItem =
  | { type: 'product'; data: Product & { quantity?: number } }
  | { type: 'scrap'; data: Scrap & { quantity?: number } }