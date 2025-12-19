import { FormField, FormItem } from '@/components/ui/form'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { metalOptions, purityOptions, Scrap } from '@/types/scrap'
import { CheckCircle } from 'lucide-react'
import { useFormContext } from 'react-hook-form'
import { motion } from 'framer-motion'
import NumberFlow from '@number-flow/react'
import { cn } from '@/lib/utils'
import { Slider } from '@/components/ui/slider'

export default function PurityStep() {
  const form = useFormContext<Scrap>()

  const purity = form.watch('purity') ?? purityOptions[form.watch('metal')]?.[0]?.value
  const metal = form.watch('metal')

  const metalKey = metalOptions.find((m) => m.label === metal)?.label as keyof typeof purityOptions
  const options = purityOptions[metalKey] || []

  const isRoughlyEqual = (a: number, b: number) => Math.abs(a - b) < 0.001

  const matchedOption = options.find((opt) => isRoughlyEqual(opt.value, purity))
  const selectedLabel = matchedOption?.label ?? 'Custom'

  const handleRadioChange = (label: string) => {
    const match = options.find((opt) => opt.label === label)
    if (match) {
      form.setValue('purity', match.value)
    }
  }

  const handleSliderChange = (val: number) => {
    form.setValue('purity', val)
  }

  return (
    <FormField
      control={form.control}
      name="purity"
      render={() => (
        <FormItem>
          {/* <h2 className="text-xs text-neutral-600 tracking-widest mb-4">Enter Purity</h2> */}

          <RadioGroup
            value={selectedLabel}
            onValueChange={handleRadioChange}
            className="grid grid-cols-3 gap-3"
          >
            {options.map((option) => {
              const isSelected = selectedLabel === option.label

              return (
                <motion.label
                  key={option.label}
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

                  {option.label}

                  <RadioGroupItem
                    value={option.label}
                    id={option.label}
                    className="sr-only after:absolute after:inset-0"
                  />
                </motion.label>
              )
            })}
          </RadioGroup>

          <div className="relative mt-6 mb-12 w-full">
            <Slider
              value={[purity]}
              onValueChange={([val]) => handleSliderChange(val)}
              min={0}
              max={1}
              step={0.001}
            />
            <div
              className="absolute top-4 text-sm text-neutral-700"
              style={{
                left: `${purity * 100 + 1}%`,
                transform: 'translateX(-50%)',
                whiteSpace: 'nowrap',
              }}
            >
              <NumberFlow
                willChange
                value={Number((purity * 100).toFixed(1))}
                isolate
                opacityTiming={{ duration: 100, easing: 'ease-out' }}
                transformTiming={{
                  easing: `linear(0, 0.0033 0.8%, 0.0263 2.39%, 0.0896 4.77%, 0.4676 15.12%, 0.5688, 0.6553, 0.7274, 0.7862, 0.8336 31.04%, 0.8793, 0.9132 38.99%, 0.9421 43.77%, 0.9642 49.34%, 0.9796 55.71%, 0.9893 62.87%, 0.9952 71.62%, 0.9983 82.76%, 0.9996 99.47%)`,
                  duration: 100,
                }}
                spinTiming={{ duration: 100, easing: 'ease-out' }}
                trend={0}
                suffix='%'
              />
            </div>
          </div>
        </FormItem>
      )}
    />
  )
}
