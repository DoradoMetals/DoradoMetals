'use client'

import { useMemo } from 'react'
import type { Address } from '@/features/addresses/types'
import type { Insurance } from '@/features/insurance/types'
import type { ShippingRatesInput } from '@/features/shipping/types'

// The one shape the store's checkout package actually carries: an id (from
// the offered-packages reference read, D208) plus the weight the customer's
// items add up to. Declared locally rather than importing
// features/packaging/types' `Package` interface, which has no `id` - the
// zod-inferred `packageSchema` type the store actually uses does, and this is
// the slice of it this hook needs.
type CheckoutPackage = {
  id?: string
  weight?: { value: number }
}

// THE CARRIER IS THE SERVER'S TO NAME. carrier_id used to be required here and
// checkout supplied a production uuid literal; the API resolves the carrier it
// ships with when none is given. A caller that has one still sends it.
//
// STREAMLINE B (D214 item 11): ids in, never a composed address/package
// object - `address_id` and `package_id`, plus the one genuine measurement
// nothing else stores (`weight`). `declaredValue` is a plain number on the
// wire; the form keeps `{amount, currency}` (features/insurance/types.ts),
// so `.amount` is what travels.
export function useGetRatesInput({
  carrier_id,
  address,
  package: pkg,
  shippingType = 'Inbound',
  pickupLabel,
  insurance,
}: {
  carrier_id?: string
  address?: Address
  package?: CheckoutPackage
  shippingType?: 'Inbound' | 'Outbound' | 'Return'
  pickupLabel?: string
  insurance?: Insurance
}): ShippingRatesInput | null {
  return useMemo(() => {
    // NO QUOTE UNTIL THE HANDOFF IS KNOWN, and this guard replaces one that
    // used to read `if (!carrier_id) return null`.
    //
    // pickupType changes what the carrier quotes, and the default used to be a
    // FedEx enum spelled in checkoutStepper - always present, so a rate could
    // be fetched on the first render. It comes from the reference read now, so
    // for one tick there is no handoff to quote against, and `pickupType: ''`
    // would ask the carrier to rate a handover it does not recognise. Waiting a
    // tick is the correct trade against quoting the wrong thing.
    if (!pickupLabel) return null
    if (!address?.is_valid) return null
    if (!pkg?.id) return null
    if (pkg.weight?.value == null) return null

    return {
      ...(carrier_id ? { carrier_id } : {}),
      shippingType,
      address_id: address.id,
      package_id: pkg.id,
      weight: pkg.weight.value,
      // The carrier handoff's own code, received from GET /shipping/handoffs
      // and handed straight back. This tree does not interpret it.
      pickupType: pickupLabel ?? '',
      ...(insurance?.insured && insurance.declaredValue
        ? { declaredValue: insurance.declaredValue.amount }
        : {}),
    }
  }, [
    carrier_id,
    shippingType,
    address,
    address?.is_valid,
    pkg?.id,
    pkg?.weight?.value,
    pickupLabel,
    insurance?.insured,
    insurance?.declaredValue,
  ])
}
