import type { Address } from "@dorado/contracts";
import { Elements } from '@stripe/react-stripe-js'
import { Stripe } from '@stripe/stripe-js'
import { createStripeAppearance } from '@/features/stripe/ui/appearance'
import StripePaymentForm from '@/features/stripe/ui/StripePaymentForm'
import type { ComponentProps } from 'react'

// The one Elements shell (D206). The customer checkout and the admin drawer
// both mount this; what differs between them rides the form's own props.
export default function StripeWrapper({
  clientSecret,
  stripePromise,
  ...formProps
}: {
  clientSecret: string
  stripePromise: Promise<Stripe | null>
  address: Address
} & Omit<ComponentProps<typeof StripePaymentForm>, 'clientSecret'>) {

  /* DARK, UNCONDITIONALLY. Light mode is gone (ruling 19 / the dark-only
     rebrand) and there is no `.dark` class on the document any more — this
     branch evaluated to 'light' and embedded a LIGHT Stripe payment form in a
     near-black checkout. Stripe Elements renders in an iframe on Stripe's
     origin and cannot see theme.css, so this JS object is the ONLY way the
     palette reaches it; a CSS fix cannot help here.
     ON THE MONEY PATH — must be re-verified against a live Stripe render, not
     a unit test. See MANUAL-VERIFICATION.md R12. */
  const theme = 'dark' as const
  const appearance = createStripeAppearance(theme)

  const loader = 'auto'

  return (
    <Elements options={{ clientSecret, appearance, loader }} stripe={stripePromise}>
      <StripePaymentForm clientSecret={clientSecret} {...formProps} />
    </Elements>
  )
}
