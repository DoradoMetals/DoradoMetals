import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { WeightOption, weightOptions } from '@/types/scrap'

export default function WeightSelect({
  value,
  onChange,
}: {
  value: WeightOption
  onChange: (value: WeightOption) => void
}) {
  return (
    <Select
      defaultValue={value.unit}
      onValueChange={(unit) => {
        const selected = weightOptions.find((w) => w.unit === unit)
        if (selected) onChange(selected)
      }}
    >
      <SelectTrigger className="w-14 bg-card border-none h-6 raised-off-page px-1 py-1">
        <SelectValue placeholder="Weight" />
      </SelectTrigger>
      <SelectContent className='bg-card w-18'>
        {weightOptions.map((option) => (
          <SelectItem key={option.id} value={option.unit}>
            <div className="flex items-center gap-2">
              <span>{option.unit}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
