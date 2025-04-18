'use client'

import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Switch } from '@/components/ui/switch'
import { packageOptions } from '@/types/packaging'
import { cn } from '@/lib/utils'
import { BadgePlus, ShieldCheck } from 'lucide-react'
import { useMemo } from 'react'
import { usePurchaseOrderCheckoutStore } from '@/store/purchaseOrderCheckoutStore'

export function PackageSelector() {
  const insured = usePurchaseOrderCheckoutStore((state) => state.data.insured)
  const selectedPackage = usePurchaseOrderCheckoutStore((state) => state.data.package)
  const setData = usePurchaseOrderCheckoutStore((state) => state.setData)

  const options = useMemo(() => {
    return Object.values(packageOptions).filter((pkg) => pkg.insured === insured)
  }, [insured])

  const handleInsuranceToggle = (checked: boolean) => {
    setData({ insured: checked})
  }

  const handleChange = (label: string) => {
    const selected = options.find((p) => p.label === label)
    if (selected) {
      setData({ package: selected })
    }
  }

  return (
    <div className="space-y-2">
      <h2 className="text-xs text-neutral-600 tracking-widest mb-4">Package Selection</h2>

      <div className="flex items-center justify-end gap-2 mb-4">
        <span className="text-sm text-neutral-600">Add insurance?</span>

        <Switch
          checked={insured}
          onCheckedChange={handleInsuranceToggle}
        />
      </div>

      <RadioGroup
        value={selectedPackage?.label}
        onValueChange={handleChange}
        className="gap-3 w-full flex justify-between"
      >
        {options.map((pkg) => (
          <label
            key={pkg.label}
            htmlFor={pkg.label}
            className={cn(
              'relative peer flex flex-col items-center justify-center flex-1 gap-2 text-center rounded-lg border border-border bg-background px-1 pt-4 pb-2 cursor-pointer transition-colors has-[[data-state=checked]]:bg-card has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:shadow-md'
            )}
          >
            <div className="absolute top-1 right-1">
              {pkg.insured && <ShieldCheck size={16} className="text-neutral-500" />}
            </div>

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
