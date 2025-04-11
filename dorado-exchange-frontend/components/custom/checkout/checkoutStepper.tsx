'use client'

import { Button } from '@/components/ui/button'
import { defineStepper} from '@stepperize/react'
import { AddressCarousel } from './addressCarousel'
import { useAddress } from '@/lib/queries/useAddresses'
import { Address } from '@/types/address'
import { useState } from 'react'
const { useStepper, utils } = defineStepper(
  {
    id: 'shipping',
    title: 'Shipping',
    description: 'Choose how you want your items to be shipped',
  },
  { id: 'payment', title: 'Payment', description: 'Select how you want to pay.' },
  { id: 'review', title: 'Review Order', description: 'Review and confirm your order.' },
  {
    id: 'complete',
    title: 'Order Complete!',
    description: 'Your order is complete. Please download your invoice.',
  }
)

export default function CheckoutStepper() {
  const stepper = useStepper()
  const currentIndex = utils.getIndex(stepper.current.id)

  return (
    <div className="flex flex-col w-full px-5 max-w-lg lg:mt-15 space-y-6">
      <div className="flex items-center gap-4 mb-6 ">
        <StepIndicator currentStep={currentIndex + 1} totalSteps={stepper.all.length} />
        <div className="flex flex-col">
          <h2 className="flex-1 header-text">{stepper.current.title}</h2>
          <p className="secondary-text">{stepper.current.description}</p>
        </div>
      </div>

      {stepper.switch({
        shipping: () => <ShippingStep />,
        payment: () => <PaymentStep />,
        review: () => <ReviewStep />,
        complete: () => <CompleteStep />,
      })}

      <div className="flex justify-end gap-4">
        <Button type="button" variant="outline" onClick={stepper.prev} disabled={stepper.isFirst}>
          Back
        </Button>
        <Button type="button" onClick={stepper.next}>
          Next
        </Button>
      </div>
    </div>
  )
}

function ShippingStep() {
  const { data: addresses = [] } = useAddress()
  const [activeIndex, setActiveIndex] = useState(0)

  const selectedAddress = addresses[activeIndex]
  return (
    <div>
      <AddressCarousel
        addresses={addresses}
        activeIndex={activeIndex}
        onChangeIndex={setActiveIndex}
      />
    </div>
  )
}
function PaymentStep() {
  return <div>Payment</div>
}

function ReviewStep() {
  return <div>Review</div>
}

function CompleteStep() {
  return <div>Complete</div>
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
