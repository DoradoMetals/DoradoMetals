'use client'

import { Button, Divider, EmptyState } from '@dorado/components'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useCheckoutItems } from '@/shared/store/checkoutItemsStore'
import { useClearCheckoutItems } from '@/features/checkout/items/queries'
import { useSalesOrderCheckoutStore } from '@/shared/store/salesOrderCheckoutStore'
import ShippingSelect from './shipping/shippingSelect'

import { loadStripe } from '@stripe/stripe-js'
import { ShoppingCartIcon } from '@phosphor-icons/react'
import { useGetSession } from '@/features/auth/queries'
import { useMutationState } from '@tanstack/react-query'
import { useAddress } from '@/features/addresses/queries'
import { useSalesOrderQuote } from '@/features/quotes/queries'
import { useRetrievePaymentIntent, useUpdatePaymentIntent } from '@/features/stripe/queries'
import PaymentSelect from '@/features/checkout/sales-order-checkout/payment/paymentSelect'
import StripeWrapper from '@/features/stripe/ui/StripeWrapper'
import OrderSummary from '@/features/checkout/sales-order-checkout/summary/orderSummary'
import { useCreateSalesOrder } from '@/features/orders/salesOrders/users/queries'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

export default function SalesOrderCheckout() {
  const { user } = useGetSession()
  const [isLoading, setIsLoading] = useState<boolean>(false)

  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const { data, setData } = useSalesOrderCheckoutStore()
  const items = useCheckoutItems((state) => state.sale)
  const clearItems = useClearCheckoutItems('sale')

  const { data: addresses = [], isPending: isAddressesPending } = useAddress()

  const createOrder = useCreateSalesOrder()
  const updatePaymentIntent = useUpdatePaymentIntent()
  const { data: clientSecret } = useRetrievePaymentIntent('sales_order_checkout')

  const isOrderCreating =
    useMutationState({
      filters: {
        mutationKey: ['createSalesOrder'],
        status: 'pending',
      },
      select: () => true,
    }).length > 0

  // Items and choices only - the server prices from its own spots, the session
  // user's funds, and the address's state. Until the first quote lands,
  // orderPrices is undefined and the summary renders zeros; nothing here
  // computes a fallback. `using_funds` is not sent (D214 item 11): credit
  // applies whenever the customer has a balance, same as placement.
  const quoteBody = useMemo(
    () => ({
      items: items.flatMap((item) =>
        item.bullion_id ? [{ id: item.bullion_id, quantity: item.quantity ?? 1 }] : []
      ),
      shipping_service: data.service?.value ?? null,
      payment_method: data.payment_method ?? 'CARD',
      address_id: data.address?.id ?? null,
    }),
    [items, data.service?.value, data.payment_method, data.address?.id]
  )

  const { data: orderPrices } = useSalesOrderQuote(quoteBody)

  const cardNeeded = useMemo(() => {
    if (data.payment_method === 'CREDIT') {
      return false
    } else {
      return true
    }
  }, [data.payment_method])

  // No `spots`, `using_funds` or `user`: the server prices at its own live
  // feed, applies credit whenever the customer has a balance, and this is
  // the customer's own intent - keyed by their session, not a body field.
  useEffect(() => {
    if (clientSecret && (orderPrices?.base_total ?? 0) > 0 && cardNeeded) {
      updatePaymentIntent.mutate({
        items,
        shipping_service: data.service?.value ?? 'STANDARD',
        payment_method: data.payment_method ?? 'CARD',
        type: 'sales_order_checkout',
        address_id: data?.address?.id ?? '',
      })
    }
  }, [
    items,
    clientSecret,
    orderPrices?.base_total,
    data.payment_method,
    data.service?.value,
    cardNeeded,
  ])

  const finishCheckout = () => {
    startTransition(() => {
      router.push('/order-placed')
    })
    useCheckoutItems.getState().clear('sale')
    clearItems.mutate()
    useSalesOrderCheckoutStore.getState().clear()
  }

  // What the payment form calls BEFORE the charge (create-then-charge, D179):
  // freeze the LIVE basket, not a render's snapshot, then create. A throw here
  // reaches the form's message and nothing has been charged.
  //
  // paymentIntentId is no longer forwarded: the create body is a checkout id
  // now, and the server links the caller's own OPEN intent by user_id - see
  // features/orders/salesOrders/users/queries.ts.
  const form = () => {
    if (!data.address || !data.service) throw new Error('The checkout is not complete')
    return { ...data, address: data.address, service: data.service }
  }

  const createOrderForIntent = async (_paymentIntentId: string) => {
    await createOrder.mutateAsync({ sales_order: form() })
  }

  const handleSubmit = () => {
    createOrder.mutate({ sales_order: form() }, { onSuccess: finishCheckout })
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
            <ShippingSelect
              addresses={addresses}
              isLoading={isAddressesPending}
              orderPrices={orderPrices}
            />
            <Divider />
            <PaymentSelect orderPrices={orderPrices} />
            {clientSecret && data.address && cardNeeded && (
              <StripeWrapper
                clientSecret={clientSecret}
                stripePromise={stripePromise}
                address={data.address}
                formId="payment-form"
                billTo={{ name: user?.name, email: user?.email }}
                createOrder={createOrderForIntent}
                onSuccess={finishCheckout}
                onPaymentMethodChange={(method) => {
                  if (data.payment_method !== 'CREDIT') {
                    setData({ payment_method: method })
                  }
                }}
                setIsLoading={setIsLoading}
              />
            )}
          </div>
          <div className="flex flex-col gap-3 w-full sticky top-26">
            <OrderSummary orderPrices={orderPrices} />
            {!cardNeeded ? (
              <Button
                className="w-full"
                disabled={isOrderCreating || isLoading || !data.address?.is_valid || isPending}
                onClick={handleSubmit}
              >
                {isOrderCreating || isLoading || isPending ? 'Processing…' : 'Place Order'}
              </Button>
            ) : (
              <Button
                className="w-full"
                disabled={
                  isOrderCreating ||
                  isLoading ||
                  !clientSecret ||
                  !stripePromise ||
                  !data.address?.is_valid ||
                  isPending
                }
                type="submit"
                form="payment-form"
              >
                {!data.address?.is_valid
                  ? 'Please provide a valid address.'
                  : isOrderCreating || isLoading || isPending
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
