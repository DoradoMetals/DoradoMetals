'use client'

import { useState } from 'react'
import { RadioGroup, RadioOption, Switch } from '@dorado/components'
import { Inbox, Package2, Package as PackageIcon } from '@dorado/icons'
import type { FulfillmentView, Package } from '@dorado/contracts'
import { useOfferedPackages, usePatchFulfillment } from '@/features/checkout/queries'

// The one thing that stays client-side (Jacob's standing call): a picture.
// Sized by the row's own minimum weight, so a fourth box needs no edit here.
const iconFor = (pkg: Package) => {
  const w = Number(pkg.min_weight_lb ?? 0)
  return w <= 2 ? Inbox : w <= 8 ? Package2 : PackageIcon
}

// RULING 58: the box's weight and dimensions are the server's - this sends the
// id and nothing else. The FedEx-packaging switch is local component state: it
// filters the offered list and is never sent, so it is not a store field and
// certainly not a column.
export function PackageSelector({ fulfillment }: { fulfillment?: FulfillmentView }) {
  const [carrierPackaging, setCarrierPackaging] = useState(false)
  const { data: offered = [] } = useOfferedPackages()
  const patchFulfillment = usePatchFulfillment()

  const options = offered.filter((pkg) => pkg.is_carrier_packaging === carrierPackaging)
  const selected = offered.find((pkg) => pkg.id === fulfillment?.parcel?.package_id)

  return (
    <div className="space-y-2">
      <h3 className="eyebrow mb-4">Package Selection</h3>

      <div className="flex items-center justify-end gap-2 mb-4">
        <p>Use FedEx Packaging?</p>
        <Switch checked={carrierPackaging} onCheckedChange={setCarrierPackaging} />
      </div>

      <RadioGroup
        value={selected?.label ?? ''}
        onValueChange={(label) => {
          const pkg = offered.find((p) => p.label === label)
          // The PARCEL takes the id the moment it is picked (rulings 69/70).
          if (pkg && fulfillment) {
            patchFulfillment.mutate({
              fulfillment_id: fulfillment.fulfillment.id,
              shipment: { package_id: pkg.id },
            })
          }
        }}
        className="flex w-full items-stretch justify-between gap-2"
      >
        {options.map((pkg) => {
          const Icon = iconFor(pkg)
          return (
            <RadioOption key={pkg.label} value={pkg.label} variant="tile" className="flex-1">
              <Icon size={20} />
              <strong>{pkg.label}</strong>
            </RadioOption>
          )
        })}
      </RadioGroup>
    </div>
  )
}
