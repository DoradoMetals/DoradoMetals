import { FormField, FormItem, FormMessage } from '@/components/ui/form'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Scrap, weightOptions } from '@/types/scrap'
import { CheckCircle } from 'lucide-react'
import { useFormContext } from 'react-hook-form'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { FloatingLabelInput } from '@/components/ui/floating-label-input'
import getPrimaryIconStroke from '@/utils/getPrimaryIconStroke'

export default function WeightStep() {
  const form = useFormContext<Scrap>()
  const unit = form.watch('gross_unit') || 'g'

  return (
    <div className="flex-col">
      {/* <h2 className="text-xs text-neutral-600 tracking-widest mb-4">Enter Weight</h2> */}

      <FormField
        control={form.control}
        name="gross_unit"
        render={({ field }) => (
          <FormItem className="mb-6">
            <RadioGroup
              value={field.value}
              onValueChange={field.onChange}
              className="gap-3 w-full flex"
            >
              {weightOptions.map((weight) => {
                const isSelected = field.value === weight.unit

                return (
                  <motion.label
                    key={weight.id}
                    initial={false}
                    animate={isSelected ? { scale: 1, y: 2 } : { scale: 1, y: 0 }}
                    transition={{ type: 'spring', stiffness: 1000, damping: 50 }}
                    className="radio-group-buttons w-full"
                  >
                    <div className="absolute top-1 right-1">
                      <CheckCircle
                        size={12}
                        stroke={getPrimaryIconStroke()}
                        className={cn(
                          'transition-opacity duration-200',
                          isSelected ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                    </div>
                    <div className="flex flex-col items-center gap-2">
                      <weight.icon size={20} color={getPrimaryIconStroke()} />

                      <div className="text-sm text-neutral-900">{weight.label}</div>
                    </div>
                    <RadioGroupItem
                      value={weight.unit}
                      id={weight.id}
                      aria-describedby={weight.id}
                      className="sr-only after:absolute after:inset-0"
                    />
                  </motion.label>
                )
              })}
            </RadioGroup>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Your input field */}
      <FormField
        control={form.control}
        name="pre_melt"
        render={({ field }) => (
          <FormItem className="w-full">
            <div className="relative w-full rounded-lg">
              <FloatingLabelInput
                label="Enter Weight"
                type="number"
                inputMode="decimal"
                pattern="[0-9]*"
                size="sm"
                className="w-full input-floating-label-form no-spinner"
                value={field.value === 0 ? '' : field.value}
                onChange={(e) => {
                  const val = e.target.value
                  field.onChange(val === '' ? 0 : val)
                }}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 hover:bg-transparent">
                {unit}
              </div>
            </div>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  )
}
