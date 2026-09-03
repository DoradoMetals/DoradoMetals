'use client'

import { Button } from '@dorado/components'
import { defineStepper } from '@stepperize/react'
import ShippingStep from './shippingStep/shippingStep'
import PayoutStep from './payoutStep/payoutStep'
import ReviewStep from '@/features/checkout/purchase-order-checkout/reviewStep/reviewStep'

import { Address, makeEmptyAddress } from '@/features/addresses/types'
import { useEffect, useMemo, useRef } from 'react'
import { usePurchaseOrderCheckoutStore } from '@/shared/store/purchaseOrderCheckoutStore'
import { useCheckoutItems } from '@/shared/store/checkoutItemsStore'
import { useRouter } from 'next/navigation'
import { useGetSession } from '@/features/auth/queries'
import { ShoppingCartIcon } from '@phosphor-icons/react'

import { useAddress, useUserAddresses } from '@/features/addresses/queries'
import { usePurchaseOrderQuote } from '@/features/quotes/queries'

import { useCarrierHandoffs } from '@/features/shipping/queries'
import {
  useCheckoutRates,
  useSaveCheckoutPayout,
  useSyncPurchaseCheckout,
} from '@/features/checkout/queries'

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

  // THE CARRIER'S OWN CATALOGUE, READ ONCE HERE AND INJECTED (ruling 14: the
  // parent holds the reads, the children take props).
  //
  // This is what wave 5B moved. The handoff options were a record in
  // features/handoff keyed by DROPOFF_AT_FEDEX_LOCATION and
  // CONTACT_FEDEX_TO_SCHEDULE, hand-written in the browser, and this
  // component branched on it. Neither list is spelled anywhere in frontend/
  // now, and the rates ruling took the services catalogue with it: GET
  // /checkout/rates answers one already-priced row per offered service, so
  // there is no separate services list to join by code any more, and no
  // rate request the browser assembles.
  const { data: handoffs = [] } = useCarrierHandoffs()
  const { data: rates = [], isLoading: ratesLoading } = useCheckoutRates('purchase')

  const { data: addresses = [] } = useAddress()
  const { data, setData } = usePurchaseOrderCheckoutStore()
  const items = useCheckoutItems((state) => state.purchase)

  // The store's items ARE the quote request array - lines come back matched
  // by request index, so nothing may filter or reorder between here and there.
  const { data: quote } = usePurchaseOrderQuote(items)

  // Resolved against the reference list rather than compared to a carrier's
  // string. `requires_schedule` is the option's own answer to "does this need a
  // date and a time", so a third handoff needs no edit here.
  const selectedHandoff = useMemo(
    () => handoffs.find((h) => h.code === data.pickup?.label) ?? null,
    [handoffs, data.pickup?.label]
  )

  const isShippingStepComplete =
    !!data.address?.is_valid &&
    !!data.package &&
    !!data.service &&
    !!data.pickup?.label &&
    (!selectedHandoff?.requires_schedule || (!!data.pickup.date && !!data.pickup.time))

  const { data: links = [] } = useUserAddresses()
  const linkOf = useMemo(() => new Map(links.map((l) => [l.address_id, l])), [links])
  const defaultAddress: Address | undefined =
    addresses.find((a) => linkOf.get(a.id)?.default_shipping) ?? addresses[0]

  useEffect(() => {
    if (hasInitialized.current) return
    if (addresses.length === 0 || !defaultAddress) return

    setData({
      address: defaultAddress,
      user_address: linkOf.get(defaultAddress.id),
      confirmation: false,
      fedexPackageToggle: false,
      // RULING 58: the browser never computes a declared value - the field
      // stays a static placeholder for a schema this form shares with the
      // return-shipment feature, which does send a real one.
      insurance: {
        insured: true,
        declaredValue: { amount: 0, currency: 'USD' },
      },
    })

    hasInitialized.current = true
  }, [addresses.length, defaultAddress, linkOf, setData])

  const stepper = useStepper()
  const currentIndex = utils.getIndex(stepper.current.id)

  // ONE SYNCHRONISATION when the customer leaves the shipping step (D208):
  // the checkout ROW takes the ids, the draft fulfillment takes the handoff.
  // Going back and forward re-writes the same choices - idempotent by
  // construction, so there is nothing to diff.
  const syncCheckout = useSyncPurchaseCheckout()
  const savePayout = useSaveCheckoutPayout()

  // Leaving the PAYOUT step records the bank form server-side (D210) - the
  // numbers are sealed at rest there, and Confirm later links the row. Going
  // back and editing simply rewrites the same row.
  const advanceFromPayout = async () => {
    try {
      await savePayout.mutateAsync({ ...data.payout })
      stepper.next()
    } catch {
      // The form was refused - stay on the step; the fields are intact.
    }
  }

  const advanceFromShipping = async () => {
    if (!data.address?.id || !data.package?.id || !data.service?.id || !data.pickup?.label) return
    try {
      // RULING 58: no package_weight, no declared_value - the browser sends
      // neither. The server owns the parcel's weight and its insured value.
      await syncCheckout.mutateAsync({
        shipper_address_id: data.address.id,
        package_id: data.package.id,
        carrier_service_id: data.service.id,
        handoff_code: data.pickup.label,
        pickup_date: data.pickup.date ?? null,
        pickup_time: data.pickup.time ?? null,
      })
      stepper.next()
    } catch {
      // The row refused (a stale id, a dead session) - stay on the step; the
      // selections are intact and the retry is the same click.
    }
  }

  // The rate ticks on the same 5-minute cadence as the reference read - if
  // the chosen service's price moved, the store's copy follows it.
  useEffect(() => {
    const currentServiceType = data.service?.serviceType
    if (!currentServiceType) return

    const freshRate = rates.find((r) => r.code === currentServiceType)
    if (!freshRate) return

    if (freshRate.net_charge !== data.service?.netCharge) {
      setData({
        service: {
          ...data.service,
          serviceType: freshRate.code,
          serviceDescription: freshRate.name,
          netCharge: freshRate.net_charge,
          currency: freshRate.currency,
          deliveryDay: freshRate.delivery_day ?? '',
          transitTime: freshRate.transit_time ? new Date(freshRate.transit_time) : new Date(),
        } as any,
      })
    }
  }, [rates, data.service?.serviceType, data.service?.netCharge, setData])

  if (items.length === 0) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-center gap-4 pb-10 mt-10 lg:mt-30">
        <div className="relative mb-5">
          <ShoppingCartIcon size={80} strokeWidth={1.5} className="text-primary" />
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
                addresses={addresses}
                emptyAddress={makeEmptyAddress()}
                rates={rates}
                handoffs={handoffs}
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
                variant="secondary"
                onClick={stepper.prev}
                disabled={stepper.isFirst}
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
                className="ml-auto"
                onClick={
                  stepper.current.id === 'shipping'
                    ? advanceFromShipping
                    : stepper.current.id === 'payout'
                    ? advanceFromPayout
                    : stepper.next
                }
                disabled={
                  (stepper.current.id === 'shipping' &&
                    (!isShippingStepComplete || !data.service?.id || syncCheckout.isPending)) ||
                  (stepper.current.id === 'payout' &&
                    (!data.payoutValid || savePayout.isPending))
                }
              >
                {stepper.current.id === 'shipping'
                  ? syncCheckout.isPending
                    ? 'Saving…'
                    : 'Go to Payment'
                  : stepper.current.id === 'payout'
                  ? savePayout.isPending
                    ? 'Saving…'
                    : 'Review Order'
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
