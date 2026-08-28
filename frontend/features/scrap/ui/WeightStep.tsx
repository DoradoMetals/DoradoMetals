import { FormField, FormItem, FormMessage } from '@/shared/ui/base/form'
import { RadioGroup } from '@/shared/ui/base/radio-group'
import { RadioCard } from '@/shared/ui/RadioCard'
import { Scrap, weightOptions } from '@/features/scrap/types'
import { CheckCircle } from 'lucide-react'
import { useFormContext } from 'react-hook-form'
import { motion } from 'framer-motion'
import { cn } from '@/shared/utils/cn'
import { FloatingLabelInput } from '@/shared/ui/inputs/FloatingLabelInput'

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
              className="gap-3 w-full flex"
            >
              {weightOptions.map((weight) => {
                const isSelected = field.value === weight.unit

                return (
                  <RadioCard
                    key={weight.id}
                    as={motion.label}
                    variant="segment"
                    value={weight.unit}
                    id={weight.id}
                    initial={false}
                    animate={isSelected ? { scale: 1, y: 2 } : { scale: 1, y: 0 }}
                    transition={{ type: 'spring', stiffness: 1000, damping: 50 }}
                    className="w-full"
                  >
                    <div className="absolute top-1 right-1">
                      {/* Inherits the card's colour - see MetalStep. */}
                      <CheckCircle
                        size={12}
                        className={cn(
                          'transition-opacity duration-200',
                          isSelected ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                    </div>
                    <div className="flex flex-col items-center gap-2">
                      <weight.icon size={20} />

                      <strong>{weight.label}</strong>
                    </div>
                  </RadioCard>
                )
              })}
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
            <div className="relative w-full rounded-lg">
              <FloatingLabelInput
                label="Enter Weight"
                type="number"
                inputMode="decimal"
                pattern="[0-9]*"
                size="sm"
                className="w-full border-none bg-card no-spinner"
                value={field.value === 0 ? '' : field.value}
                onChange={(e) => {
                  const val = e.target.value
                  field.onChange(val === '' ? 0 : val)
                }}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
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
