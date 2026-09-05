import { BullionAdmin, BullionGroup, BullionStorefront, RefinerRead } from "@dorado/contracts";

export type Product = BullionStorefront
export type ProductGroup = BullionGroup

export type AdminProduct = BullionAdmin

export type Supplier = RefinerRead

export interface ProductFilters {
  metal?: string
  category?: string
  type?: string
  search?: string
  sort?: 'name' | 'content' | 'newest'
}
