import { Elements } from '@stripe/react-stripe-js'
import { Appearance, Stripe } from '@stripe/stripe-js'
import { Address } from '@/types/address'
import SalesOrderStripeForm from './SalesOrderStripeForm'

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
        colorText: getColor('--neutral-800'),
        colorTextPlaceholder: getColor('--neutral-700'),
        colorPrimary: getColor('--neutral-800'),
        iconColor: getColor('--neutral-800'),
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
          color: getColor('--neutral-800'),
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

  const theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  const appearance = createStripeAppearance(theme)

  const loader = 'auto'

  return (
    <Elements options={{ clientSecret, appearance, loader }} stripe={stripePromise}>
      <SalesOrderStripeForm
        address={address}
        setIsLoading={setIsLoading}
        isPending={isPending}
        startTransition={startTransition}
      />
    </Elements>
  )
}
