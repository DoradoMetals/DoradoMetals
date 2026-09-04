import { z } from 'zod/v4'
import { BullionAdmin, BullionGroup, BullionStorefront, RefinerRead } from "@dorado/contracts";

// THE CATALOGUE ROW IS THE CONTRACT, and so is the GROUP it comes in. The
// server decides which member of a family is the headline row and what order
// the siblings are offered in - four screens used to sort by `content` for
// themselves, and `groupProducts`, which lived here, disagreed with all of
// them about the default.
//
// `Product` and `ProductGroup` are kept as the names the surfaces other lanes
// own already import. They are aliases of the contract and nothing more.
export type Product = BullionStorefront
export type ProductGroup = BullionGroup

// The admin row, under the name the interim admin surfaces already import.
export type AdminProduct = BullionAdmin

// A supplier is a refiner: an organization with a role.
export type Supplier = RefinerRead

// Parsed on the checkout path, so it is the contract's shape and `satisfies`
// pins it: a contract change fails typecheck here rather than silently
// rejecting checkouts at runtime.
export const productSchema = BullionStorefront satisfies z.ZodType<Product>

// WHICH FILTER IS SELECTED IS UI STATE; the filtered RESULT is the server's.
// These are the query params of GET /products, spelled once for the store
// that holds the selection.
export interface ProductFilters {
  metal?: string
  category?: string
  type?: string
  search?: string
  sort?: 'name' | 'content' | 'newest'
}
