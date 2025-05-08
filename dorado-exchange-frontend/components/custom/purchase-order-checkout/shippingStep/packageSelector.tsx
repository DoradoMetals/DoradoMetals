'use client'

import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

import { cn } from '@/lib/utils'

import { usePurchaseOrderCheckoutStore } from '@/store/purchaseOrderCheckoutStore'
import { packageOptions } from '@/types/packaging'

export function PackageSelector() {
  const selectedPackage = usePurchaseOrderCheckoutStore((state) => state.data.package)
  const setData = usePurchaseOrderCheckoutStore((state) => state.setData)


  const handleChange = (label: string) => {
    const selected = packageOptions.find((p) => p.label === label)
    if (selected) {
      setData({ package: selected })
    }
  }

  return (
    <div className="space-y-2">
      <RadioGroup
        value={selectedPackage?.label}
        onValueChange={handleChange}
        className="gap-3 w-full flex justify-between"
      >
        {packageOptions.map((pkg) => (
          <label
            key={pkg.label}
            htmlFor={pkg.label}
            className={cn(
              'raised-off-page relative peer flex flex-col items-center justify-center flex-1 gap-2 text-center rounded-lg border border-border bg-background px-1 pt-4 pb-2 cursor-pointer transition-colors has-[[data-state=checked]]:bg-card raised-off-page'
            )}
          >
            <div className="flex flex-col items-center gap-2">
              {pkg.icon && <pkg.icon className="w-5 h-5 text-primary" />}
              <div className="text-xs sm:text-sm text-neutral-800 font-medium">{pkg.label}</div>
            </div>

            <RadioGroupItem id={pkg.label} value={pkg.label} className="sr-only" />
          </label>
        ))}
      </RadioGroup>
    </div>
  )
}
