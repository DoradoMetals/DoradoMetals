import { FormField, FormItem } from '@/shared/ui/base/form'
import { RadioGroup } from '@/shared/ui/RadioGroup'
import { metalOptions, purityOptions, Scrap } from '@/features/scrap/types'
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
            options={metalOptions}
            getValue={(metal) => metal.label}
            className="flex w-full flex-col items-stretch gap-3"
            optionClassName="flex-row items-center gap-4"
          >
            {(metal) => (
              <>
                <div className="flex items-center">{metal.logo}</div>
                <div className="flex flex-col gap-1">
                  <strong>{metal.label}</strong>
                  <small>{metal.blurb}</small>
                </div>
              </>
            )}
          </RadioGroup>
        </FormItem>
      )}
    />
  )
}
