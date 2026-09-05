import { FormField, FormItem, RadioGroup, RadioOption } from '@dorado/components'
import { metalOptions, purityOptions, Scrap } from '@/shared/types/scrap'
import { useFormContext } from 'react-hook-form'

export default function MetalStep() {
  const form = useFormContext<Scrap>()

  return (
    <FormField
      control={form.control}
      name="metal"
      render={({ field }) => (
        <FormItem>
          <RadioGroup
            value={field.value}
            onValueChange={(val) => {
              field.onChange(val)
              const defaultPurity = purityOptions[val as keyof typeof purityOptions]?.[0]?.value
              if (defaultPurity !== undefined) {
                form.setValue('purity', defaultPurity)
              }
            }}
            className="flex w-full flex-col items-stretch gap-3"
          >
            {metalOptions.map((metal) => (
              <RadioOption
                key={metal.label}
                value={metal.label}
                variant="card"
                className="flex-row items-center gap-4"
              >
                <div className="flex items-center">{metal.logo}</div>
                <div className="flex flex-col gap-1">
                  <strong>{metal.label}</strong>
                  <small>{metal.blurb}</small>
                </div>
              </RadioOption>
            ))}
          </RadioGroup>
        </FormItem>
      )}
    />
  )
}
