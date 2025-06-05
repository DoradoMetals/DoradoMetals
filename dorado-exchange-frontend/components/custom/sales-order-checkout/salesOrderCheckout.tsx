'use client'

import { Button } from '@/components/ui/button'
import { useAddress } from '@/lib/queries/useAddresses'
import { Address } from '@/types/address'
import { useEffect, useMemo, useRef } from 'react'
import { sellCartStore } from '@/store/sellCartStore'
import { useRouter } from 'next/navigation'
import { useSpotPrices } from '@/lib/queries/useSpotPrices'
import { useUser } from '@/lib/authClient'
import { cartStore } from '@/store/cartStore'
import { useSalesOrderCheckoutStore } from '@/store/salesOrderCheckoutStore'
import ShippingSelect from './shipping/shippingSelect'

import { loadStripe, Appearance } from '@stripe/stripe-js'
import { Elements } from '@stripe/react-stripe-js'
import {
  useCreatePaymentIntent,
  useRetrievePaymentIntent,
  useUpdatePaymentIntent,
} from '@/lib/queries/useStripe'
import StripeForm from '../stripe/stripeForm'
import getProductPrice from '@/utils/getProductPrice'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

export default function SalesOrderCheckout() {
  const router = useRouter()
  const {
    data: clientSecret,
    isPending: paymentIntentPending,
    isError,
  } = useRetrievePaymentIntent()
  const updatePaymentIntent = useUpdatePaymentIntent()
  const { user } = useUser()
  const { data: addresses = [], isPending: isAddressesPending } = useAddress()
  const { data: spotPrices = [] } = useSpotPrices()

  const items = cartStore((state) => state.items)

  const total = useMemo(() => {
    return items.reduce((acc, item) => {
      const spot = spotPrices.find((s) => s.type === item.metal_type)
      const price = getProductPrice(item, spot)
      const quantity = item.quantity ?? 1
      return acc + price * quantity
    }, 0)
  }, [items, spotPrices])

  useEffect(() => {
    console.log(clientSecret)
    if (clientSecret && total > 0) {
      updatePaymentIntent.mutate({ amount: total, type: 'sales_order_checkout' })
    }
  }, [total])

  const { setData } = useSalesOrderCheckoutStore()
  const { paymentValid } = useSalesOrderCheckoutStore((state) => state.data)
  const hasInitialized = useRef(false)

  const isDarkMode =
    typeof window !== 'undefined' && document.documentElement.classList.contains('dark')

  // const appearance: Appearance = {
  //   theme: 'stripe',
  //   labels: 'floating',
  //   variables: {
  //     colorBackground: 'transparent',
  //     colorText: '#000',
  //     colorTextPlaceholder: '#999',
  //   },
  //   rules: {
  //     '.Tab, .Tab:hover, .Tab--selected, .TabLabel': {
  //       backgroundColor: 'transparent',
  //       border: 'none',
  //       boxShadow: 'none',
  //     },
  //     '.Block': {
  //       backgroundColor: 'transparent',
  //       border: 'none',
  //       boxShadow: 'none',
  //     },
  //     '.AccordionItem': {
  //       backgroundColor: 'transparent',
  //       border: 'none',
  //       boxShadow: 'none',
  //     },
  //     '.Input': {
  //       backgroundColor: 'transparent',
  //       boxShadow: 'none',
  //     },
  //     '.StripeElement': {
  //       backgroundColor: 'transparent',
  //     },
  //   },
  // }

  const lightAppearance: Appearance = {
    theme: 'stripe',
    variables: {
      colorBackground: 'transparent',
      colorText: '#000',
      colorTextPlaceholder: '#999',
      colorPrimary: '#d4af37',
    },
    rules: {
      '.Tab, .Tab--selected, .Tab:hover, .TabLabel': {
        backgroundColor: 'transparent',
        border: 'none',
        boxShadow: 'none',
      },
      '.AccordionItem': {
        backgroundColor: 'transparent',
        border: 'none',
        boxShadow: 'inset 0px 1px 0px hsla(0, 0%, 99%, 1), 0px 1px 3px hsla(0, 0%, 0%, 0.2)',
      },
      '.AccordionItem--selected': {
        backgroundColor: 'hsl(0, 0%, 97%)',
        border: 'none',
        boxShadow: 'inset 0px 1px 0px hsla(0, 0%, 99%, 1), 0px 1px 3px hsla(0, 0%, 0%, 0.2)',
      },
      '.Input': {
        backgroundColor: 'transparent',
        borderColor: 'hsl(0, 0%, 80%)',
        boxShadow: 'none',
      },
      '.StripeElement': {
        backgroundColor: 'transparent',
      },
    },
  }

  const darkAppearance: Appearance = {
    theme: 'night',
    variables: {
      colorBackground: 'transparent',
      colorText: '#fff',
      colorTextPlaceholder: '#999',
      colorPrimary: '#d4af37',
    },
    rules: {
      '.Tab, .Tab--selected, .Tab:hover, .TabLabel': {
        backgroundColor: 'transparent',
        border: 'none',
        boxShadow: 'none',
      },
      '.AccordionItem': {
        backgroundColor: 'transparent',
        border: 'none',
        boxShadow: 'inset 0px 1px 0px hsla(0, 0%, 100%, 0.1), 0px 1px 3px hsla(0, 0%, 0%, 0.2)',
      },
      '.AccordionItem--selected': {
        backgroundColor: 'hsl(0, 0%, 15%)',
        border: 'none',
        boxShadow: 'inset 0px 1px 0px hsla(0, 0%, 100%, 0.1), 0px 1px 3px hsla(0, 0%, 0%, 0.2)',
      },
      '.Input': {
        backgroundColor: 'transparent',
        borderColor: 'hsl(0, 0%, 30%)',
        boxShadow: 'none',
      },
      '.StripeElement': {
        backgroundColor: 'transparent',
      },
    },
  }
  const appearance = isDarkMode ? darkAppearance : lightAppearance

  const loader = 'auto'

  const emptyAddress: Address = {
    id: crypto.randomUUID(),
    user_id: user?.id ?? '',
    line_1: '',
    line_2: '',
    city: '',
    state: '',
    country: 'United States',
    zip: '',
    name: '',
    is_default: addresses.length === 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    phone_number: '',
    country_code: 'US',
    is_valid: false,
    is_residential: false,
  }

  const defaultAddress: Address =
    addresses.find((a) => a.is_default) ?? addresses[0] ?? emptyAddress

  useEffect(() => {
    if (!hasInitialized.current && addresses.length > 0) {
      setData({
        address: defaultAddress,
        confirmation: false,
      })
      hasInitialized.current = true
    }
  }, [addresses])

  const cartItems = cartStore((state) => state.items)

  if (cartItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center w-full p-10 text-center">
        <h2 className="text-xl font-semibold text-neutral-800">Your cart is empty</h2>
        <p className="text-sm text-muted-foreground mt-2">
          You need to add items before checking out.
        </p>
        <Button
          variant="default"
          className="mt-6 liquid-gold raised-off-screen shine-on-hover px-5 py-4"
          onClick={() => router.push('/buy')}
        >
          Add Items
        </Button>
      </div>
    )
  }

  return (
    <div className="flex w-full justify-center p-2">
      <div className="hidden lg:flex items-center w-full lg:max-w-7xl justify-between">
        <div className="flex flex-col gap-6 w-full">
          <ShippingSelect
            addresses={addresses}
            emptyAddress={defaultAddress}
            isLoading={isAddressesPending}
          />
                <div className="separator-inset" />

          {clientSecret && (
            <Elements options={{ clientSecret, appearance, loader }} stripe={stripePromise}>
              <StripeForm />
            </Elements>
          )}
        </div>
        <div className="w-full">DESKTOP ITEMS AND PRICES</div>
      </div>
      <div className="flex flex-col lg:hidden">
        <div className="">MOBILE</div>
      </div>
    </div>
  )
}
