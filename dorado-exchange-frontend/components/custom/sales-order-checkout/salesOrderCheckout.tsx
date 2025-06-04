'use client'

import { Button } from '@/components/ui/button'
import { useAddress } from '@/lib/queries/useAddresses'
import { Address } from '@/types/address'
import { useEffect, useRef } from 'react'
import { usePurchaseOrderCheckoutStore } from '@/store/purchaseOrderCheckoutStore'
import { sellCartStore } from '@/store/sellCartStore'
import { useRouter } from 'next/navigation'
import { useSpotPrices } from '@/lib/queries/useSpotPrices'
import { useUser } from '@/lib/authClient'
import { cartStore } from '@/store/cartStore'
import { useSalesOrderCheckoutStore } from '@/store/salesOrderCheckoutStore'
import ShippingSelect from './shipping/shippingSelect'

export default function SalesOrderCheckout() {
  const router = useRouter()
  const { user } = useUser()
  const { data: addresses = [], isPending } = useAddress()

  const { setData } = useSalesOrderCheckoutStore()
  const { paymentValid } = useSalesOrderCheckoutStore((state) => state.data)
  const hasInitialized = useRef(false)

  const { data: spotPrices = [] } = useSpotPrices()

  const items = cartStore((state) => state.items)

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
    <div className="flex w-full max-w-md lg:max-w-4xl justify-center p-5">
      <div className="hidden lg:flex items-center w-full justify-between">
        <div className="flex flex-col gap-3">
          <ShippingSelect
            addresses={addresses}
            emptyAddress={defaultAddress}
            isLoading={isPending}
          />
        </div>
        <div className="">DESKTOP ITEMS AND PRICES</div>
      </div>
      <div className="flex flex-col lg:hidden">
        <div className="">MOBILE</div>
      </div>
    </div>
  )
}
