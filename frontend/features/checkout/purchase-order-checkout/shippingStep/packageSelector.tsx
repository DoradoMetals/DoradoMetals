'use client'

import { RadioGroup } from '@/shared/ui/RadioGroup'
import { Switch } from '@dorado/components'

import { usePurchaseOrderCheckoutStore } from '@/shared/store/purchaseOrderCheckoutStore'
import { sellCartStore } from '@/shared/store/sellCartStore'
import { convertToPounds } from '@/shared/utils/convertWeights'
import { useEffect, useMemo } from 'react'
import { useOfferedPackages, OfferedPackage } from '@/features/checkout/queries'
import { Inbox, Package2, Package as PackageIcon } from 'lucide-react'

// The one thing that stays client-side (Jacob's standing call): a picture.
// Sized by the row's own minimum weight, so a fourth box needs no edit here.
const iconFor = (pkg: OfferedPackage) => {
  const w = Number(pkg.min_weight_lb ?? 0)
  return w <= 2 ? Inbox : w <= 8 ? Package2 : PackageIcon
}

export function PackageSelector() {
  const selectedPackage = usePurchaseOrderCheckoutStore((state) => state.data.package)
  const fedexPackageToggle = usePurchaseOrderCheckoutStore((state) => state.data.fedexPackageToggle)
  const setData = usePurchaseOrderCheckoutStore((state) => state.setData)
  const { items } = sellCartStore()

  // The boxes are rows now (D208/112) - packageOptions, the hardcoded record
  // that duplicated shipping.packages while nothing served it, is gone.
  const { data: offered = [] } = useOfferedPackages()
  const filteredOptions = useMemo(() => {
    return offered.filter((pkg) => pkg.is_carrier_packaging === fedexPackageToggle)
  }, [offered, fedexPackageToggle])

  const totalCartWeight = useMemo(() => {
    return items.reduce((sum, item) => {
      const qty = item.data.quantity ?? 1
      const raw = item.type === 'product' ? item.data.gross : item.data.pre_melt
      const converted = convertToPounds(raw, item.type === 'product' ? 'toz' : item.data.gross_unit)

      return sum + converted * qty
    }, 0)
  }, [items])

  const packagingWeight = useMemo(() => {
    if (!selectedPackage) return totalCartWeight
    const opt = offered.find((p) => p.id === selectedPackage.id || p.label === selectedPackage.label)
    const minWeight = Number(opt?.min_weight_lb ?? 0)
    return Math.max(totalCartWeight, minWeight)
  }, [totalCartWeight, selectedPackage, offered])

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
      package: {
        id: selected.id,
        label: selected.label,
        fedexPackage: selected.is_carrier_packaging,
        dimensions: {
          length: Number(selected.length ?? 0),
          width: Number(selected.width ?? 0),
          height: Number(selected.height ?? 0),
          units: 'IN',
        },
        weight: {
          units: 'LB',
          value: packagingWeight,
        },
      },
    })
  }

  useEffect(() => {
    if (!selectedPackage) return
    setData({
      package: {
        ...selectedPackage,
        weight: {
          ...selectedPackage.weight,
          value: packagingWeight,
        },
      },
    })
  }, [packagingWeight])

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
        options={filteredOptions}
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
