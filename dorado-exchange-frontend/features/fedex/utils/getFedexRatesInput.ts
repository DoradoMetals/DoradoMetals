import { useMemo } from 'react'
import { Address } from '@/features/addresses/types'
import { Package } from '@/features/packaging/types'
import { PickupType } from '@/features/handoff/types'
import { Insurance } from '@/features/insurance/types'
import { FedexRateInput, formatFedexRatesAddress } from '@/features/fedex/types'

interface Props {
  address?: Address
  package?: Package
  shippingType?: 'Inbound' | 'Outbound' | 'Return'
  pickupLabel?: string
  insurance?: Insurance
}

export default function getFedexRatesInput({
  address,
  package: pkg,
  shippingType = 'Inbound',
  pickupLabel,
  insurance,
}: Props): FedexRateInput | null {
  return useMemo<FedexRateInput | null>(() => {
    if (
      !address?.is_valid ||
      !pkg?.dimensions ||
      pkg.weight?.value == null
    ) {
      return null
    }

    const input: FedexRateInput = {
      shippingType,
      customerAddress: formatFedexRatesAddress(address),
      pickupType: pickupLabel ?? 'DROPOFF_AT_FEDEX_LOCATION',
      packageDetails: {
        weight: pkg.weight,
        dimensions: pkg.dimensions,
      },
      ...(insurance?.insured && insurance.declaredValue
        ? { declaredValue: insurance.declaredValue }
        : {}),
    }

    return input
  },
  [
    address,
    address?.is_valid,
    pkg?.dimensions,
    pkg?.weight?.value,
    shippingType,
    pickupLabel,
    insurance?.insured,
    insurance?.declaredValue,
  ])
}
