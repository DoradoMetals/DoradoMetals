import { BullionAdmin, BullionGroup, BullionStorefront, RefinerView } from '@dorado/contracts'

export type Product = BullionStorefront
export type ProductGroup = BullionGroup

export type AdminProduct = BullionAdmin

export type Supplier = RefinerView

export interface ProductFilters {
  metal?: string
  category?: string
  type?: string
  search?: string
  sort?: 'name' | 'content' | 'newest'
}
