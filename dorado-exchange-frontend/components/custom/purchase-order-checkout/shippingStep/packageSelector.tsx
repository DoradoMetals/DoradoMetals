'use client'

import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { usePurchaseOrderCheckoutStore } from '@/store/purchaseOrderCheckoutStore'
import { packageOptions } from '@/types/packaging'
import { getCustomPrimaryIconStroke } from '@/utils/getPrimaryIconStroke'
import { useMemo } from 'react'

export function PackageSelector() {
  const selectedPackage = usePurchaseOrderCheckoutStore((state) => state.data.package)
  const fedexPackageToggle = usePurchaseOrderCheckoutStore((state) => state.data.fedexPackageToggle)
  const setData = usePurchaseOrderCheckoutStore((state) => state.setData)

  const filteredOptions = useMemo(() => {
    return packageOptions.filter((pkg) => pkg.fedexPackage === fedexPackageToggle)
  }, [fedexPackageToggle])

  const handleFedExToggle = (checked: boolean) => {
    setData({
      fedexPackageToggle: checked,
      package: undefined,
    })
  }

  const handleChange = (label: string) => {
    const selected = packageOptions.find((p) => p.label === label)
    if (selected) {
      setData({ package: selected })
    }
  }

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
