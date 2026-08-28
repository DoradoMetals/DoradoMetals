import { FormField, FormItem, FormMessage } from '@/shared/ui/base/form'
import { RadioGroup } from '@/shared/ui/base/radio-group'
import { RadioCard } from '@/shared/ui/RadioCard'
import { metalOptions, purityOptions, Scrap } from '@/features/scrap/types'
import { CheckCircle } from 'lucide-react'
import { useFormContext } from 'react-hook-form'
import { motion } from 'framer-motion'
import { cn } from '@/shared/utils/cn'

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
            className="gap-3 w-full items-stretch flex flex-col"
          >
            {metalOptions.map((metal) => {
              const isSelected = field.value === metal.label

              return (
                <RadioCard
                  key={metal.label}
                  as={motion.label}
                  value={metal.label}
                  initial={false}
                  animate={isSelected ? { scale: 1, y: 2 } : { scale: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 1000, damping: 50 }}
                  className="w-full"
                >
                  <div className="absolute top-1 right-1">
                    {/* No `text-primary`: the tick inherits the card's own
                        colour, which flips to `--primary-foreground` when the
                        card is selected. `text-primary` here would have been a
                        near-white tick on the near-white selected fill. */}
                    <CheckCircle
                      size={12}
                      className={cn(
                        'transition-opacity duration-200',
                        isSelected ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                  </div>
                  <div className="flex gap-4 w-full items-center">
                    <div className="flex items-center">{metal.logo}</div>
                    <div className="flex flex-col gap-1">
                      <strong>{metal.label}</strong>
                      <small>{metal.blurb}</small>
                    </div>
                  </div>
                </RadioCard>
              )
            })}
          </RadioGroup>
        </FormItem>
      )}
    />
  )
}
