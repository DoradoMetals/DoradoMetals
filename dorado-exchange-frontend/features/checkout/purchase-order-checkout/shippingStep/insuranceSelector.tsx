'use client'

import { RadioGroup, RadioGroupItem } from '@/shared/ui/base/radio-group'
import { cn } from '@/shared/utils/cn'
import { usePurchaseOrderCheckoutStore } from '@/store/purchaseOrderCheckoutStore'
import { ShieldCheckIcon, ShieldSlashIcon } from '@phosphor-icons/react'

export function InsuranceSelector() {
  const insured = usePurchaseOrderCheckoutStore((state) => state.data.insurance?.insured)
  const setData = usePurchaseOrderCheckoutStore((state) => state.setData)

  const handleChange = (value: string) => {
    setData({
      insurance: {
        insured: value === 'insured',
        declaredValue: {
          amount: 0,
          currency: 'USD',
        },
      },
    })
  }

  const iconMap = {
    insured: ShieldCheckIcon,
    uninsured: ShieldSlashIcon,
  }

  return (
    <div className="space-y-2">
      <h2 className="text-xs text-neutral-600 tracking-widest mb-4">Insurance</h2>
      <RadioGroup
        value={insured ? 'insured' : 'uninsured'}
        onValueChange={handleChange}
        className="flex items-center w-full justify-between"
      >
        {['insured', 'uninsured'].map((option) => {
          const Icon = iconMap[option as 'insured' | 'uninsured']

          return (
            <label
              key={option}
              htmlFor={option}
              className={cn(
                'raised-off-page relative peer flex flex-col items-center justify-center flex-1 gap-2 text-center rounded-lg bg-background px-1 pt-4 pb-2 cursor-pointer transition-colors has-[[data-state=checked]]:bg-card has-[[data-state=checked]]:shadow-md'
              )}
            >
              <Icon size={28} className='text-primary' />

              <div className="text-xs sm:text-sm text-neutral-800 font-medium capitalize">
                {option}
              </div>
              <RadioGroupItem id={option} value={option} className="sr-only" />
            </label>
          )
        })}
      </RadioGroup>
    </div>
  )
}
