'use client'

import { RadioGroup } from '@/shared/ui/RadioGroup'
import { Switch } from '@/shared/ui/base/switch'

import { usePurchaseOrderCheckoutStore } from '@/shared/store/purchaseOrderCheckoutStore'
import { sellCartStore } from '@/shared/store/sellCartStore'
import { packageOptions } from '@/features/packaging/types'
import { convertToPounds } from '@/shared/utils/convertWeights'
import { useEffect, useMemo } from 'react'

export function PackageSelector() {
  const selectedPackage = usePurchaseOrderCheckoutStore((state) => state.data.package)
  const fedexPackageToggle = usePurchaseOrderCheckoutStore((state) => state.data.fedexPackageToggle)
  const setData = usePurchaseOrderCheckoutStore((state) => state.setData)
  const { items } = sellCartStore()

  const filteredOptions = useMemo(() => {
    return packageOptions.filter((pkg) => pkg.fedexPackage === fedexPackageToggle)
  }, [fedexPackageToggle])

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
    const opt = packageOptions.find(p => p.label === selectedPackage.label)
    const minWeight = opt?.weight.value ?? 0
    return Math.max(totalCartWeight, minWeight)
  }, [totalCartWeight, selectedPackage])

  const handleFedExToggle = (checked: boolean) => {
    setData({
      fedexPackageToggle: checked,
      package: undefined,
    })
  }

  const handleChange = (label: string) => {
    const selected = packageOptions.find((p) => p.label === label)
    if (!selected) return
    setData({
      package: {
        ...selected,
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
        {(pkg) => (
          <>
            {pkg.icon && <pkg.icon size={20} />}
            <strong>{pkg.label}</strong>
          </>
        )}
      </RadioGroup>
    </div>
  )
}
