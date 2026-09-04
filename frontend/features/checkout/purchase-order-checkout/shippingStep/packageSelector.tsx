'use client'

import { useState } from 'react'
import { RadioGroup } from '@/shared/ui/RadioGroup'
import { Switch } from '@dorado/components'
import { Inbox, Package2, Package as PackageIcon } from 'lucide-react'
import type { CheckoutView, Package } from '@dorado/contracts'
import { useOfferedPackages, usePatchCheckout } from '@/features/checkout/queries'

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
export function PackageSelector({ row }: { row?: CheckoutView }) {
  const [carrierPackaging, setCarrierPackaging] = useState(false)
  const { data: offered = [] } = useOfferedPackages()
  const patchCheckout = usePatchCheckout('purchase')

  const options = offered.filter((pkg) => pkg.is_carrier_packaging === carrierPackaging)
  const selected = offered.find((pkg) => pkg.id === row?.package_id)

  return (
    <div className="space-y-2">
      <h2 className="eyebrow mb-4">Package Selection</h2>

      <div className="flex items-center justify-end gap-2 mb-4">
        <p>Use FedEx Packaging?</p>
        <Switch checked={carrierPackaging} onCheckedChange={setCarrierPackaging} />
      </div>

      <RadioGroup
        value={selected?.label ?? ''}
        onValueChange={(label) => {
          const pkg = offered.find((p) => p.label === label)
          // D208: the row takes the id the moment it is picked.
          if (pkg) patchCheckout.mutate({ package_id: pkg.id })
        }}
        options={options}
        getValue={(pkg) => pkg.label}
        variant="tile"
        className="flex w-full items-stretch justify-between gap-2"
        optionClassName="flex-1"
      >
        {(pkg) => {
          const Icon = iconFor(pkg)
          return (
            <>
              <Icon size={20} />
              <strong>{pkg.label}</strong>
            </>
          )
        }}
      </RadioGroup>
    </div>
  )
}
