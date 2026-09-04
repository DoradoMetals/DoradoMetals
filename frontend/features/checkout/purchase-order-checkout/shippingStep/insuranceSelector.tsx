'use client'

import { RadioGroup, RadioOption } from '@dorado/components'
import { usePurchaseOrderCheckoutStore } from '@/shared/store/purchaseOrderCheckoutStore'
import { ShieldCheckIcon, ShieldSlashIcon } from '@phosphor-icons/react'

const insuranceOptions = [
  { value: 'insured', label: 'Insured', icon: ShieldCheckIcon },
  { value: 'uninsured', label: 'Uninsured', icon: ShieldSlashIcon },
]

export function InsuranceSelector() {
  const insured = usePurchaseOrderCheckoutStore((state) => state.data.insurance?.insured)
  const setData = usePurchaseOrderCheckoutStore((state) => state.setData)

  const handleChange = (value: string) => {
    setData({
      insurance: {
        insured: value === 'insured',
        declaredValue: { amount: 0, currency: 'USD' },
      },
    })
  }

  return (
    <div className="space-y-2">
      <h3 className="eyebrow mb-4">Insurance</h3>
      <RadioGroup
        value={insured ? 'insured' : 'uninsured'}
        onValueChange={handleChange}
        className="flex w-full items-stretch justify-between gap-3"
      >
        {insuranceOptions.map((option) => (
          <RadioOption key={option.value} value={option.value} variant="tile" className="flex-1">
            <option.icon size={28} />
            <strong>{option.label}</strong>
          </RadioOption>
        ))}
      </RadioGroup>
    </div>
  )
}
