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

import { useCarrierHandoffs, useCarrierServiceOptions } from '@/features/shipping/queries'
import {
  useCheckoutRates,
  usePatchPurchaseCheckout,
  usePurchaseCheckoutRow,
  useSaveCheckoutPayout,
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

  // THE CARRIER'S OWN CATALOGUES, READ ONCE HERE AND INJECTED (ruling 14: the
  // parent holds the reads, the children take props).
  //
  // This is what wave 5B moved. The handoff options were a record in
  // features/handoff keyed by DROPOFF_AT_FEDEX_LOCATION and
  // CONTACT_FEDEX_TO_SCHEDULE, hand-written in the browser, and this
  // component branched on it. Neither list is spelled anywhere in frontend/
  // now. GET /checkout/rates replaced the client-assembled POST
  // /shipping/get_rates (no address/package/weight composed here any more),
  // but it answers the carrier's raw per-service quote, not a joined row -
  // the offered services list is still read and joined to it by code, same
  // as before.
  const { data: handoffs = [] } = useCarrierHandoffs()
  const { data: serviceOptions = [] } = useCarrierServiceOptions()

  // THE ROW ITSELF (D208): rates are the carrier answering "what does IT cost
  // to ship the parcel this row already describes", so the server 400s until
  // shipper_address_id and package_id are actually on it - which only a
  // landed PATCH puts there. Gate and key off the ROW, not the local pick.
  const { data: row } = usePurchaseCheckoutRow()
  const { data: rates = [], isLoading: ratesLoading } = useCheckoutRates('purchase', {
    address_id: row?.shipper_address_id,
    package_id: row?.package_id,
  })

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

  const patchCheckout = usePatchPurchaseCheckout()

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
    // The row takes it too (D208) - this IS the handler that picked the
    // address, it just picked it automatically rather than from a click.
    if (defaultAddress.is_valid) {
      patchCheckout.mutate({ shipper_address_id: defaultAddress.id })
    }

    hasInitialized.current = true
  }, [addresses.length, defaultAddress, linkOf, setData])

  const stepper = useStepper()
  const currentIndex = utils.getIndex(stepper.current.id)

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

  // NO NETWORK CALL HERE ANY MORE: every choice already landed on the row as
  // it was made, above. Advancing is a pure local check.
  const advanceFromShipping = () => {
    if (!isShippingStepComplete || !data.service?.id) return
    stepper.next()
  }

  // The rate ticks on the same 5-minute cadence as the reference read - if
  // the chosen service's price moved, the store's copy follows it.
  useEffect(() => {
    const currentServiceType = data.service?.serviceType
    if (!currentServiceType) return

    const freshRate = rates.find((r) => r.serviceType === currentServiceType)
    if (!freshRate || freshRate.netCharge == null) return

    if (freshRate.netCharge !== data.service?.netCharge) {
      setData({
        service: {
          ...data.service,
          netCharge: freshRate.netCharge,
          currency: freshRate.currency,
          deliveryDay: freshRate.deliveryDay ?? '',
          transitTime: freshRate.transitTime ? new Date(freshRate.transitTime) : new Date(),
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
                services={serviceOptions}
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
                    (!isShippingStepComplete || !data.service?.id)) ||
                  (stepper.current.id === 'payout' &&
                    (!data.payoutValid || savePayout.isPending))
                }
              >
                {stepper.current.id === 'shipping'
                  ? 'Go to Payment'
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
