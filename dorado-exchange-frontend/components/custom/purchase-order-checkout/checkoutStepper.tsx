'use client'

import { Button } from '@/components/ui/button'
import { defineStepper } from '@stepperize/react'
import ShippingStep from './shippingStep/shippingStep'
import PayoutStep from './payoutStep/payoutStep'
import { useAddress } from '@/lib/queries/useAddresses'
import { Address } from '@/types/address'
import { useEffect, useRef } from 'react'
import { usePurchaseOrderCheckoutStore } from '@/store/purchaseOrderCheckoutStore'
import { useUser } from '@/lib/authClient'
import ReviewStep from './reviewStep/reviewStep'
import { sellCartStore } from '@/store/sellCartStore'
import { useRouter } from 'next/navigation'

const { useStepper, utils } = defineStepper(
  {
    id: 'shipping',
    title: 'Shipping',
    description: 'How will you ship us your items?',
  },
  { id: 'payout', title: 'Payout', description: 'Select how you want to be payed.' },
  { id: 'review', title: 'Review Order', description: 'Review and confirm your order.' }
)

export default function CheckoutStepper() {
  const router = useRouter()
  const { user } = useUser()
  const { data: addresses = [], isLoading } = useAddress()
  const { setData } = usePurchaseOrderCheckoutStore()
  const hasInitialized = useRef(false)

  const {
    address,
    package: pkg,
    service,
    pickup,
    payoutValid,
  } = usePurchaseOrderCheckoutStore((state) => state.data)

  const isShippingStepComplete =
    !!address?.is_valid &&
    !!pkg &&
    !!service &&
    !!pickup?.label &&
    (pickup.label !== 'CONTACT_FEDEX_TO_SCHEDULE' || (!!pickup.date && !!pickup.time))

  const emptyAddress: Address = {
    id: crypto.randomUUID(),
    user_id: user?.id ?? '',
    line_1: '',
    line_2: '',
    city: '',
    state: '',
    country: 'United States',
    zip: '',
    name: '',
    is_default: addresses.length === 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    phone_number: '',
    country_code: 'US',
    is_valid: false,
    is_residential: false,
  }

  const defaultAddress: Address =
    addresses.find((a) => a.is_default) ?? addresses[0] ?? emptyAddress

  useEffect(() => {
    if (!hasInitialized.current && addresses.length > 0) {
      setData({
        address: defaultAddress,
        insured: true,
        confirmation: false,
      })
      hasInitialized.current = true
    }
  }, [addresses])

  const stepper = useStepper()
  const currentIndex = utils.getIndex(stepper.current.id)

  const cartItems = sellCartStore((state) => state.items)

  if (cartItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center w-full p-10 text-center">
        <h2 className="text-xl font-semibold text-neutral-800">Your cart is empty</h2>
        <p className="text-sm text-muted-foreground mt-2">
          You need to add items before checking out.
        </p>
        <Button className="mt-6" onClick={() => router.push('sell')}>
          Add Items to Sell
        </Button>
      </div>
    )
  }

  return (
    <div className="flex w-full max-w-md lg:max-w-4xl justify-center p-5">
      <div className="flex flex-col w-full lg:grid lg:grid-cols-4 lg:gap-8">
        <div className="flex items-start lg:col-span-2 mb-4">
          <div className="hidden lg:flex lg:flex-col lg:sticky lg:top-40">
            <div className="flex items-center gap-3">
              <StepIndicator currentStep={currentIndex + 1} totalSteps={stepper.all.length} />
              <div className="flex flex-col">
                <h2 className="header-text">{stepper.current.title}</h2>
                <p className="secondary-text">{stepper.current.description}</p>
              </div>
            </div>
          </div>
          <div className="flex lg:hidden">
            <div className="flex items-center gap-3">
              <StepIndicator currentStep={currentIndex + 1} totalSteps={stepper.all.length} />
              <div className="flex flex-col">
                <h2 className="header-text">{stepper.current.title}</h2>
                <p className="secondary-text">{stepper.current.description}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          {stepper.switch({
            shipping: () => <ShippingStep addresses={addresses} emptyAddress={emptyAddress} />,
            payout: () => <PayoutStep user={user} />,
            review: () => <ReviewStep />,
          })}
          <div className="flex justify-between gap-4 mt-4">
            {stepper.current.id !== 'shipping' && (
              <Button
                type="button"
                variant="outline"
                onClick={stepper.prev}
                disabled={stepper.isFirst}
                className="bg-card hover:bg-card raised-off-page"
              >
                {stepper.current.id === 'payout'
                  ? 'Back to Shipping'
                  : stepper.current.id === 'review'
                  ? 'Back to Payment'
                  : 'Back'}
              </Button>
            )}

            {stepper.current.id !== 'review' && (
              <Button
                type="button"
                className="ml-auto raised-off-page primary-gradient shine-on-hover text-white"
                onClick={stepper.next}
                disabled={
                  (stepper.current.id === 'shipping' && !isShippingStepComplete) ||
                  (stepper.current.id === 'payout' && !payoutValid)
                }
              >
                {stepper.current.id === 'shipping'
                  ? 'Go to Payment'
                  : stepper.current.id === 'payout'
                  ? 'Review Order'
                  : 'Next'}
              </Button>
            )}
          </div>
        </div>
      </div>
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
          className="text-neutral-300"
        />
        <defs>
          <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#AE8625" />
            <stop offset="25%" stopColor="#F5D67D" />
            <stop offset="50%" stopColor="#D2AC47" />
            <stop offset="75%" stopColor="#EDC967" />
            <stop offset="100%" stopColor="#AE8625" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#goldGradient)"
          strokeWidth={strokeWidth}
          className="transition-all duration-300 ease-in-out"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
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
