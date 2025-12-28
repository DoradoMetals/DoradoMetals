'use client'

import { useMemo } from 'react'
import type { Address } from '@/features/addresses/types'
import type { Package } from '@/features/packaging/types'
import type { Insurance } from '@/features/insurance/types'

export type GetRatesInput = {
  carrier_id: string
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
    if (!carrier_id) return null
    if (!address?.is_valid) return null
    if (!pkg?.dimensions) return null
    if (pkg.weight?.value == null) return null

    return {
      carrier_id,
      shippingType,
      address,
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
