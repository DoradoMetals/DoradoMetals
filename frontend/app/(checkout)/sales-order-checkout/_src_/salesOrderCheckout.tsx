'use client'

import { Button, Divider, EmptyState } from '@dorado/components'
import { ShoppingCart } from '@dorado/icons'
import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { loadStripe } from '@stripe/stripe-js'

import { useBasket, useClearCheckoutLots } from '@/shared/hooks/checkout/lots/queries'
import ShippingSelect from './shipping/shippingSelect'
import { useGetSession } from '@/shared/hooks/auth/queries'
import { usePaymentIntentSecret } from '@dorado/client'
import PaymentSelect from './payment/paymentSelect'
import StripeWrapper from '@/shared/ui/StripeWrapper'
import OrderSummary from './summary/orderSummary'
import { useAddress } from '@/shared/hooks/addresses/queries'
import {
  useCreateFulfillment,
  useFulfillment,
  useSaleCheckoutRow,
  usePlaceOrderFromCheckout,
} from '@/shared/hooks/checkout/queries'
import { useCheckoutQuote } from '@/shared/hooks/quotes/queries'
import { readyForPayment, readyToPlace } from '@/shared/utils/gates'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

// THE BUY CHECKOUT RENDERS THE SALE CHECKOUT ROW.
//
// Gone with the store: the address, the service and the payment method, all
// three of which are columns; the `quoteBody` useMemo that assembled a request
// out of them; the effect that pushed a payment-intent update every time any
// of them moved; and the `form()` document the create used to send. The create
// is `checkout_id` and nothing else, and every choice reached the row from the
// click that made it.
export default function SalesOrderCheckout() {
  const { user } = useGetSession()
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const items = useBasket('sale')
  const { data: row } = useSaleCheckoutRow()
  const { data: addresses = [], isPending: isAddressesPending } = useAddress()
  const { data: clientSecret } = usePaymentIntentSecret('sales_order_checkout')
  // EVERY CHECKOUT NEEDS A DRAFT FULFILLMENT to be placeable (rulings 69/70) -
  // the buy side has no handover step, so it asks for the direction's default
  // the moment the row says it has none, and never asks twice.
  const { data: fulfillment } = useFulfillment(row?.fulfillment_id)
  const createFulfillment = useCreateFulfillment()
  const needsDraft = !!row && row.missing.includes('fulfillment_id')
  useEffect(() => {
    if (needsDraft && !createFulfillment.isPending) {
      createFulfillment.mutate({ checkout_id: row!.id })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsDraft, row?.id])
  // THE QUOTE IS THE ROW, PRICED. Its body used to be assembled here from the
  // row, the basket and the draft fulfillment's parcel; the server reads all
  // three itself.
  const { data: answer } = useCheckoutQuote('sale', { enabled: !!row })
  const quote = answer?.direction === 'sale' ? answer : undefined
  const placeOrder = usePlaceOrderFromCheckout('sale')

  const address = addresses.find((a) => a.id === row?.recipient_address_id)

  // WHICH SURFACE TO SHOW IS THE SERVER'S ANSWER, not an expression here. This
  // was `!quote || quote.beginning_funds < quote.base_total` - the browser
  // comparing a balance to a total and mounting (or not mounting) Stripe's
  // element on the result, which is the last piece of money reasoning left in
  // the browser and the one most expensive to get wrong. `payment_surface` is
  // a field of the quote, derived from the amount Stripe is actually told
  // (domain/payments/rules.ts), so it also sees the sliver held back below
  // Stripe's minimum that the old comparison could not.
  const cardNeeded = quote?.payment_surface !== 'credit'

  // The basket the order was built from is emptied SERVER-side - there is no
  // browser copy to clear (ruling 63). The purchase side does this in the use
  // case itself; the sale side does not, so the surface asks.
  const clearBasket = useClearCheckoutLots('sale')

  const finishCheckout = () => {
    startTransition(() => router.push('/order-placed'))
    clearBasket.mutate()
  }

  const place = async () => {
    setMessage(null)
    await placeOrder.mutateAsync()
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<ShoppingCart />}
        badge={0}
        title="You have nothing to buy yet!"
        description="Please add items before checking out."
        className="h-full justify-center pb-10 mt-10 lg:mt-30"
        action={
          <Button size="xl" onClick={() => router.push('/buy')}>
            Start Shopping
          </Button>
        }
      />
    )
  }

  return (
    <div className="flex w-full justify-center p-4 lg:mt-10">
      {!isAddressesPending && (
        <div className="flex flex-col lg:flex-row items-center lg:items-start w-full lg:max-w-7xl justify-between gap-6">
          <div className="flex flex-col gap-6 w-full">
            <ShippingSelect
              addresses={addresses}
              row={row}
              fulfillment={fulfillment}
              orderPrices={quote}
            />
            <Divider />
            <PaymentSelect orderPrices={quote} />
            {clientSecret && address && cardNeeded && (
              <StripeWrapper
                clientSecret={clientSecret}
                stripePromise={stripePromise}
                address={address}
                formId="payment-form"
                billTo={{ name: user?.name, email: user?.email }}
                createOrder={place}
                onSuccess={finishCheckout}
                setIsLoading={setIsLoading}
              />
            )}
          </div>
          <div className="flex flex-col gap-3 w-full sticky top-26">
            <OrderSummary row={row} orderPrices={quote} />
            {message && <p className="text-destructive">{message}</p>}
            {!cardNeeded ? (
              <Button
                className="w-full"
                // `missing` is the composed answer (rulings 69/70): the
                // checkout's own steps plus whatever the draft fulfillment
                // still owes - `readyToPlace` is that list empty.
                disabled={
                  placeOrder.isPending ||
                  isLoading ||
                  isPending ||
                  !row ||
                  !readyToPlace(row.missing)
                }
                onClick={() => {
                  setMessage(null)
                  placeOrder.mutate(undefined, {
                    onSuccess: finishCheckout,
                    onError: (err) => setMessage(err.message),
                  })
                }}
              >
                {placeOrder.isPending || isLoading || isPending ? 'Processing…' : 'Place Order'}
              </Button>
            ) : (
              <Button
                className="w-full"
                disabled={
                  placeOrder.isPending ||
                  isLoading ||
                  isPending ||
                  !clientSecret ||
                  !stripePromise ||
                  !row ||
                  !readyForPayment(row.missing)
                }
                type="submit"
                form="payment-form"
              >
                {address && !address.is_valid
                  ? 'Please provide a valid address.'
                  : placeOrder.isPending || isLoading || isPending
                    ? 'Processing…'
                    : 'Place Order'}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
