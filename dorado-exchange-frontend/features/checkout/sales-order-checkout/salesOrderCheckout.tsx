'use client'

import { Button } from '@/shared/ui/base/button'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cartStore } from '@/store/cartStore'
import { useSalesOrderCheckoutStore } from '@/store/salesOrderCheckoutStore'
import ShippingSelect from './shipping/shippingSelect'

import { loadStripe } from '@stripe/stripe-js'
import { salesOrderCheckoutSchema } from '@/features/orders/salesOrders/types'
import { calculateSalesOrderPrices } from '@/utils/salesOrders/calculateSalesOrderPrices'
import { ShoppingCartIcon } from '@phosphor-icons/react'
import { useGetSession } from '@/features/auth/queries'
import { useMutationState } from '@tanstack/react-query'
import { makeEmptyAddress } from '@/features/addresses/types'
import { useSpotPrices } from '@/features/spots/queries'
import { useAddress } from '@/features/addresses/queries'
import { useSalesTax } from '@/features/sales-tax/queries'
import { useRetrievePaymentIntent, useUpdatePaymentIntent } from '@/features/stripe/queries'
import PaymentSelect from '@/features/checkout/sales-order-checkout/payment/paymentSelect'
import StripeWrapper from '@/features/stripe/ui/StripeWrapper'
import OrderSummary from '@/features/checkout/sales-order-checkout/summary/orderSummary'
import { useCreateSalesOrder } from '@/features/orders/salesOrders/users/queries'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

export default function SalesOrderCheckout() {
  const { user } = useGetSession()
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const emptyAddress = makeEmptyAddress(user?.id)

  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const { data } = useSalesOrderCheckoutStore()
  const cartItems = cartStore((state) => state.items)

  const { data: spotPrices = [] } = useSpotPrices()
  const { data: addresses = [], isPending: isAddressesPending } = useAddress()

  const { data: salesTax = 0 } = useSalesTax({
    address: data.address ?? emptyAddress,
    items: cartItems,
    spots: spotPrices,
  })

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

  const orderPrices = useMemo(() => {
    return calculateSalesOrderPrices(
      cartItems,
      data.using_funds ?? true,
      spotPrices,
      user?.dorado_funds ?? 0,
      data.service?.cost ?? 0,
      data.payment_method ?? 'CARD',
      salesTax ?? 0
    )
  }, [
    cartItems,
    data.using_funds,
    spotPrices,
    user?.dorado_funds,
    data.service?.cost,
    data.payment_method,
    salesTax,
  ])

  const cardNeeded = useMemo(() => {
    if (data.payment_method === 'CREDIT') {
      return false
    } else {
      return true
    }
  }, [data.payment_method])

  useEffect(() => {
    if (clientSecret && orderPrices.baseTotal > 0 && cardNeeded) {
      updatePaymentIntent.mutate({
        items: cartItems,
        using_funds: data?.using_funds ?? true,
        spots: spotPrices,
        user: user!,
        shipping_service: data.service?.value ?? 'STANDARD',
        payment_method: data.payment_method ?? 'CARD',
        type: 'sales_order_checkout',
        address_id: data?.address?.id ?? '',
      })
    }
  }, [
    cartItems,
    data.using_funds,
    spotPrices,
    clientSecret,
    orderPrices.baseTotal,
    data.payment_method,
    user,
    cardNeeded,
  ])

  const handleSubmit = () => {
    const checkoutPayload = {
      ...data,
      address: data.address!,
      service: data.service!,
      items: cartItems,
    }

    const validated = salesOrderCheckoutSchema.parse(checkoutPayload)

    createOrder.mutate(
      { sales_order: validated, spotPrices: spotPrices },
      {
        onSuccess: async () => {
          startTransition(() => {
            router.push('/order-placed')
          })
          cartStore.getState().clearCart()
          useSalesOrderCheckoutStore.getState().clear()
        },
      }
    )
  }

  if (cartItems.length === 0) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-center gap-4 pb-10 mt-10 lg:mt-30">
        <div className="relative mb-5">
          <ShoppingCartIcon size={80} strokeWidth={1.5} className='text-primary' />
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
            router.push('/buy')
          }}
          className="raised-off-page bg-primary text-white hover:text-white px-10"
        >
          Start Shopping
        </Button>
      </div>
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
            <div className="separator-inset" />
            <PaymentSelect orderPrices={orderPrices} />
            {clientSecret && data.address && cardNeeded && (
              <StripeWrapper
                clientSecret={clientSecret}
                stripePromise={stripePromise}
                address={data.address}
                setIsLoading={setIsLoading}
                isPending={isPending}
                startTransition={startTransition}
              />
            )}
          </div>
          <div className="flex flex-col gap-3 w-full sticky top-26">
            <OrderSummary orderPrices={orderPrices} />
            {!cardNeeded ? (
              <Button
                className="raised-off-page bg-primary w-full text-white"
                disabled={isOrderCreating || isLoading || !data.address?.is_valid || isPending}
                onClick={handleSubmit}
              >
                {isOrderCreating || isLoading || isPending ? 'Processing…' : 'Place Order'}
              </Button>
            ) : (
              <Button
                className="raised-off-page bg-primary w-full text-white"
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
