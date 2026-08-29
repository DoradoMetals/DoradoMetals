'use client'

import { useMemo } from 'react'
import type { Address } from '@/features/addresses/types'
import type { Package } from '@/features/packaging/types'
import type { Insurance } from '@/features/insurance/types'

// THE CARRIER IS THE SERVER'S TO NAME. carrier_id used to be required here and
// checkout supplied a production uuid literal; the API resolves the carrier it
// ships with when none is given. A caller that has one still sends it.
export type GetRatesInput = {
  carrier_id?: string
  shippingType: 'Inbound' | 'Outbound' | 'Return'
  address: Address
  pkg: {
    weight: { units: 'LB' | 'KG'; value: number }
    dimensions: { length: number; width: number; height: number; units: 'IN' | 'CM' }
  }
  pickupType: string
  declaredValue?: { amount: number; currency: string }
}

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
  package?: Package
  shippingType?: 'Inbound' | 'Outbound' | 'Return'
  pickupLabel?: string
  insurance?: Insurance
}): GetRatesInput | null {
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
    if (!pkg?.dimensions) return null
    if (pkg.weight?.value == null) return null

    return {
      ...(carrier_id ? { carrier_id } : {}),
      shippingType,
      address,
      // The carrier handoff's own code, received from GET /shipping/handoffs
      // and handed straight back. This tree does not interpret it.
      pickupType: pickupLabel ?? '',
      pkg: {
        weight: pkg.weight,
        dimensions: pkg.dimensions,
      },
      ...(insurance?.insured && insurance.declaredValue
        ? { declaredValue: insurance.declaredValue }
        : {}),
    }
  }, [
    carrier_id,
    shippingType,
    address,
    address?.is_valid,
    pkg?.dimensions,
    pkg?.weight?.value,
    pickupLabel,
    insurance?.insured,
    insurance?.declaredValue,
  ])
}
