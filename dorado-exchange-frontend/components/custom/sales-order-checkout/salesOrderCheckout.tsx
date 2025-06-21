'use client'

import { Button } from '@/components/ui/button'
import { useAddress } from '@/lib/queries/useAddresses'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSpotPrices } from '@/lib/queries/useSpotPrices'
import { useUser } from '@/lib/authClient'
import { cartStore } from '@/store/cartStore'
import { useSalesOrderCheckoutStore } from '@/store/salesOrderCheckoutStore'
import ShippingSelect from './shipping/shippingSelect'

import { loadStripe } from '@stripe/stripe-js'
import { useRetrievePaymentIntent, useUpdatePaymentIntent } from '@/lib/queries/useStripe'
import StripeWrapper from '../stripe/StripeWrapper'
import PaymentSelect from './payment/paymentSelect'
import { salesOrderCheckoutSchema } from '@/types/sales-orders'
import { useCreateSalesOrder } from '@/lib/queries/useSalesOrders'
import { calculateSalesOrderPrices } from '@/utils/calculateSalesOrderPrices'
import OrderSummary from './summary/orderSummary'
import { useSalesTax } from '@/lib/queries/useSalesTax'
import { emptyAddress } from '@/types/address'
import { ShoppingCartIcon } from '@phosphor-icons/react'
import getPrimaryIconStroke from '@/utils/getPrimaryIconStroke'
import { useGetSession } from '@/lib/queries/useAuth'
import { useMutationState } from '@tanstack/react-query'
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

export default function SalesOrderCheckout() {
  const [isLoading, setIsLoading] = useState<boolean>(false)

  const router = useRouter()

  const { data } = useSalesOrderCheckoutStore()
  const cartItems = cartStore((state) => state.items)

  const { data: spotPrices = [] } = useSpotPrices()
  const { data: addresses = [], isPending: isAddressesPending } = useAddress()

  const { data: salesTax = 0 } = useSalesTax({
    address: data.address ?? emptyAddress,
    items: cartItems,
    spots: spotPrices,
  })

  const { user } = useGetSession()
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
      data.payment_method ?? 'CARD_AND_FUNDS',
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
    if (data.payment_method === 'FUNDS') {
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
        payment_method: data.payment_method ?? 'CARD_AND_FUNDS',
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
        onSuccess: () => {
          router.push('/order-placed')
          cartStore.getState().clearCart()
          useSalesOrderCheckoutStore.getState().clear()
        },
      }
    )
  }

  if (cartItems.length === 0) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-center gap-4 pb-10 mt-10">
        <div className="relative mb-5">
          <ShoppingCartIcon size={80} strokeWidth={1.5} color={getPrimaryIconStroke()} />
          <div className="absolute -top-6 right-3.5 border border-borderr text-xl text-primary-gradient rounded-full w-10 h-10 flex items-center justify-center">
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
          className="raised-off-page liquid-gold text-white hover:text-white shine-on-hover px-10"
        >
          Start Shopping
        </Button>
      </div>
    )
  }

  return (
    <div className="flex w-full justify-center p-4">
      {!isAddressesPending && data.address && (
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
              />
            )}
          </div>
          <div className="flex flex-col gap-3 w-full lg:mt-5">
            <OrderSummary orderPrices={orderPrices} />
            {!cardNeeded ? (
              <Button
                className="raised-off-page liquid-gold shine-on-hover w-full text-white"
                disabled={isOrderCreating || isLoading}
                onClick={handleSubmit}
              >
                {isOrderCreating || isLoading ? 'Processing…' : 'Place Order'}
              </Button>
            ) : (
              <Button
                className="raised-off-page liquid-gold shine-on-hover w-full text-white"
                disabled={isOrderCreating || isLoading}
                type="submit"
                form="payment-form"
              >
                {isOrderCreating || isLoading ? 'Processing…' : 'Place Order'}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
