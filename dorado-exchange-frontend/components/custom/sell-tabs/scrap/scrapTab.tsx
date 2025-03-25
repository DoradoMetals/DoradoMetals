'use client'

import { useForm, FormProvider, useFormContext, useFormState } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { scrapSchema, type Scrap } from '@/types/scrap'
import { Button } from '@/components/ui/button'
import { FloatingLabelInput } from '@/components/ui/floating-label-input'
import { Form, FormField, FormItem, FormControl, FormMessage } from '@/components/ui/form'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Slider } from '@/components/ui/slider'
import { metalOptions, purityOptions, weightOptions } from '@/types/scrap'
import { useState } from 'react'
import { defineStepper, Stepper } from '@stepperize/react'
import NumberFlow from '@number-flow/react'
import getScrapPrice from '@/utils/getScrapPrice'

const { useStepper, utils } = defineStepper(
  { id: 'name', title: 'Name', description: 'Enter Item name (necklace, ring, bracelet, grain, etc...' },
  { id: 'metalSelect', title: 'Metal Selection', description: 'Select item metal.' },
  { id: 'weightSelect', title: 'Weight Selection', description: 'Enter item weight.' },
  { id: 'puritySelect', title: 'Purity Selection', description: 'Select item purity.' },
  { id: 'review', title: 'Review', description: 'Review inputted item.' }
)

export default function ScrapFormStepper() {
  const [submitAction, setSubmitAction] = useState<'add' | 'checkout' | null>(null)

  const form = useForm<Scrap>({
    resolver: zodResolver(scrapSchema),
    mode: 'onChange',
    defaultValues: {
      name: '',
      metal_id: '80f18a95-7ed4-4a87-93c7-74d9355da8fe',
      gross: '',
      gross_unit: 'g',
      purity: undefined,
    },
  })

  const stepper = useStepper()
  const currentIndex = utils.getIndex(stepper.current.id)

  const handleSubmit = (values: Scrap) => {
    console.log('Submitted Scrap:', values)

    if (submitAction === 'add') {
      form.reset({
        name: '',
        metal_id: '80f18a95-7ed4-4a87-93c7-74d9355da8fe',
        gross: '',
        gross_unit: 'g',
        purity: undefined,
      })
      stepper.goTo('metalSelect')
    } else if (submitAction === 'checkout') {
      console.log('Redirect to checkout stepper or page')
    }

    setSubmitAction(null)
  }

  const { errors } = useFormState({ control: form.control })

  return (
    <FormProvider {...form}>
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(handleSubmit)}
          className="space-y-6 p-3 rounded-lg w-full mt-6"
        >
          <div className="flex items-center gap-4 mb-8">
            <StepIndicator currentStep={currentIndex + 1} totalSteps={stepper.all.length} />
            <div className="flex flex-col">
              <h2 className="flex-1 header-text">{stepper.current.title}</h2>
              <p className="secondary-text">{stepper.current.description}</p>
            </div>
          </div>

          {stepper.switch({
            // name: () => <NameStep />,
            metalSelect: () => <MetalSelectionStep />,
            weightSelect: () => <WeightStep />,
            puritySelect: () => <PurityStep />,
            review: () => <ReviewStep />,
          })}
          {stepper.current.id === 'review' ? (
            <div className="flex items-end gap-4">
              <div className="mr-auto">
                <Button type="button" variant="outline" onClick={stepper.prev}>
                  Back
                </Button>
              </div>
              <div className="flex flex-col items-center ml-auto gap-2">
                <Button
                  className="w-full"
                  type="submit"
                  variant="outline"
                  onClick={() => setSubmitAction('add')}
                >
                  Add Another
                </Button>

                <Button
                  className="w-full"
                  type="submit"
                  onClick={() => setSubmitAction('checkout')}
                >
                  Go to Checkout
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex justify-end gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={stepper.prev}
                disabled={stepper.isFirst}
              >
                Back
              </Button>
              <Button
                type="button"
                onClick={stepper.next}
                disabled={stepper.current.id === 'weightSelect' && !!errors.gross}
              >
                Next
              </Button>
            </div>
          )}
        </form>
      </Form>
    </FormProvider>
  )
}

// function NameStep() {
//   const form = useFormContext<Scrap>()

//   return (
//     <div className="flex-col gap-4">
//       <FormField
//         control={form.control}
//         name="name"
//         render={({ field }) => (
//           <FormItem className="w-full">
//             <div className="relative w-full rounded-lg">
//               <FloatingLabelInput
//                 label="Enter Name"
//                 type="text"
//                 size="sm"
//                 className="w-full input-floating-label-form no-spinner"
//                 {...field}
//               />
//             </div>
//             <FormMessage />
//           </FormItem>
//         )}
//       />
//     </div>
//   )
// }

function MetalSelectionStep() {
  const form = useFormContext<Scrap>()
  return (
    <FormField
      control={form.control}
      name="metal_id"
      render={({ field }) => (
        <FormItem>
          <RadioGroup
            defaultValue="0"
            value={field.value}
            onValueChange={field.onChange}
            className="gap-3 w-full items-stretch flex flex-col"
          >
            {metalOptions.map((metal) => (
              <label
                key={metal.id}
                className="flex w-full items-stretch justify-between gap-4 rounded-lg p-4 cursor-pointer border border-text-neutral-200 has-[[data-state=checked]]:bg-card has-[[data-state=checked]]:shadow-lg has-[[data-state=checked]]:border-secondary transition-colors"
              >
                <div className="flex gap-4 w-full items-center">
                  <div className="flex items-center">{metal.logo}</div>
                  <div className="flex flex-col gap-1">
                    <div className="title-text">{metal.label}</div>
                    <p className="text-xs text-muted-foreground leading-snug">{metal.blurb}</p>
                  </div>
                </div>
                <RadioGroupItem
                  value={metal.id}
                  id={metal.id}
                  className="sr-only after:absolute after:inset-0"
                />
              </label>
            ))}
          </RadioGroup>
        </FormItem>
      )}
    />
  )
}




function WeightStep() {
  const form = useFormContext<Scrap>()
  const unit = form.watch('gross_unit') || 'g'

  return (
    <div className="flex-col gap-4">
      <FormField
        control={form.control}
        name="gross_unit"
        render={({ field }) => (
          <FormItem className="mb-8">
            <RadioGroup
              defaultValue="0"
              value={field.value}
              onValueChange={field.onChange}
              className="gap-3 w-full flex"
            >
              {weightOptions.map((weight) => (
                <label
                  key={weight.id}
                  className="peer flex flex-col items-center w-full gap-3 rounded-lg p-3 cursor-pointer border border-text-neutral-200 has-[[data-state=checked]]:shadow-lg has-[[data-state=checked]]:bg-card has-[[data-state=checked]]:border-secondary transition-colors"
                >
                  <div className="flex flex-col items-center gap-2">
                    {weight.logo}
                    <div className="secondary-text">{weight.label}</div>
                  </div>

                  <RadioGroupItem
                    value={weight.unit}
                    id={weight.id}
                    aria-describedby={weight.id}
                    className="sr-only after:absolute after:inset-0"
                  />
                </label>
              ))}
            </RadioGroup>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="gross"
        render={({ field }) => (
          <FormItem className="w-full">
            <div className="relative w-full rounded-lg">
              <FloatingLabelInput
                label="Enter Weight"
                type="text"
                size="sm"
                className="w-full input-floating-label-form no-spinner"
                {...field}
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

function PurityStep() {
  const form = useFormContext<Scrap>()
  const metalId = form.watch('metal_id')

  const metalKey = metalOptions
    .find((m) => m.id === metalId)
    ?.label.toLowerCase() as keyof typeof purityOptions

  const options = purityOptions[metalKey] || []

  const [purityValue, setPurityValue] = useState(options[0]?.value || 0.5)
  const [customPurity, setCustomPurity] = useState(0)
  const [selectedLabel, setSelectedLabel] = useState(options[0]?.label || '')

  const isRoughlyEqual = (a: number, b: number) => Math.abs(a - b) < 0.001

  const handleRadioChange = (label: string) => {
    const match = options.find((opt) => opt.label === label)
    if (match) {
      setSelectedLabel(label)
      setPurityValue(match.value)
      form.setValue('purity', match.value)
    }
  }

  const handleSliderChange = (val: number) => {
    const match = options.find((opt) => isRoughlyEqual(opt.value, val))

    if (!match) {
      setCustomPurity(val)
      setSelectedLabel('Custom')
    } else {
      setSelectedLabel(match.label)
    }

    setPurityValue(val)
    form.setValue('purity', val)
  }

  const sliderValue = selectedLabel === 'Custom' ? customPurity : purityValue

  return (
    <FormField
      control={form.control}
      name="purity"
      render={() => (
        <FormItem>
          <RadioGroup
            value={selectedLabel}
            onValueChange={handleRadioChange}
            className="grid grid-cols-3 gap-3"
          >
            {options.map((option) => (
              <label
                key={option.label}
                className="flex items-center justify-center rounded-md border border-input px-4 py-2 text-sm font-medium cursor-pointer has-[[data-state=checked]]:bg-card has-[[data-state=checked]]:border-secondary has-[[data-state=checked]]:shadow-lg transition-colors"
              >
                <RadioGroupItem
                  value={option.label}
                  id={option.label}
                  className="sr-only after:absolute after:inset-0"
                />
                {option.label}
              </label>
            ))}
          </RadioGroup>

          <div className="relative mt-12 mb-16 w-full">
            <Slider
              value={[sliderValue]}
              onValueChange={([val]) => handleSliderChange(val)}
              min={0}
              max={1}
              step={0.01}
            />

            <div
              className="absolute top-6 text-sm text-muted-foreground"
              style={{
                left: `${sliderValue * 100}%`,
                transform: 'translateX(-50%)',
                whiteSpace: 'nowrap',
              }}
            >
              <NumberFlow
                willChange
                value={Math.round(sliderValue * 100)}
                isolate
                opacityTiming={{ duration: 250, easing: 'ease-out' }}
                transformTiming={{
                  easing: `linear(0, 0.0033 0.8%, 0.0263 2.39%, 0.0896 4.77%, 0.4676 15.12%, 0.5688, 0.6553, 0.7274, 0.7862, 0.8336 31.04%, 0.8793, 0.9132 38.99%, 0.9421 43.77%, 0.9642 49.34%, 0.9796 55.71%, 0.9893 62.87%, 0.9952 71.62%, 0.9983 82.76%, 0.9996 99.47%)`,
                  duration: 500,
                }}
                spinTiming={{ duration: 150, easing: 'ease-out' }}
                trend={0}
              />
              %
            </div>
          </div>
        </FormItem>
      )}
    />
  )
}

function ReviewStep() {
  const { getValues } = useFormContext<Scrap>()
  const values = getValues()

  // const name = values.name
  const metal = metalOptions.find((m) => m.id === values.metal_id)
  const unit = values.gross_unit
  const gross = values.gross
  const rawPurity = values.purity ?? 0
  const displayPurity = `${Math.round(rawPurity * 100)}%`

  const estimatedValue = getScrapPrice(
    metal?.id ?? '',
    unit ?? '',
    gross ?? '',
    rawPurity
  )

  return (
    <div className="space-y-6">
      <p className="secondary-text leading-relaxed">
        We estimate we can offer you around{' '}
        <span className="text-primary text-lg">{estimatedValue}</span>{' '}
        for your{' '}
        <span className="primary-text font-semibold">{displayPurity}</span> pure{' '}
        <span className="primary-text font-semibold">
          {gross} <span className='secondary-text'>{unit}</span> {metal?.label}
        </span>
        .
      </p>
    </div>
  )
}

function StepIndicator({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) {
  const size = 80
  const strokeWidth = 6
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const fillPercentage = (currentStep / totalSteps) * 100
  const dashOffset = circumference - (circumference * fillPercentage) / 100

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-neutral-500"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className="text-primary transition-all duration-300 ease-in-out"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-medium" aria-live="polite">
          {currentStep} of {totalSteps}
        </span>
      </div>
    </div>
  )
}
