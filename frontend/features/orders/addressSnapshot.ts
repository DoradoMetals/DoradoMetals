import type { Address } from "@dorado/contracts";
import type { UserAddress } from '@/features/addresses/types'

// THE ADDRESS A CHECKOUT SENDS, and it is a REQUEST shape rather than a read.
//
// Ruling 10 draws the line here: "the frontend sends IDs - plus genuine user
// input (form data, inputs) - and gets data back... creates keep their form
// blocks - that IS user input." An order's address is chosen by the customer
// at checkout, so it goes UP as a document; it comes BACK as
// useOrderAddress(order_id), a places.addresses row the server resolved.
//
// It was the OrderAddressSnapshot contract until wave 3. That contract
// described the composed order's `address` member, which no longer exists -
// and a contract is a TABLE-derived shape, which this is not: it is the
// checkout's picked pair (the address-book row plus the caller's
// relationship to it) collapsed into the immutable postal facts the API
// stores and prints on the label. Two of its fields have no column anywhere:
// `address_id` is the BOOK id the API resolves against, and
// `recipient_name` is who the parcel is for.
//
// One copy, used by both directions' create mutations and by the cancel op's
// return shipment - it was written out three times before.
export type OrderAddressInput = {
  address_id: string | null
  recipient_name: string | null
  line_1: string | null
  line_2: string | null
  city: string | null
  state: string | null
  country: string | null
  country_code: string | null
  zip: string | null
  phone_number: string | null
  is_residential: boolean | null
  is_valid: boolean | null
}

export const toAddressSnapshot = (
  a: Address,
  ua?: UserAddress | null
): OrderAddressInput => ({
  address_id: a.id ?? null,
  // The relationship's label is who receives the parcel - the API reads it
  // for the FedEx label's personName.
  recipient_name: ua?.label ?? null,
  line_1: a.line_1,
  line_2: a.line_2,
  city: a.city,
  state: a.state,
  country: a.country,
  country_code: a.country_code,
  zip: a.zip,
  phone_number: a.phone_number,
  is_residential: a.is_residential,
  is_valid: a.is_valid,
})
