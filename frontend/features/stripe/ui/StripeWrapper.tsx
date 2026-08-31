import { Elements } from '@stripe/react-stripe-js'
import { Appearance, Stripe } from '@stripe/stripe-js'
import { Address } from '@/features/addresses/types'
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
  function createStripeAppearance(theme: 'dark' | 'light'): Appearance {
    const getColor = (varName: string) =>
      getComputedStyle(document.documentElement).getPropertyValue(varName).trim()

    const isDark = theme === 'dark'

    return {
      theme: 'stripe',
      labels: 'floating',
      variables: {
        colorBackground: getColor('--background'),
        colorText: getColor('--foreground'),
        colorTextPlaceholder: getColor('--subtle'),
        colorPrimary: getColor('--foreground'),
        iconColor: getColor('--foreground'),
        logoColor: isDark ? 'dark' : 'light',
        tabLogoColor: isDark ? 'dark' : 'light',
        tabLogoSelectedColor: isDark ? 'dark' : 'light',
        blockLogoColor: isDark ? 'dark' : 'light',
        iconCardErrorColor: getColor('--destructive'),
        iconCardCvcErrorColor: getColor('--destructive'),
      },
      rules: {
        '.Input': {
          backgroundColor: getColor('--card'),
          border: 'none',
          padding: '6px',
          boxShadow: isDark
            ? 'inset 0 -2px 0px hsla(0,0%,100%,.1), inset 0 2px 2px hsla(0,0%,0%,0.3)'
            : 'inset 0 -2px 0px hsla(0,0%,99%,1), inset 0 2px 2px hsla(0,0%,0%,0.2)',
        },
        '.Input:focus': {
          boxShadow: isDark
            ? 'inset 0 -2px 0px hsla(0,0%,100%,.1), inset 0 2px 2px hsla(0,0%,0%,0.3)'
            : 'inset 0 -2px 0px hsla(0,0%,99%,1), inset 0 2px 2px hsla(0,0%,0%,0.2)',
          outline: 'none',
        },
        '.Input--invalid': {
          border: 'none',
          outline: 'none',
          color: getColor('--destructive'),
          boxShadow: isDark
            ? 'inset 0 -2px 0px hsla(0,0%,100%,.1), inset 0 2px 2px hsla(0,0%,0%,0.3)'
            : 'inset 0 -2px 0px hsla(0,0%,99%,1), inset 0 2px 2px hsla(0,0%,0%,0.2)',
        },
        '.Error': {
          color: getColor('--destructive'),
          fontSize: '12px',
        },
        '.Tab, .Tab--selected, .Tab:hover': {
          backgroundColor: getColor('--background'),
          border: 'none',
          boxShadow: 'none',
          padding: '2px',
        },
        '.AccordionItem': {
          backgroundColor: getColor('--background'),
          border: 'none',
          boxShadow: isDark
            ? 'inset 0px 1px 0px hsla(0, 0%, 100%, 0.1), 0px 1px 3px hsla(0, 0%, 0%, 0.2)'
            : 'inset 0px 1px 0px hsla(0, 0%, 99%, 1), 0px 1px 3px hsla(0, 0%, 0%, 0.2)',
        },
        '.Label': {
          fontWeight: '200',
          color: getColor('--foreground'),
        },
        '.Block': {
          backgroundColor: getColor('--background'),
          borderColor: getColor('--border'),
          boxShadow: 'none',
        },
        '.RadioIcon': {
          width: '20px',
        },
        '.RadioIconOuter': {
          fill: getColor('--card'),
          stroke: getColor('--card'),
          strokeWidth: '8',
        },
        '.RadioIconOuter--checked': {
          fill: getColor('--card'),
          stroke: getColor('--primary'),
          strokeWidth: '8',
        },
        '.RadioIconInner': {
          r: '28',
          fill: getColor('--card'),
          fillOpacity: '1',
        },
        '.RadioIconInner--checked': {
          r: '28',
          fill: getColor('--primary'),
          fillOpacity: '1',
        },
      },
    }
  }

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
