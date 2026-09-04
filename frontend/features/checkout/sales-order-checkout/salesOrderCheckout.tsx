'use client'

import { Button, Divider, EmptyState } from '@dorado/components'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { loadStripe } from '@stripe/stripe-js'
import { ShoppingCartIcon } from '@phosphor-icons/react'

import { useBasket, useClearCheckoutItems } from '@/features/checkout/items/queries'
import ShippingSelect from './shipping/shippingSelect'
import { useGetSession } from '@/features/auth/queries'
import { useRetrievePaymentIntent } from '@/features/stripe/queries'
import PaymentSelect from '@/features/checkout/sales-order-checkout/payment/paymentSelect'
import StripeWrapper from '@/features/stripe/ui/StripeWrapper'
import OrderSummary from '@/features/checkout/sales-order-checkout/summary/orderSummary'
import { useAddress } from '@/features/addresses/queries'
import { useSaleCheckoutRow, usePlaceOrderFromCheckout } from '@/features/checkout/queries'
import { useSaleQuoteFor } from '@/features/checkout/sales-order-checkout/saleQuote'

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
  const { data: clientSecret } = useRetrievePaymentIntent('sales_order_checkout')
  const quote = useSaleQuoteFor(row, items)
  const placeOrder = usePlaceOrderFromCheckout('sale')

  const address = addresses.find((a) => a.id === row?.recipient_address_id)
  // DISPLAY LOGIC, NOT MONEY (ruling 47): credit applies whenever a balance
  // exists, and a balance that covers the base total means there is nothing
  // for a card to do.
  const cardNeeded = !quote || quote.beginning_funds < quote.base_total

  // The basket the order was built from is emptied SERVER-side - there is no
  // browser copy to clear (ruling 63). The purchase side does this in the use
  // case itself; the sale side does not, so the surface asks.
  const clearBasket = useClearCheckoutItems('sale')

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
        icon={<ShoppingCartIcon />}
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
            <ShippingSelect addresses={addresses} row={row} orderPrices={quote} />
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
                // THE ROW'S OWN ANSWER: an address, a service and a payment
                // method, all landed.
                disabled={
                  placeOrder.isPending || isLoading || isPending || row?.ready_to_place !== true
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
                  row?.ready_for_payment !== true
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
