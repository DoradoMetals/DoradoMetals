'use client'

import {
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form'
import { useFormContext, useWatch } from 'react-hook-form'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Switch } from '@/components/ui/switch'
import { packageOptions } from '@/types/packaging'
import { PurchaseOrderCheckout } from '@/types/checkout'
import { cn } from '@/lib/utils'
import { ShieldCheck, ShieldOff, Check } from 'lucide-react'
import { useMemo } from 'react'

export function PackageSelector() {
  const form = useFormContext<PurchaseOrderCheckout>()
  const insured = useWatch({ control: form.control, name: 'insuranceToggle' })

  const options = useMemo(() => {
    return Object.values(packageOptions).filter((pkg) => pkg.insured === insured)
  }, [insured])

  const currentValue = form.watch('package.label')

  const handleChange = (label: string) => {
    const selected = options.find((p) => p.label === label)
    if (selected) {
      form.setValue('package', selected, { shouldValidate: true })
    }
  }

  return (
    <div className="space-y-2">
      <h2 className="text-xs text-neutral-600 tracking-widest mb-4">Package Selection</h2>

      <FormField
        control={form.control}
        name="insuranceToggle"
        render={({ field }) => (
          <FormItem className="flex items-center justify-between gap-4">
            <span className="text-base text-neutral-800">Want your shipment insured?</span>
            <Switch
              checked={field.value}
              onCheckedChange={(checked) => {
                field.onChange(checked)
                const defaultLabel = checked ? 'FedEx Medium' : 'Medium'
                const fallback = Object.values(packageOptions).find(
                  (p) => p.label === defaultLabel
                )
                if (fallback) {
                  form.setValue('package', fallback, { shouldValidate: true })
                }
              }}
            />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="package"
        render={() => (
          <FormItem>
            <RadioGroup
              value={currentValue}
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
                    {pkg.insured ? (
                      <ShieldCheck size={16} className="text-neutral-500" />
                    ) : (
                      // <ShieldOff size={16} className="text-destructive" /> 
                      null
                    )}
                  </div>

                  <div className="flex flex-col items-center gap-2">
                    {pkg.icon && <pkg.icon className="w-5 h-5 text-primary" />}
                    <div className="text-xs text-neutral-800">{pkg.label}</div>
                  </div>

                  <RadioGroupItem id={pkg.label} value={pkg.label} className="sr-only" />
                </label>
              ))}
            </RadioGroup>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  )
}