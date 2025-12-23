import React from 'react'
import { Address } from '@/features/addresses/types'
import formatPhoneNumber from '@/shared/utils/formatPhoneNumber'

interface AddressDisplayProps {
  address: Address
}

export default function AddressDisplay({ address }: AddressDisplayProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between w-full gap-1">
          <span className="text-base sm:text-lg md:text-xl text-neutral-800 font-medium">{address?.name}</span>
          <span className="text-sm sm:text-base md:text-lg text-neutral-500 whitespace-nowrap">
            {formatPhoneNumber(address?.phone_number ?? '')}
          </span>
        </div>

        <div className="mt-1 text-xs sm:text-sm md:text-base text-neutral-700 leading-tight tracking-wide">
          {address?.line_1} {address?.line_2} {address?.city}, {address?.state} {address?.zip}
        </div>
      </div>
    </div>
  )
}
