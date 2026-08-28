// The address as the ORDERS and CHECKOUT wires still speak it - one flat row,
// FROM THE CONTRACTS: AddressOnOrder is the shape validate:wire proves
// against real order responses, so nothing here is hand-written.
//
// The address book converted (features/addresses/types.ts splits the postal
// address from the owner's relationship), but an address EMBEDDED in an
// order response arrives flat, and the purchase-order create and cancel
// bodies are READ flat by the API - features/purchase-orders/service.ts
// takes `address.name` as the FedEx label's personName. Same seam as
// [[orderSpots]] and [[orderProducts]]; THE WHOLE FILE DIES WITH THE
// ORDERS/CHECKOUT CONVERSION.
import type { AddressOnOrder } from '@dorado/contracts'
import type { Address, UserAddress } from '@/features/addresses/types'

export type OrderAddress = AddressOnOrder

// Down-convert a picked address AND the caller's relationship to it - two
// entities since the split - into the one flat row these bodies are read as.
export function orderAddressToWire(a: Address, ua?: UserAddress | null): OrderAddress {
  return {
    id: a.id,
    user_id: ua?.user_id ?? null,
    name: ua?.label ?? null,
    is_default: ua?.default_shipping ?? null,
    line_1: a.line_1,
    line_2: a.line_2,
    city: a.city,
    state: a.state,
    zip: a.zip,
    country: a.country,
    country_code: a.country_code,
    phone_number: a.phone_number,
    is_residential: a.is_residential,
    is_valid: a.is_valid,
    created_at: a.created_at,
    updated_at: a.updated_at,
  }
}
