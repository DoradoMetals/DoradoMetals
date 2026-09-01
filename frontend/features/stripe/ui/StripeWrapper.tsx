import { Elements } from '@stripe/react-stripe-js'
import { Stripe } from '@stripe/stripe-js'
import { Address } from '@/features/addresses/types'
import { createStripeAppearance } from '@/features/stripe/ui/appearance'
import SalesOrderStripeForm from '@/features/stripe/ui/SalesOrderStripeForm'

export default function StripeWrapper({
  clientSecret,
  stripePromise,
  address,
  setIsLoading,
  isPending,
  startTransition,
}: {
  clientSecret: string
  stripePromise: Promise<Stripe | null>
  address: Address
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>
  isPending: boolean
  startTransition: (cb: () => void) => void
}) {

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
      <SalesOrderStripeForm
        address={address}
        clientSecret={clientSecret}
        setIsLoading={setIsLoading}
        isPending={isPending}
        startTransition={startTransition}
      />
    </Elements>
  )
}
