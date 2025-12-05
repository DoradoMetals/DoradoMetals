'use client'

import { Button } from '@/components/ui/button'
import { defineStepper } from '@stepperize/react'
import ShippingStep from './shippingStep/shippingStep'
import PayoutStep from './payoutStep/payoutStep'
import { useAddress } from '@/lib/queries/useAddresses'
import { Address, emptyAddress } from '@/types/address'
import { useEffect, useMemo, useRef } from 'react'
import { usePurchaseOrderCheckoutStore } from '@/store/purchaseOrderCheckoutStore'
import ReviewStep from './reviewStep/reviewStep'
import { sellCartStore } from '@/store/sellCartStore'
import { useRouter } from 'next/navigation'
import { FedexRateInput, formatFedexRatesAddress } from '@/types/fedex'
import { useFedExRates } from '@/lib/queries/useFedex'
import { useSpotPrices } from '@/lib/queries/useSpotPrices'
import { useGetSession } from '@/lib/queries/useAuth'
import { ShoppingCartIcon } from '@phosphor-icons/react'
import getPrimaryIconStroke from '@/utils/getPrimaryIconStroke'
import { getDeclaredValue } from '@/utils/getDeclaredValue'
import getFedexRatesInput from '@/utils/getFedexRatesInput'

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
  const hasInitialized = useRef(false)

  const { user } = useGetSession()
  const { data: addresses = [] } = useAddress()
  const { data, setData } = usePurchaseOrderCheckoutStore()
  const { data: spotPrices = [] } = useSpotPrices()
  const items = sellCartStore((state) => state.items)

  const declaredValue = useMemo(() => {
    return getDeclaredValue(items, spotPrices)
  }, [items, spotPrices])

  useEffect(() => {
    if (data.insurance?.insured) {
      setData({
        insurance: {
          insured: true,
          declaredValue: {
            amount: declaredValue,
            currency: 'USD',
          },
        },
      })
    }
  }, [data.insurance?.insured, declaredValue])

  const isShippingStepComplete =
    !!data.address?.is_valid &&
    !!data.package &&
    !!data.service &&
    !!data.pickup?.label &&
    (data.pickup.label !== 'CONTACT_FEDEX_TO_SCHEDULE' ||
      (!!data.pickup.date && !!data.pickup.time))

  const defaultAddress: Address =
    addresses.find((a) => a.is_default) ?? addresses[0] ?? emptyAddress

  useEffect(() => {
    if (!hasInitialized.current && addresses.length > 0) {
      setData({
        address: defaultAddress,
        confirmation: false,
        fedexPackageToggle: false,
        insurance: {
          insured: true,
          declaredValue: {
            amount: declaredValue ?? 0,
            currency: 'USD',
          },
        },
      })
      hasInitialized.current = true
    }
  }, [addresses])

  const stepper = useStepper()
  const currentIndex = utils.getIndex(stepper.current.id)

  const cartItems = sellCartStore((state) => state.items)

  const fedexRatesInput = getFedexRatesInput({
    address: data.address ?? emptyAddress,
    package: data.package,
    shippingType: 'Inbound',
    pickupLabel: data.pickup?.label ?? 'DROPOFF_AT_FEDEX_LOCATION',
    insurance: data.insurance,
  })

  const { data: rates = [], isLoading: ratesLoading } = useFedExRates(fedexRatesInput)

  useEffect(() => {
    const currentServiceType = data.service?.serviceType
    const freshRate = rates.find((r) => r.serviceType === currentServiceType)

    if (currentServiceType && freshRate && freshRate.netCharge !== data.service?.netCharge) {
      setData({
        service: {
          code: data.service?.code ?? '',
          serviceType: data.service?.serviceType ?? '',
          serviceDescription: data.service?.serviceDescription ?? '',
          icon: data.service?.icon,
          netCharge: freshRate.netCharge,
          currency: freshRate.currency,
          transitTime: freshRate.transitTime ?? new Date(),
          deliveryDay: freshRate.deliveryDay ?? '',
        },
      })
    }
  }, [rates, data.service?.serviceType])

  if (cartItems.length === 0) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-center gap-4 pb-10 mt-10 lg:mt-30">
        <div className="relative mb-5">
          <ShoppingCartIcon size={80} strokeWidth={1.5} color={getPrimaryIconStroke()} />
          <div className="absolute -top-6 right-3.5 border border-borderr text-xl text-primary rounded-full w-10 h-10 flex items-center justify-center">
            0
          </div>
        </div>

        <div className="flex-col items-center gap-1 mb-5">
          <h2 className="text-xl text-neutral-900">Your cart is empty!</h2>
          <p className="text-xs text-neutral-700">Please add items before checking out.</p>
        </div>

        <Button
          variant="secondary"
          onClick={() => {
            router.push('/sell')
          }}
          className="raised-off-page bg-primary text-white hover:text-white px-10"
        >
          Start Shopping
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
                <h2 className="text-xl text-neutral-900">{stepper.current.title}</h2>
                <p className="text-sm text-neutral-600">{stepper.current.description}</p>
              </div>
            </div>
          </div>
          <div className="flex lg:hidden">
            <div className="flex items-center gap-3">
              <StepIndicator currentStep={currentIndex + 1} totalSteps={stepper.all.length} />
              <div className="flex flex-col">
                <h2 className="text-xl text-neutral-900">{stepper.current.title}</h2>
                <p className="text-sm text-neutral-600">{stepper.current.description}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 lg:mt-12">
          {stepper.switch({
            shipping: () => (
              <ShippingStep
                addresses={addresses}
                emptyAddress={emptyAddress}
                rates={rates}
                isLoading={ratesLoading}
              />
            ),
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
                className="ml-auto raised-off-page bg-primary text-white"
                onClick={stepper.next}
                disabled={
                  (stepper.current.id === 'shipping' && !isShippingStepComplete) ||
                  (stepper.current.id === 'payout' && !data.payoutValid)
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
