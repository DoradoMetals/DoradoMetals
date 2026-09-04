'use client'

import { RadioGroup, RadioOption, Switch } from '@dorado/components'

import { usePurchaseOrderCheckoutStore } from '@/shared/store/purchaseOrderCheckoutStore'
import { useMemo } from 'react'
import {
  useOfferedPackages,
  usePatchPurchaseCheckout,
  OfferedPackage,
} from '@/features/checkout/queries'
import { Inbox, Package2, Package as PackageIcon } from 'lucide-react'

// The one thing that stays client-side (Jacob's standing call): a picture.
// Sized by the row's own minimum weight, so a fourth box needs no edit here.
const iconFor = (pkg: OfferedPackage) => {
  const w = Number(pkg.min_weight_lb ?? 0)
  return w <= 2 ? Inbox : w <= 8 ? Package2 : PackageIcon
}

// RULING 58 (Jacob): "We don't care about packaging weight on the frontend.
// Why would it live here?" The box's weight and dimensions are the server's -
// this stores and sends the id, nothing else. The toggle below is local UI
// state filtering the offered list by is_carrier_packaging; it computes
// nothing and is never sent.
export function PackageSelector() {
  const selectedPackage = usePurchaseOrderCheckoutStore((state) => state.data.package)
  const fedexPackageToggle = usePurchaseOrderCheckoutStore((state) => state.data.fedexPackageToggle)
  const setData = usePurchaseOrderCheckoutStore((state) => state.setData)
  const patchCheckout = usePatchPurchaseCheckout()

  // The boxes are rows now (D208/112) - packageOptions, the hardcoded record
  // that duplicated shipping.packages while nothing served it, is gone.
  const { data: offered = [] } = useOfferedPackages()
  const filteredOptions = useMemo(() => {
    return offered.filter((pkg) => pkg.is_carrier_packaging === fedexPackageToggle)
  }, [offered, fedexPackageToggle])

  const handleFedExToggle = (checked: boolean) => {
    setData({
      fedexPackageToggle: checked,
      package: undefined,
    })
  }

  const handleChange = (label: string) => {
    const selected = offered.find((p) => p.label === label)
    if (!selected) return
    setData({
      package: { id: selected.id, label: selected.label },
    })
    // D208: the row takes the id the moment it's picked, not at "Go to Payment".
    patchCheckout.mutate({ package_id: selected.id })
  }

  return (
    <div className="space-y-2">
      <h2 className="eyebrow mb-4">Package Selection</h2>

      <div className="flex items-center justify-end gap-2 mb-4">
        <p>Use FedEx Packaging?</p>
        <Switch checked={fedexPackageToggle} onCheckedChange={handleFedExToggle} />
      </div>

      <RadioGroup
        value={selectedPackage?.label ?? ''}
        onValueChange={handleChange}
        className="flex w-full items-stretch justify-between gap-2"
      >
        {filteredOptions.map((pkg) => {
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
