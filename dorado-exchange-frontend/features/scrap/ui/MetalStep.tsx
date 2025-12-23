import { FormField, FormItem, FormMessage } from '@/shared/ui/base/form'
import { RadioGroup, RadioGroupItem } from '@/shared/ui/base/radio-group'
import { metalOptions, purityOptions, Scrap } from '@/types/scrap'
import { CheckCircle } from 'lucide-react'
import { useFormContext } from 'react-hook-form'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useSpotPrices } from '@/lib/queries/useSpotPrices'

export default function MetalStep() {
  const form = useFormContext<Scrap>()
  const { data: spotPrices = [] } = useSpotPrices()

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
              const spot = spotPrices.find((s) => s.type === val)
              form.setValue('bid_premium', spot?.scrap_percentage)
            }}
            className="gap-3 w-full items-stretch flex flex-col"
          >
            {metalOptions.map((metal) => {
              const isSelected = field.value === metal.label

              return (
                <motion.label
                  key={metal.label}
                  initial={false}
                  animate={isSelected ? { scale: 1, y: 2 } : { scale: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 1000, damping: 50 }}
                  className="radio-group-buttons w-full"
                >
                  <div className="absolute top-1 right-1">
                    <CheckCircle
                      size={12}
                      className={cn(
                        'text-primary transition-opacity duration-200',
                        isSelected ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                  </div>
                  <div className="flex gap-4 w-full items-center">
                    <div className="flex items-center">{metal.logo}</div>
                    <div className="flex flex-col gap-1">
                      <div className="text-lg text-neutral-800">{metal.label}</div>
                      <p className="text-xs text-neutral-500 leading-snug">{metal.blurb}</p>
                    </div>
                  </div>
                  <RadioGroupItem
                    value={metal.label}
                    id={metal.label}
                    className="sr-only after:absolute after:inset-0"
                  />
                </motion.label>
              )
            })}
          </RadioGroup>
        </FormItem>
      )}
    />
  )
}
