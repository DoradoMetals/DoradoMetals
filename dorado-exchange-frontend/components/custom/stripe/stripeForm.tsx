import React, { useState, FormEvent } from 'react'
import { PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import type { StripePaymentElementOptions } from '@stripe/stripe-js'
import { Button } from '@/components/ui/button'

export default function StripeForm() {
  const stripe = useStripe()
  const elements = useElements()

  const [message, setMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(false)

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (!stripe || !elements) {
      return
    }

    setIsLoading(true)

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: 'http://localhost:3000/complete',
      },
    })

    if (error?.type === 'card_error' || error?.type === 'validation_error') {
      setMessage(error.message ?? 'A payment error occurred.')
    } else if (error) {
      setMessage('An unexpected error occurred.')
    }

    setIsLoading(false)
  }

  const paymentElementOptions: StripePaymentElementOptions = {
    layout: 'accordion',
    defaultValues: {
      billingDetails: {
        address: {
          country: 'US',
        },
      },
    },
    fields: {
      billingDetails: {
        address: {
          country: 'never',
        },
      },
    },
  }

  return (
    <form id="payment-form" onSubmit={handleSubmit}>
      <PaymentElement className="" id="payment-element" options={paymentElementOptions} />
      <Button
        disabled={isLoading || !stripe || !elements}
        id="submit"
        className="raised-off-page liquid-gold shine-on-hover w-full mt-4"
      >
        <span id="button-text" className="text-white">
          {isLoading ? <div className="text-white" id="spinner" /> : 'Pay now'}
        </span>
      </Button>
      {message && <div id="payment-message">{message}</div>}
    </form>
  )
}
