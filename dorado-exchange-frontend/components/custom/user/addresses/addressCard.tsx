'use client'

import { Address } from '@/types/address'
import { Button } from '@/components/ui/button'
import { useState } from 'react'
import { useDeleteAddress, useSetDefaultAddress } from '@/lib/queries/useAddresses'
import formatPhoneNumber from '@/utils/formatPhoneNumber'
import { BookUser, MapPin, Phone, Star } from 'lucide-react'
import AddressModal from './addressDialog'
import { useFedExLabel } from '@/lib/queries/shipping/useFedex'
import { formatFedexLabelAddress } from '@/types/shipping'

export default function AddressCard({ address }: { address: Address }) {
  const deleteAddressMutation = useDeleteAddress()
  const setDefaultAddressMutation = useSetDefaultAddress()
  const [open, setOpen] = useState(false)

  const fedexLabelMutation = useFedExLabel()

  const handleGenerateLabel = () => {
    fedexLabelMutation.mutate(
      {
        order_id: '1dcc2738-c4d3-4843-b00b-72225568fa90',
        customerName: address.name,
        customerPhone: address.phone_number,
        customerAddress: formatFedexLabelAddress(address),
        shippingType: 'Inbound',
        pickupType: 'DROPOFF_AT_FEDEX_LOCATION',
        serviceType: 'FEDEX_GROUND',
        packageDetails: {
          sequenceNumber: 1,
          weight: { units: 'LB', value: 2 },
          dimensions: { length: 10, width: 6, height: 4, units: 'IN' },
        },
      },
      {
        onSuccess: (data) => {
          console.log('Label generated:', data)
        },
        onError: (err) => {
          console.error('Label error:', err)
        },
      }
    )
  }

  return (
    <div className="shadow-md p-5 bg-card rounded-lg border-t-2 border-primary">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <BookUser size={16} className="text-neutral-600" />
          <div className="title-text">{address.name}</div>
          <div className="ml-auto">
            {!address.is_default ? null : <Star size={20} className="text-secondary" />}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Phone size={16} className="text-neutral-600" />
          <div className="secondary-text">{formatPhoneNumber(address.phone_number)}</div>
        </div>
        <div className="flex items-center gap-2">
          <MapPin size={16} className="text-neutral-600" />
          <div className="secondary-text">
            <p>
              {address.line_1} {address.line_2 && `, ${address.line_2}`}
              {`${address.city}, ${address.state}, ${address.zip}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="link"
            effect="hoverUnderline"
            size="sm"
            className="text-primary"
            onClick={() => handleGenerateLabel()}
          >
            Label
          </Button>
          <Button
            variant="link"
            effect="hoverUnderline"
            size="sm"
            className="text-primary"
            onClick={() => deleteAddressMutation.mutate(address)}
          >
            Remove
          </Button>
          <Button
            variant="link"
            effect="hoverUnderline"
            size="sm"
            className="text-primary"
            onClick={() => setOpen(true)}
          >
            Edit
          </Button>
          {!address.is_default ? (
            <Button
              variant="link"
              effect="hoverUnderline"
              size="sm"
              className="ml-auto text-primary"
              onClick={() => setDefaultAddressMutation.mutate(address)}
            >
              Set Default
            </Button>
          ) : null}
        </div>
      </div>
      <AddressModal address={address} open={open} setOpen={setOpen} title="Edit" />
    </div>
  )
}
