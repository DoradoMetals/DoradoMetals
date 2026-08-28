'use client'

import SelectMenu from '@/shared/ui/SelectMenu'
import { Button } from '@/shared/ui/base/button'
import { WeightOption, weightOptions } from '@/features/scrap/types'

export default function WeightSelect({
  value,
  onChange,
}: {
  value: WeightOption
  onChange: (value: WeightOption) => void
}) {
  return (
    <SelectMenu
      trigger={
        <Button
          variant="ghost"
          size="sm"
          className="w-10 h-5 p-0 bg-card border-none raised-off-page text-xs mt-1"
        >
          {value.unit}
        </Button>
      }
      items={weightOptions.map((option) => ({ label: option.unit, value: option.id }))}
      onSelect={(id) => {
        const option = weightOptions.find((o) => o.id === id)
        if (option) onChange(option)
      }}
      side="bottom"
      align="center"
      sideOffset={4}
      contentClassName="p-0 bg-card w-12 z-50"
      itemClassName="flex items-center justify-center cursor-pointer bg-card"
      listClassName="max-h-52 overflow-y-auto"
    />
  )
}
