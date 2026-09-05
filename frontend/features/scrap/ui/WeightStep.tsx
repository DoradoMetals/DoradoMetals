import { FormField, FormItem, FormMessage, Input, RadioGroup, RadioOption } from '@dorado/components'
import { Scrap, weightOptions } from '@/features/scrap/types'
import { useFormContext } from 'react-hook-form'

export default function WeightStep() {
  const form = useFormContext<Scrap>()
  const unit = form.watch('gross_unit') || 'g'

  return (
    <div className="flex-col">

      <FormField
        control={form.control}
        name="gross_unit"
        render={({ field }) => (
          <FormItem className="mb-6">
            <RadioGroup
              value={field.value}
              onValueChange={field.onChange}
              className="flex w-full gap-3"
            >
              {weightOptions.map((weight) => (
                <RadioOption key={weight.id} value={weight.unit} variant="tile" className="w-full">
                  <weight.icon size={20} />
                  <strong>{weight.label}</strong>
                </RadioOption>
              ))}
            </RadioGroup>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="pre_melt"
        render={({ field }) => (
          <FormItem className="w-full">
            <Input
              label="Enter Weight"
              type="number"
              value={field.value === 0 ? '' : field.value}
              onChange={(e) => {
                const val = e.target.value
                field.onChange(val === '' ? 0 : val)
              }}
              trailing={unit}
            />
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  )
}
