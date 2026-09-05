'use client'

import { Button } from '@dorado/components'
import { ShoppingCart } from '@dorado/icons'
import { defineStepper } from '@stepperize/react'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

import ShippingStep from './shippingStep/shippingStep'
import PayoutStep from './payoutStep/payoutStep'
import ReviewStep from './reviewStep/reviewStep'
import { isPayoutComplete, toPayoutForm, usePayoutDraft } from './payoutStep/payoutDraft'
import { readyForPayment, resolveHandoff } from '@/shared/utils/gates'

import { useGetSession } from '@/shared/hooks/auth/queries'
import { useBasket } from '@/shared/hooks/checkout/items/queries'
import { useCarrierHandoffs } from '@dorado/client'
import {
  useFulfillment,
  useFulfillmentRates,
  usePurchaseCheckoutRow,
  useSaveCheckoutPayout,
} from '@/shared/hooks/checkout/queries'

// THE STEPPER RENDERS THE SERVER'S ROW.
//
// What left this file, and why it is the point of the lane:
//   - the default-address effect. `GET /checkout` sets the customer's default
//     shipping address on a row that has none, so the row arrives with it.
//   - the `isShippingStepComplete` expression over five store fields.
//     `row.missing` names whichever step is still outstanding - composed from
//     the checkout's own list and the draft fulfillment's (rulings 69/70) - and
//     `readyForPayment(row.missing)` (frontend/features/checkout/gates.ts) is
//     that same rule read off the list.
//   - the rate-refresh effect that copied a moved netCharge back into a store.
//     Nothing stores a rate: the row holds `carrier_service_id` and
//     `GET /checkout/rates` answers the live charge beside it.
//   - the client-side rate/catalogue join; the rates arrive joined.
//
// No effect remains. Every write is a mutation fired from the handler that
// made the choice, and every one answers the fresh row.
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
  const { user } = useGetSession()

  const { data: row } = usePurchaseCheckoutRow()
  // THE DRAFT FULFILLMENT IS THE SHIPPING STEP'S SUBJECT (rulings 69/70): the
  // row names it, and every handover choice is a column of ITS detail row.
  const { data: fulfillment } = useFulfillment(row?.fulfillment_id)
  const { data: rates = [], isLoading: ratesLoading } = useFulfillmentRates(fulfillment)
  const { data: handoffs = [] } = useCarrierHandoffs()
  // The one place the carrier's vocabulary and the draft's own method type
  // meet - resolved once here and handed down, rather than in each selector.
  const handoff = useMemo(
    () => resolveHandoff(handoffs, fulfillment?.method.type),
    [handoffs, fulfillment?.method.type]
  )
  const items = useBasket('purchase')

  const stepper = useStepper()
  const currentIndex = utils.getIndex(stepper.current.id)

  const savePayout = useSaveCheckoutPayout('purchase')
  const payout = usePayoutDraft((state) => state.payout)
  const [payoutError, setPayoutError] = useState<string | null>(null)

  // Leaving the PAYOUT step records the bank form server-side (D210) - the
  // numbers are sealed at rest there, and Confirm later links the row. Going
  // back and editing rewrites the same row.
  const advanceFromPayout = () => {
    if (!payout) return
    setPayoutError(null)
    savePayout.mutate(toPayoutForm(payout), {
      onSuccess: () => stepper.next(),
      onError: (error) => setPayoutError(error.message),
    })
  }

  if (items.length === 0) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-center gap-4 pb-10 mt-10 lg:mt-30">
        <div className="relative mb-5">
          <ShoppingCart size={80} className="text-primary" />
          <div className="absolute -top-6 right-3.5 border border-border rounded-full w-10 h-10 flex items-center justify-center">
            <strong className="text-primary">0</strong>
          </div>
        </div>

        <div className="flex-col items-center gap-1 mb-5">
          <h2>Your cart is empty!</h2>
          <p>Please add items before checking out.</p>
        </div>

        <Button size="xl" onClick={() => router.push('/sell')}>
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
                <h2>{stepper.current.title}</h2>
                <p>{stepper.current.description}</p>
              </div>
            </div>
          </div>

          <div className="flex lg:hidden">
            <div className="flex items-center gap-3">
              <StepIndicator currentStep={currentIndex + 1} totalSteps={stepper.all.length} />
              <div className="flex flex-col">
                <h2>{stepper.current.title}</h2>
                <p>{stepper.current.description}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 lg:mt-12">
          {stepper.switch({
            shipping: () => (
              <ShippingStep
                row={row}
                fulfillment={fulfillment}
                rates={rates}
                handoffs={handoffs}
                handoff={handoff}
                isLoading={ratesLoading}
              />
            ),
            payout: () => <PayoutStep user={user} />,
            review: () => (
              <ReviewStep row={row} fulfillment={fulfillment} rates={rates} handoff={handoff} />
            ),
          })}

          {payoutError && <p className="text-destructive mt-2">{payoutError}</p>}

          <div className="flex justify-between gap-4 mt-4">
            {stepper.current.id !== 'shipping' && (
              <Button
                type="button"
                variant="secondary"
                onClick={stepper.prev}
                disabled={stepper.isFirst}
              >
                {stepper.current.id === 'payout' ? 'Back to Shipping' : 'Back to Payment'}
              </Button>
            )}

            {stepper.current.id !== 'review' && (
              <Button
                type="button"
                className="ml-auto"
                onClick={stepper.current.id === 'shipping' ? stepper.next : advanceFromPayout}
                disabled={
                  // THE SERVER'S ANSWER, both times. `readyForPayment` reads
                  // every shipping choice off `row.missing`; the payout draft
                  // is the one thing no row can hold until it is complete.
                  stepper.current.id === 'shipping'
                    ? !row || !readyForPayment(row.missing)
                    : !isPayoutComplete(payout) || savePayout.isPending
                }
              >
                {stepper.current.id === 'shipping'
                  ? 'Go to Payment'
                  : savePayout.isPending
                    ? 'Saving…'
                    : 'Review Order'}
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
          className="text-placeholder"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-brand transition-all duration-300 ease-in-out"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <small aria-live="polite">
          {currentStep} of {totalSteps}
        </small>
      </div>
    </div>
  )
}
