'use client'

import type { Address } from "@dorado/contracts";
import { Alert } from '@dorado/components'
import React, { useRef, useState, FormEvent } from 'react'
import { PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import type { StripePaymentElementOptions } from '@stripe/stripe-js'
import { PaymentMethodTypeValues } from '@/features/orders/salesOrders/types'
import { usePaymentMethods } from '@dorado/client'
import { orderAwaitingPayment } from '@/features/stripe/orderAwaitingPayment'

type PaymentMethod = (typeof PaymentMethodTypeValues)[number]

// THE ONE PAYMENT FORM (D206). The customer checkout and the admin drawer used
// to mount parallel copies of this file, and the copies had diverged where it
// mattered most: the customer copy was fixed to create-then-charge (D179) while
// the admin copy still charged first and created after - with paidButNoOrder as
// the apology when the second half failed - and it stamped the ADMIN's session
// name and email into the customer's billing details. One form now owns the
// ordering; the callers own everything that genuinely differs, as props:
//
//   billTo        - whose payment this is. The checkout passes the session
//                   user; the drawer passes the TARGET customer, never the
//                   admin driving it.
//   createOrder   - parse-and-POST, against the caller's own schema, store and
//                   mutation. Throwing here costs nothing: it runs BEFORE the
//                   charge, which is the entire point of the ordering.
//   onSuccess     - route away or close the drawer, and clear the caller's
//                   stores. Runs only when the payment settled.
//   formId        - the caller's submit button lives OUTSIDE this form and
//                   targets it by id, so the id is the caller's to name.
export default function StripePaymentForm({
  address,
  clientSecret,
  billTo,
  formId,
  createOrder,
  onSuccess,
  onPaymentMethodChange,
  setIsLoading,
}: {
  address: Address
  clientSecret: string
  billTo: { name?: string | null; email?: string | null }
  formId: string
  createOrder: (paymentIntentId: string) => Promise<void>
  onSuccess: () => void
  onPaymentMethodChange?: (method: PaymentMethod | undefined) => void
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>
}) {
  const stripe = useStripe()
  const elements = useElements()

  // The rows behind the element's own type strings (D207): Stripe reports
  // `card` / `us_bank_account` and the method row's provider_value maps it
  // back to the schema vocabulary the stores speak.
  const { data: saleMethods = [] } = usePaymentMethods('sale')

  const [message, setMessage] = useState<string | null>(null)

  // *** CREATE-THEN-CHARGE (phase 9). THE ORDER IS CREATED FIRST, THE CHARGE
  // HAPPENS LAST. *** This handler used to confirm the payment and then post
  // the order, and everything between the two was a paid customer with no
  // order (D179). Now:
  //
  //   1. createOrder - the caller parses its payload (nothing has happened
  //      yet; a throw costs nothing) and POSTs. The server verifies THIS
  //      intent belongs to the order's customer, prices the basket itself, sets
  //      the intent's amount to that price, and creates the order AWAITING
  //      PAYMENT.
  //   2. confirmPayment - the money moves last. Success calls onSuccess;
  //      failure means the order is saved, nothing was charged, and
  //      submitting again only retries the payment, because createdOrderRef
  //      remembers step 1.
  //
  // The caller clears its stores in onSuccess ONLY - not at creation -
  // because this component is mounted by the caller's own
  // `clientSecret && address && cardNeeded` condition, and clearing at
  // creation unmounts the payment element mid-flow.
  //
  // The intent id is derived from the client secret ("pi_..._secret_...") -
  // the same intent the Elements provider is bound to, known BEFORE confirm.
  const createdOrderRef = useRef<string | null>(null)
  const paymentIntentId = clientSecret.split('_secret')[0]

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!stripe || !elements) return

    setIsLoading(true)
    setMessage(null)

    try {
      if (!createdOrderRef.current) {
        await createOrder(paymentIntentId)
        createdOrderRef.current = paymentIntentId
      }

      const { paymentIntent, error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${process.env.NEXT_PUBLIC_FRONTEND_URL}/order-placed`,
          payment_method_data: {
            billing_details: {
              name: billTo.name ?? undefined,
              phone: address.phone_number,
              email: billTo.email ?? undefined,
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
        onSuccess()
      } else if (error) {
        setMessage(orderAwaitingPayment(error.message))
      }
    } catch (err) {
      // Creation failed, or the parse did - EITHER WAY NOTHING HAS BEEN
      // CHARGED, which is the entire point of the ordering. The basket is
      // intact; whoever is driving fixes the problem and submits again.
      const detail = err instanceof Error ? err.message : null
      setMessage(
        createdOrderRef.current
          ? orderAwaitingPayment(detail)
          : detail ?? 'We could not create the order. Nothing has been charged.'
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

  return (
    <form id={formId} onSubmit={handleSubmit}>
      <PaymentElement
        id={`${formId}-element`}
        options={paymentElementOptions}
        onChange={(e) => {
          onPaymentMethodChange?.(
            saleMethods.find((m) => m.provider_value === e.value.type)?.type as
              | PaymentMethod
              | undefined
          )
        }}
      />
      <small className="text-destructive mt-1">
        {message && (
          <Alert intent="warning" title="Payment not completed" className="mt-2">
            {message}
          </Alert>
        )}
      </small>
    </form>
  )
}
