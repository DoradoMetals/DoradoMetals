'use client'

import React, { useRef, useState, FormEvent } from 'react'
import { PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import type { StripePaymentElementOptions } from '@stripe/stripe-js'
import { Address } from '@/features/addresses/types'
import { useGetSession } from '@/features/auth/queries'
import { useSalesOrderCheckoutStore } from '@/shared/store/salesOrderCheckoutStore'
import { paymentOptions, salesOrderCheckoutSchema } from '@/features/orders/salesOrders/types'
import { useRouter } from 'next/navigation'
import { cartStore } from '@/shared/store/cartStore'
import { useSpotPrices } from '@/features/spots/queries'
import { useCreateSalesOrder } from '@/features/orders/salesOrders/users/queries'
import { orderAwaitingPayment } from '@/features/stripe/orderAwaitingPayment'

export default function SalesOrderStripeForm({
  address,
  clientSecret,
  setIsLoading,
  isPending,
  startTransition,
}: {
  address: Address
  clientSecret: string
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>
  isPending: boolean
  startTransition: (cb: () => void) => void
}) {
  const orderData = useSalesOrderCheckoutStore((state) => state.data)

  const { data, setData } = useSalesOrderCheckoutStore()

  const { data: spotPrices = [] } = useSpotPrices()
  const createOrder = useCreateSalesOrder()
  const router = useRouter()

  const stripe = useStripe()
  const elements = useElements()
  const { user } = useGetSession()

  const [message, setMessage] = useState<string | null>(null)

  // *** CREATE-THEN-CHARGE (phase 9). THE ORDER IS CREATED FIRST, THE CHARGE
  // HAPPENS LAST. *** This handler used to confirm the payment and then post
  // the order, and everything between the two was a paid customer with no
  // order (D179) - the try/catch and paidButNoOrder message were bandages on
  // that ordering. Now:
  //
  //   1. parse the payload (nothing has happened yet; a throw costs nothing)
  //   2. POST create_sales_order - the server verifies THIS intent is ours,
  //      prices the cart itself, sets the intent's amount to that price, and
  //      creates the order AWAITING PAYMENT
  //   3. confirmPayment - the money moves last. Success routes; failure means
  //      the order is saved, nothing was charged, and submitting again only
  //      retries the payment, because createdOrderRef remembers step 2.
  //
  // The cart and the checkout store are cleared ON SUCCESS ONLY - not at
  // creation - because this very component is mounted by
  // `clientSecret && data.address && cardNeeded`, and clearing at creation
  // unmounts the payment element mid-flow. The cost is that an abandoned
  // checkout leaves its cart behind alongside an awaiting order; the server
  // supersedes that order on the next attempt, and the abandonment sweep
  // cancels it (refunding any reserved credit) if the customer never returns.
  //
  // The intent id is derived from the client secret ("pi_..._secret_...") -
  // the same intent the Elements provider is bound to, known BEFORE confirm,
  // which the old ordering never needed.
  const createdOrderRef = useRef<string | null>(null)
  const paymentIntentId = clientSecret.split('_secret')[0]

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!stripe || !elements) return

    setIsLoading(true)
    setMessage(null)

    try {
      if (!createdOrderRef.current) {
        const liveItems = cartStore.getState().items
        const checkoutPayload = {
          ...orderData,
          address: orderData.address!,
          service: orderData.service!,
          items: liveItems,
        }
        const validated = salesOrderCheckoutSchema.parse(checkoutPayload)

        const created = await createOrder.mutateAsync({
          paymentIntentId,
          sales_order: validated,
          spotPrices: spotPrices,
        })
        createdOrderRef.current = (created as { id?: string })?.id ?? 'created'
      }

      const { paymentIntent, error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${process.env.NEXT_PUBLIC_FRONTEND_URL}/order-placed`,
          payment_method_data: {
            billing_details: {
              name: user?.name,
              phone: address.phone_number,
              email: user?.email,
              address: {
                line1: address.line_1,
                line2: address.line_2,
                city: address.city,
                state: address.state,
                postal_code: address.zip,
                country: address.country_code,
              },
            },
          },
        },
        redirect: 'if_required',
      })

      if (paymentIntent?.status === 'succeeded' || paymentIntent?.status === 'processing') {
        startTransition(() => {
          router.push('/order-placed')
        })
        cartStore.getState().clearCart()
        useSalesOrderCheckoutStore.getState().clear()
      } else if (error?.type === 'card_error' || error?.type === 'validation_error') {
        setMessage(orderAwaitingPayment(error.message))
      } else if (error) {
        setMessage(orderAwaitingPayment(error.message))
      }
    } catch (err) {
      // Creation failed, or the parse did - EITHER WAY NOTHING HAS BEEN
      // CHARGED, which is the entire point of the ordering. The cart is
      // intact; the customer fixes the problem and submits again.
      const detail = err instanceof Error ? err.message : null
      setMessage(
        createdOrderRef.current
          ? orderAwaitingPayment(detail)
          : detail ?? 'We could not create your order. You have not been charged.'
      )
    } finally {
      setIsLoading(false)
    }
  }

  const paymentElementOptions: StripePaymentElementOptions = {
    layout: {
      type: 'accordion',
      defaultCollapsed: false,
      radios: false,
      spacedAccordionItems: true,
    },
    defaultValues: {
      billingDetails: {
        phone: address.phone_number ?? '',
        address: {
          line1: address.line_1 ?? '',
          line2: address.line_2 ?? '',
          city: address.city ?? '',
          state: address.state ?? '',
          postal_code: address.zip ?? '',
          country: address.country_code ?? '',
        },
      },
    },
    fields: {
      billingDetails: {
        address: {
          line1: 'never',
          line2: 'never',
          city: 'never',
          state: 'never',
          postalCode: 'never',
          country: 'never',
        },
        name: 'auto',
        email: 'never',
        phone: 'never',
      },
    },
  }

  const handleChangePaymentMethod = (method: string) => {
    if (data.payment_method !== 'CREDIT') {
      const paymentMethod = paymentOptions.find((p) => p.value === method)?.method
      setData({
        payment_method: paymentMethod,
      })
    }
  }

  return (
    <form id="payment-form" onSubmit={handleSubmit}>
      <PaymentElement
        id="payment-element"
        options={paymentElementOptions}
        onChange={(e) => {
          handleChangePaymentMethod(e.value.type)
        }}
      />
      <small className="text-destructive mt-1">
        {message && <span id="payment-message">{message}</span>}
      </small>
    </form>
  )
}
