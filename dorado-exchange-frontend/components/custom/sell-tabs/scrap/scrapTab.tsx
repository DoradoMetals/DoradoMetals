import { GoldIcon, PalladiumIcon, PlatinumIcon, SilverIcon } from '@/components/icons/logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import { defineStepper } from '@stepperize/react'
import { Coins, Diamond, Dumbbell, Gem, Scale, ScaleIcon } from 'lucide-react'
import { useId, useState } from 'react'

const { useStepper, utils } = defineStepper(
  {
    id: 'metalSelect',
    title: 'Metal Selection',
    description: 'Select item metal.',
  },
  {
    id: 'weightSelect',
    title: 'Weight Selection',
    description: 'Enter item weight.',
  },
  { id: 'complete', title: 'Complete', description: 'Checkout complete' }
)

const metalOptions = [
  {
    label: 'Gold',
    logo: <GoldIcon size={36} className="text-secondary" />,
    blurb: 'Jewelry, nuggets, raw gold, casting grain, dental',
    id: '80f18a95-7ed4-4a87-93c7-74d9355da8fe',
  },
  {
    label: 'Silver',
    logo: <SilverIcon size={36} className="text-secondary" />,
    blurb: 'Jewelry, flatware, tea sets, wire, sheets',
    id: '4e194eef-836f-4e9b-97f3-dda36a232dfb',
  },
  {
    label: 'Platinum',
    logo: <PlatinumIcon size={36} className="text-secondary" />,
    blurb: 'Jewelry stamped PLAT, PT 950, PT 900',
    id: '03ce1689-b24f-4a15-b91c-3a1a6cbead7f',
  },
  {
    label: 'Palladium',
    logo: <PalladiumIcon size={36} className="text-secondary" />,
    blurb: 'Jewelry stamped PALLADIUM, PD, PD 950, PD 900',
    id: '5ec4c718-2a8e-486c-9046-6c5b6e04a506',
  },
]

const weightOptions = [
  {
    label: 'Grams',
    logo: <Scale size={20} className="text-secondary" />,
    unit: 'g',
    id: '1',
  },
  {
    label: 'Troy Oz.',
    logo: <Coins size={20} className="text-secondary" />,
    unit: 't oz',
    id: '2',
  },
  {
    label: 'DWT',
    logo: <Gem size={20} className="text-secondary" />,
    unit: 'dwt',
    id: '3',
  },
  {
    label: 'Pounds',
    logo: <Dumbbell size={20} className="text-secondary" />,
    unit: 'lb',
    id: '4',
  },
]

export default function StepperDemo() {
  const stepper = useStepper()

  const currentIndex = utils.getIndex(stepper.current.id)

  return (
    <div className="space-y-6 p-3 rounded-lg w-full mt-6">
      <div className="flex items-center gap-4 mb-8">
        <StepIndicator currentStep={currentIndex + 1} totalSteps={stepper.all.length} />
        <div className="flex flex-col">
          <h2 className="flex-1 header-text">{stepper.current.title}</h2>
          <p className="secondary-text">{stepper.current.description}</p>
        </div>
      </div>
      {stepper.switch({
        metalSelect: () => <MetalSelectionComponent />,
        weightSelect: () => <WeightComponent />,
        complete: () => <CompleteComponent />,
      })}
      <div className="space-y-4 mt-8">
        {!stepper.isLast ? (
          <div className="flex justify-end gap-4">
            <Button variant="outline" onClick={stepper.prev} disabled={stepper.isFirst}>
              Back
            </Button>
            <Button onClick={stepper.next}>{stepper.isLast ? 'Complete' : 'Next'}</Button>
          </div>
        ) : (
          <Button onClick={stepper.reset}>Reset</Button>
        )}
      </div>
    </div>
  )
}

interface StepIndicatorProps {
  currentStep: number
  totalSteps: number
  size?: number
  strokeWidth?: number
}

const StepIndicator = ({
  currentStep,
  totalSteps,
  size = 80,
  strokeWidth = 6,
}: StepIndicatorProps) => {
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const fillPercentage = (currentStep / totalSteps) * 100
  const dashOffset = circumference - (circumference * fillPercentage) / 100

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size}>
        <title>Step Indicator</title>
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

const MetalSelectionComponent = () => {
  return (
    <RadioGroup className="gap-3 w-full items-stretch flex flex-col" defaultValue="0">
      {metalOptions.map((metal, index) => (
        <label
          key={metal.id}
          className="flex w-full items-stretch justify-between gap-4 rounded-lg p-4 cursor-pointer
                     border
                     border-text-neutral-200
                     has-[[data-state=checked]]:bg-card
                     has-[[data-state=checked]]:border-secondary
                     transition-colors
                     "
        >
          <div className="flex gap-4 w-full items-center">
            <div className="flex items-center">{metal.logo}</div>
            <div className="flex flex-col gap-1">
              <div className="title-text">{metal.label}</div>
              <p id={metal.id} className="text-xs text-neutral-600 leading-snug">
                {metal.blurb}
              </p>
            </div>
          </div>

          <RadioGroupItem
            value={String(index)}
            id={metal.id}
            aria-describedby={metal.id}
            className="sr-only after:absolute after:inset-0"
            // className="h-4 w-4 mt-1
            //            rounded-full
            //            border-none
            //            data-[state=checked]:bg-primary
            //            transition-colors
            //            bg-card
            //            shadow-[inset_0_-1px_0px_hsla(0,0%,99%,1),inset_0_1px_1px_hsla(0,0%,0%,0.2)]
            //            dark:shadow-[inset_0_-1px_0px_hsla(0,0%,100%,0.1),inset_0_1px_1px_hsla(0,0%,0%,0.3)]
            //            "
          />
        </label>
      ))}
    </RadioGroup>
  )
}

const WeightComponent = () => {
  const [unit, setUnit] = useState('g')
  return (
    <div className="flex-col gap-4">
      <RadioGroup className="gap-3 w-full flex mb-8" defaultValue="0" onValueChange={(val) => setUnit(weightOptions[Number(val)].unit)}>
        {weightOptions.map((weight, index) => (
          <label
            key={weight.id}
            className="peer flex flex-col items-center w-full gap-3 rounded-lg p-3 cursor-pointer
                      border border-text-neutral-200
                      has-[[data-state=checked]]:bg-card
                      has-[[data-state=checked]]:border-secondary
                      transition-colors
                      "
          >
            <div className="flex flex-col items-center gap-2">
              {weight.logo}
              <div className="secondary-text">{weight.label}</div>
            </div>

            <RadioGroupItem
              value={String(index)}
              id={weight.id}
              aria-describedby={weight.id}
              className="sr-only after:absolute after:inset-0"
            />

            {/* Input: shown only when selected */}
            <div className="hidden peer-checked:flex w-full mt-2 rounded-lg shadow-sm shadow-black/5">
              <Input
                id={`input-${weight.id}`}
                className="-me-px z-10 rounded-e-none shadow-none"
                placeholder="Amount"
                type="text"
              />
              <span className="inline-flex items-center rounded-e-lg border border-input bg-background px-3 text-sm text-muted-foreground">
                {weight.label}
              </span>
            </div>
          </label>
        ))}
      </RadioGroup>
      <div className="flex rounded-lg shadow-sm shadow-black/5">
        <Input
          className="-me-px z-10 rounded-e-none shadow-none"
          placeholder="google"
          type="text"
        />
        <span className="inline-flex items-center rounded-e-lg border border-input bg-background px-3 text-sm text-muted-foreground">
          {unit}
        </span>
      </div>
    </div>
  )
}

const CompleteComponent = () => {
  return <h3 className="text-lg py-4 font-medium">Stepper complete 🔥</h3>
}
