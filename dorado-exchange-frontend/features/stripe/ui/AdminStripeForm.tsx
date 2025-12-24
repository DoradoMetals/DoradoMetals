'use client'

import React, { useState, FormEvent } from 'react'
import { PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import type { StripePaymentElementOptions } from '@stripe/stripe-js'
import { Address } from '@/features/addresses/types'
import { useGetSession } from '@/features/auth/queries'
import {
  adminSalesOrderCheckoutSchema,
  paymentOptions,
} from '@/features/orders/salesOrders/types'

import { useAdminSalesOrderCheckoutStore } from '@/shared/store/adminSalesOrderCheckoutStore'
import { useDrawerStore } from '@/shared/store/drawerStore'
import { useAdminCreateSalesOrder } from '@/features/orders/salesOrders/admin/queries'

export default function AdminStripeForm({
  address,
  setIsLoading,
  isPending,
  startTransition,
}: {
  address: Address
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>
  isPending: boolean
  startTransition: (cb: () => void) => void
}) {
  const { data, setData } = useAdminSalesOrderCheckoutStore()

  const createOrder = useAdminCreateSalesOrder()
  const { closeDrawer } = useDrawerStore()

  const stripe = useStripe()
  const elements = useElements()
  const { user } = useGetSession()

  const [message, setMessage] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!stripe || !elements) return

    setIsLoading(true)
    setMessage(null)

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
      const checkoutPayload = {
        ...data,
        address: data.address!,
        service: data.service!,
        using_funds: data.using_funds,
        payment_method: data.payment_method,
        items: data.items,
        order_metals: data.order_metals,
        user: data.user,
      }

      const validated = adminSalesOrderCheckoutSchema.parse(checkoutPayload)

      createOrder.mutate(
        {
          paymentIntentId: paymentIntent.id,
          sales_order: validated,
        },
        {
          onSuccess: async () => {
            startTransition(() => {
              closeDrawer()
            })
            useAdminSalesOrderCheckoutStore.getState().clear()
          },
        }
      )
    } else if (error?.type === 'card_error' || error?.type === 'validation_error') {
      setMessage(error.message ?? 'A payment error occurred.')
    } else if (error) {
      setMessage(error.message ?? 'An unexpected payment error occurred.')
    }

    setIsLoading(false)
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
        phone: address.phone_number,
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
    <form id="admin-payment-form" onSubmit={handleSubmit}>
      <PaymentElement
        id="admin-payment-element"
        options={paymentElementOptions}
        onChange={(e) => {
          handleChangePaymentMethod(e.value.type)
        }}
      />
      <div className="text-xs text-destructive mt-1">
        {message && <div id="admin-payment-message">{message}</div>}
      </div>
    </form>
  )
}
