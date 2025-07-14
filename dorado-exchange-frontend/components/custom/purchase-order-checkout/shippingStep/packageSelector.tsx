'use client'

import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { usePurchaseOrderCheckoutStore } from '@/store/purchaseOrderCheckoutStore'
import { sellCartStore } from '@/store/sellCartStore'
import { packageOptions } from '@/types/packaging'
import { convertToPounds } from '@/utils/convertTroyOz'
import { getCustomPrimaryIconStroke } from '@/utils/getPrimaryIconStroke'
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
      <h2 className="text-xs text-neutral-600 tracking-widest mb-4">Package Selection</h2>

      <div className="flex items-center justify-end gap-2 mb-4">
        <span className="text-sm text-neutral-600">Use FedEx Packaging?</span>
        <Switch checked={fedexPackageToggle} onCheckedChange={handleFedExToggle} />
      </div>

      <RadioGroup
        value={selectedPackage?.label ?? ''}
        onValueChange={handleChange}
        className="flex items-center w-full justify-between"
      >
        {filteredOptions.map((pkg) => (
          <label
            key={pkg.label}
            htmlFor={pkg.label}
            className={cn(
              'raised-off-page relative peer flex flex-col items-center justify-center flex-1 gap-2 text-center rounded-lg bg-background px-1 pt-4 pb-2 cursor-pointer transition-colors has-[[data-state=checked]]:bg-card has-[[data-state=checked]]:shadow-md'
            )}
          >
            <div className="flex flex-col items-center gap-2">
              {pkg.icon && <pkg.icon size={20} color={getCustomPrimaryIconStroke()} />}
              <div className="text-xs sm:text-sm text-neutral-800 font-medium">{pkg.label}</div>
            </div>

            <RadioGroupItem id={pkg.label} value={pkg.label} className="sr-only" />
          </label>
        ))}
      </RadioGroup>
    </div>
  )
}
