import { FormField, FormItem, FormMessage } from "@/components/ui/form"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { metalOptions, purityOptions, Scrap } from "@/types/scrap"
import { CheckCircle } from "lucide-react"
import { useFormContext } from "react-hook-form"
import { motion } from 'framer-motion'
import { cn } from "@/lib/utils"

export default function MetalStep() {
  const form = useFormContext<Scrap>()

  return (
    <FormField
      control={form.control}
      name="metal"
      render={({ field }) => (
        <FormItem>
          {/* <h2 className="text-xs text-neutral-600 tracking-widest mb-4">Select Metal</h2> */}

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
                <motion.label
                  key={metal.label}
                  initial={false}
                  animate={isSelected ? { scale: 1, y: 2 } : { scale: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 1000, damping: 50 }}
                  className="radio-group-buttons w-full"
                >
                  <div className="absolute top-1 right-1">
                    <CheckCircle
                      size={16}
                      className={cn(
                        'transition-opacity duration-200',
                        isSelected ? 'text-primary opacity-100' : 'opacity-0'
                      )}
                    />
                  </div>
                  <div className="flex gap-4 w-full items-center">
                    <div className="flex items-center">{metal.logo}</div>
                    <div className="flex flex-col gap-1">
                      <div className="title-text">{metal.label}</div>
                      <p className="tertiary-text leading-snug">{metal.blurb}</p>
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

