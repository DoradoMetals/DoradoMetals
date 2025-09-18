'use client'

import { useUserAddress } from '@/lib/queries/useAddresses'
import { User } from '@/types/user'
import { Address, emptyAddress } from '@/types/address'
import { Skeleton } from '@/components/ui/skeleton'
import { useDrawerStore } from '@/store/drawerStore'
import { AdminAddressCarousel } from './selectSalesOrderAddress'
import Drawer from '@/components/ui/drawer'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'

import getPrimaryIconStroke, { getCustomPrimaryIconStroke } from '@/utils/getPrimaryIconStroke'
import {
  adminSalesOrderCheckoutSchema,
  adminSalesOrderServiceOptions,
  paymentOptions,
  SalesOrderTotals,
} from '@/types/sales-orders'
import PriceNumberFlow from '@/components/custom/products/PriceNumberFlow'
import { useAdminSalesOrderCheckoutStore } from '@/store/adminSalesOrderCheckoutStore'
import { useProducts } from '@/lib/queries/useProducts'
import { SearchableDropdown } from '@/components/ui/input-dropdown-search'
import { Product } from '@/types/product'
import Image from 'next/image'
import { useSpotPrices } from '@/lib/queries/useSpotPrices'
import { Minus, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import getProductPrice from '@/utils/getProductPrice'
import NumberFlow from '@number-flow/react'
import { SpotPrice } from '@/types/metal'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { Input } from '@/components/ui/input'
import { LockIcon, LockOpenIcon, QuestionIcon } from '@phosphor-icons/react'
import { useRouter } from 'next/navigation'
import { calculateSalesOrderPrices } from '@/utils/calculateSalesOrderPrices'
import { useSalesTax } from '@/lib/queries/useSalesTax'
import { useMutationState } from '@tanstack/react-query'
import { useRetrievePaymentIntent, useUpdatePaymentIntent } from '@/lib/queries/useStripe'
import AdminStripeWrapper from '@/components/custom/stripe/admin/AdminStripeWrapper'
import { loadStripe } from '@stripe/stripe-js'
import { Switch } from '@/components/ui/switch'
import { useAdminCreateSalesOrder } from '@/lib/queries/admin/useAdminSalesOrders'
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

export function CreateSalesOrderDrawer() {
  const { data, setData } = useAdminSalesOrderCheckoutStore()
  const { activeDrawer, closeDrawer, createSalesOrderUser } = useDrawerStore()

  const [spotsLocked, setSpotsLocked] = useState(false)

  const { data: addresses = [], isLoading } = useUserAddress(createSalesOrderUser?.id ?? '')

  const isDrawerOpen = activeDrawer === 'createSalesOrder'
  const { data: spotPrices = [] } = useSpotPrices()

  const { data: salesTax = 0 } = useSalesTax({
    address: data.address ?? emptyAddress,
    items: data.items ?? [],
    spots: spotPrices,
  })

  const orderPrices = useMemo(() => {
    return calculateSalesOrderPrices(
      data.items ?? [],
      data.using_funds ?? true,
      data.order_metals ?? [],
      createSalesOrderUser?.dorado_funds ?? 0,
      data.service?.cost ?? 0,
      data.payment_method ?? 'CARD',
      salesTax ?? 0
    )
  }, [
    data.items,
    data.using_funds,
    data.order_metals,
    createSalesOrderUser?.dorado_funds,
    data.service?.cost,
    data.payment_method,
    salesTax,
  ])

  useEffect(() => {
    if (spotPrices.length > 0 && !spotsLocked) {
      setData({
        order_metals: spotPrices,
      })
    }
  }, [spotPrices, spotsLocked])

  useEffect(() => {
    setData({
      user: createSalesOrderUser!,
    })
  }, [createSalesOrderUser])

  const defaultAddress = addresses.find((a) => a.is_default) ?? addresses[0] ?? emptyAddress

  useEffect(() => {
    if (addresses.length > 0 && data.address?.id !== defaultAddress.id) {
      setData({ address: defaultAddress })
    }
  }, [defaultAddress.id, addresses.length, data.address?.id, setData])

  return (
    <Drawer open={isDrawerOpen} setOpen={closeDrawer} anchor="left" className="bg-background">
      <div className="text-base text-neutral-800">{createSalesOrderUser?.name}</div>

      <div className="separator-inset" />

      <div className="flex flex-col gap-2 items-start">
        <Button
          variant="link"
          className="text-primary-gradient p-0 font-normal text-sm h-4 hover:bg-transparent ml-auto"
          onClick={() => setSpotsLocked((prev) => !prev)}
        >
          {spotsLocked ? (
            <div className="flex gap-1 items-center">
              Unlock Spots
              <LockOpenIcon size={16} color={getPrimaryIconStroke()} />
            </div>
          ) : (
            <div className="flex gap-1 items-center">
              Lock Spots
              <LockIcon size={16} color={getPrimaryIconStroke()} />
            </div>
          )}
        </Button>

        <SpotSelector spotsLocked={spotsLocked} />
        <ProductSelector />
      </div>

      <div className="separator-inset" />
      <div className="flex flex-col gap-3">
        <AddressSelect user={createSalesOrderUser} addresses={addresses} isLoading={isLoading} />
        <ServiceSelector />
      </div>

      <div className="separator-inset" />
      <div className="flex flex-col gap-3">
        <OrderSummary orderPrices={orderPrices} />
        <CreditSelect orderPrices={orderPrices} />
        <PaymentSelect orderPrices={orderPrices} user={createSalesOrderUser!} />
      </div>
    </Drawer>
  )
}

function SpotSelector({ spotsLocked }: { spotsLocked: boolean }) {
  const { data, setData } = useAdminSalesOrderCheckoutStore()
  const spots = data.order_metals ?? []

  const updateSpot = (spot: SpotPrice, new_spot: number) => {
    const updated = spots.map((s) => (s.id === spot.id ? { ...s, ask_spot: new_spot } : s))
    setData({ order_metals: updated })
  }

  return (
    <div className="grid grid-cols-2 w-full gap-4 sm:flex sm:items-center sm:justify-between sm:gap-4">
      {spots.map((spot) => (
        <div key={spot.id} className="flex flex-col w-full">
          <div className="flex items-center justify-between w-full text-sm text-neutral-700">
            {spot.type}
          </div>

          <div className="flex items-center gap-1 w-full">
            <Input
              type="number"
              pattern="[0-9]*"
              inputMode="decimal"
              readOnly={!spotsLocked}
              className={cn(
                'input-floating-label-form no-spinner text-center w-full text-base h-8',
                !spotsLocked && 'cursor-not-allowed'
              )}
              value={spot?.ask_spot ?? ''}
              onChange={(e) => updateSpot(spot, Number(e.target.value))}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function ProductSelector() {
  const { data: products = [] } = useProducts()
  const { data, setData } = useAdminSalesOrderCheckoutStore()
  const spots = data.order_metals ?? []
  const items = data.items ?? []

  function addItem(item: Product) {
    const existing = data.items ?? []
    const found = existing.find((i) => i.id === item.id)
    if (found) {
      setData({
        items: existing.map((i) =>
          i.id === item.id ? { ...i, quantity: (i.quantity ?? 1) + 1 } : i
        ),
      })
    } else {
      setData({
        items: [...existing, { ...item, quantity: 1 }],
      })
    }
  }

  function removeOne(item: Product) {
    const existing = data.items ?? []
    setData({
      items: existing
        .map((i) => (i.id === item.id ? { ...i, quantity: (i.quantity ?? 1) - 1 } : i))
        .filter((i) => (i.quantity ?? 1) > 0),
    })
  }

  function removeAll(item: Product) {
    const existing = data.items ?? []
    setData({
      items: existing.filter((i) => i.id !== item.id),
    })
  }

  return (
    <div className="flex flex-col items-center w-full">
      <SearchableDropdown
        items={products}
        getLabel={(p) => p.product_name}
        selected={null}
        onSelect={addItem}
        placeholder="Search products…"
        limit={50}
        inputClassname="input-floating-label-form"
      />
      <div className="w-full flex-col">
        <div className="flex-col gap-5">
          {items.map((item, index) => {
            const spot = spots.find((s) => s.type === item.metal_type)
            const price = getProductPrice(item, spot)
            const quantity = item.quantity ?? 1

            return (
              <div
                key={item.product_name}
                className={`flex items-center justify-between w-full gap-4 py-4 ${
                  index !== items.length - 1 ? 'border-b border-neutral-300' : 'border-none'
                }`}
              >
                <div className="flex-shrink-0">
                  <Image
                    src={item.image_front}
                    width={80}
                    height={80}
                    className="pointer-events-none cursor-auto object-contain focus:outline-none drop-shadow-lg"
                    alt={item.product_name}
                  />
                </div>

                <div className="flex flex-col flex-grow min-w-0">
                  <div className="flex justify-between items-start w-full mt-2">
                    <div className="flex flex-col">
                      <div className="primary-text">{item.product_name}</div>
                      <div className="tertiary-text">{item.mint_name}</div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="hover:bg-card p-0 pb-2"
                      onClick={() => removeAll(item)}
                    >
                      <Trash2 size={16} className="text-neutral-500" />
                    </Button>
                  </div>

                  <div className="flex justify-between items-center mt-3">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="hover:bg-card p-1"
                        onClick={() => removeOne(item)}
                      >
                        <Minus size={16} />
                      </Button>
                      <NumberFlow
                        value={quantity}
                        transformTiming={{ duration: 750, easing: 'ease-in' }}
                        spinTiming={{ duration: 150, easing: 'ease-out' }}
                        opacityTiming={{ duration: 350, easing: 'ease-out' }}
                        className="primary-text"
                        trend={0}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="hover:bg-card p-1"
                        onClick={() => addItem(item)}
                      >
                        <Plus size={16} />
                      </Button>
                    </div>
                    <div className="text-neutral-800 text-base">
                      <PriceNumberFlow value={price * quantity} />
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

interface AddressSelectProps {
  user: User | null
  addresses: Address[]
  isLoading: boolean
}

function AddressSelect({ user, addresses, isLoading }: AddressSelectProps) {
  return (
    <div className="flex flex-col w-full">
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-9 w-full mb-8" />
          <Skeleton className="h-9 w-full mb-8" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-9 w-full mb-8" />
            <Skeleton className="h-9 w-full mb-8" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-9 w-full mb-8" />
            <Skeleton className="h-9 w-full mb-8" />
          </div>
          <Skeleton className="h-9 w-full mb-8" />
        </div>
      ) : (
        <>
          {addresses && addresses.length > 0 ? (
            <div className="flex flex-col gap-3 justify-center w-full">
              <AdminAddressCarousel addresses={addresses} />
            </div>
          ) : user ? (
            <div className="flex items-center justify-center text-base text-neutral-600">
              Please create an address for this user.
            </div>
          ) : (
            <div className="flex items-center justify-center text-base text-neutral-600">
              Select a user to see addresses.
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ServiceSelector() {
  const { data, setData } = useAdminSalesOrderCheckoutStore()

  function handleServiceChange(serviceKey: string) {
    const option = adminSalesOrderServiceOptions[serviceKey]

    setData({
      service: {
        ...option,
      },
    })
  }

  return (
    <div className="space-y-2 w-full">
      <RadioGroup
        value={data.service?.value ?? ''}
        onValueChange={handleServiceChange}
        className="gap-3 w-full flex flex-col"
      >
        {Object.entries(adminSalesOrderServiceOptions).map(([serviceKey, option]) => {
          return (
            <label
              key={serviceKey}
              htmlFor={serviceKey}
              className={cn(
                'raised-off-page relative peer flex flex-col items-start justify-center w-full gap-1 rounded-lg bg-background px-4 py-3 cursor-pointer transition-colors has-[[data-state=checked]]:bg-card has-[[data-state=checked]]:shadow-md'
              )}
            >
              <div className="flex items-center gap-2 text-base font-medium text-neutral-800">
                {option.icon && (
                  <option.icon
                    size={24}
                    stroke={getCustomPrimaryIconStroke()}
                    color={getPrimaryIconStroke()}
                  />
                )}
                {option.label}
              </div>

              <div className="flex items-center w-full justify-between">
                <div className="text-sm text-neutral-600">{option.time}</div>
                <div className="text-base text-neutral-800">
                  <PriceNumberFlow value={option.cost} />
                </div>
              </div>

              <RadioGroupItem id={serviceKey} value={serviceKey} className="sr-only" />
            </label>
          )
        })}
      </RadioGroup>
    </div>
  )
}

function OrderSummary({ orderPrices }: { orderPrices: SalesOrderTotals }) {
  const { data } = useAdminSalesOrderCheckoutStore()
  const router = useRouter()

  const paymentContent = (
    <div className="w-full flex-col">
      <div className="section-label text-primary-gradient my-4">Payment Details</div>

      <div className="w-full flex items-center justify-between">
        <div className="text-sm text-neutral-700">Shipping</div>
        <div className="text-base text-neutral-800">
          <PriceNumberFlow value={orderPrices.shippingCharge} />
        </div>
      </div>

      {orderPrices.appliedFunds > 0 && (
        <div className="w-full flex items-center justify-between">
          <div className="text-sm text-neutral-700">Dorado Funds Applied</div>
          <div className="text-base text-neutral-800">
            -<PriceNumberFlow value={orderPrices.appliedFunds} />
          </div>
        </div>
      )}
      {orderPrices.subjectToChargesAmount > 0 && (
        <div className="w-full flex items-center justify-between">
          <div className="text-sm text-neutral-700">
            {' '}
            {orderPrices.appliedFunds > 0 ? 'Amount Remaining' : 'Items'}
          </div>
          <div className="text-base text-neutral-800">
            <PriceNumberFlow value={orderPrices.subjectToChargesAmount} />
          </div>
        </div>
      )}

      {orderPrices.surchargeAmount > 0 && (
        <div className="w-full flex items-center justify-between">
          <div className="text-sm text-neutral-700">
            {`${
              paymentOptions.find((option) => option.method === data.payment_method)?.label
            } Surcharge `}
            {`(${
              paymentOptions.find((option) => option.method === data.payment_method)
                ?.surcharge_label
            })`}
          </div>
          <div className="text-base text-neutral-800">
            <PriceNumberFlow value={orderPrices.surchargeAmount} />
          </div>
        </div>
      )}

      {orderPrices.salesTax > 0 && (
        <div className="w-full flex items-center justify-between">
          <div className="flex items-center gap-1">
            <div className="text-sm text-neutral-700">Sales Tax</div>
            <Button variant="ghost" className="h-4 p-0" onClick={() => router.push('/sales-tax')}>
              <QuestionIcon size={16} className="text-neutral-500" />
            </Button>
          </div>
          <div className="text-base text-neutral-800">
            <PriceNumberFlow value={orderPrices.salesTax} />
          </div>
        </div>
      )}

      <div className="pt-2">
        <div className="separator-inset" />

        <div className="w-full flex items-center justify-between pt-2">
          <div className="text-base text-primary-gradient">Order Total</div>
          <div className="text-lg text-neutral-900">
            <PriceNumberFlow value={orderPrices.postChargesAmount} />
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex w-full bg-card raised-off-page rounded-lg p-4">
        <div className="flex flex-col w-full gap-3">{paymentContent}</div>
      </div>
    </div>
  )
}

function CreditSelect({ orderPrices }: { orderPrices: SalesOrderTotals }) {
  const { data, setData } = useAdminSalesOrderCheckoutStore()

  const handleFundsToggle = (checked: boolean) => {
    setData({
      using_funds: checked,
    })
  }

  useEffect(() => {
    const usingFunds = !!data.using_funds
    const prev = data.payment_method
    const { beginningFunds, baseTotal } = orderPrices

    let next = prev

    if (usingFunds) {
      if (beginningFunds >= baseTotal) {
        next = 'CREDIT'
      } else if (prev === 'CREDIT') {
        next = 'CARD'
      }
    } else {
      if (prev === 'CREDIT') next = 'CARD'
    }

    if (next !== prev) {
      setData({ payment_method: next })
    }
  }, [data.using_funds, data.payment_method, orderPrices.beginningFunds, orderPrices.baseTotal])

  return (
    <>
      {orderPrices.beginningFunds > 0 && (
        <div className="">
          <div className="text-xs text-neutral-600 uppercase tracking-widest mb-4">
            Payment Method:
          </div>

          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1 items-start">
              <div className="text-sm text-neutral-700">Use Bullion Credit?</div>
              <Switch
                checked={data.using_funds}
                onCheckedChange={handleFundsToggle}
                disabled={orderPrices.beginningFunds <= 0}
              />
            </div>
            <div className="flex flex-col gap-1 items-end">
              <div className="text-sm text-neutral-700">Credit Available:</div>
              <div className="text-lg text-neutral-900">
                <PriceNumberFlow value={orderPrices.beginningFunds} />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function PaymentSelect({ orderPrices, user }: { orderPrices: SalesOrderTotals; user: User }) {
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const { closeDrawer } = useDrawerStore()
  const [isPending, startTransition] = useTransition()

  const { data } = useAdminSalesOrderCheckoutStore()
  const createOrder = useAdminCreateSalesOrder()
  const updatePaymentIntent = useUpdatePaymentIntent()
  const { data: clientSecret } = useRetrievePaymentIntent('admin', user.id!)
  const isOrderCreating =
    useMutationState({
      filters: {
        mutationKey: ['createSalesOrder'],
        status: 'pending',
      },
      select: () => true,
    }).length > 0

  const cardNeeded = useMemo(() => {
    if (data.payment_method === 'CREDIT') {
      return false
    } else {
      return true
    }
  }, [data.payment_method])
  const itemsMissing = (data.items?.length ?? 0) === 0

  const disabled =
    itemsMissing ||
    !data.address?.is_valid ||
    isOrderCreating ||
    isLoading ||
    isPending ||
    (cardNeeded && (!clientSecret || !stripePromise))

  useEffect(() => {
    if (clientSecret && orderPrices.postChargesAmount > 0 && cardNeeded && !itemsMissing) {
      updatePaymentIntent.mutate({
        items: data?.items ?? [],
        using_funds: data?.using_funds ?? true,
        spots: data.order_metals ?? [],
        user: user!,
        shipping_service: data.service?.value ?? 'STANDARD',
        payment_method: data.payment_method ?? 'CARD',
        type: 'admin',
        address_id: data?.address?.id ?? '',
      })
    }
  }, [
    data?.items,
    data.using_funds,
    data.order_metals,
    clientSecret,
    orderPrices.postChargesAmount,
    data.payment_method,
    user,
    cardNeeded,
    itemsMissing,
  ])

  const handleSubmit = () => {
    const checkoutPayload = {
      ...data,
      address: data.address!,
      service: data.service!,
      items: data.items,
    }

    const validated = adminSalesOrderCheckoutSchema.parse(checkoutPayload)

    createOrder.mutate(
      { sales_order: validated },
      {
        onSuccess: async () => {
          startTransition(() => {
            closeDrawer()
          })
          useAdminSalesOrderCheckoutStore.getState().clear()
        },
      }
    )
  }

  return (
    <>
      {clientSecret && data.address && (
        <div className="flex flex-col items-center w-full gap-3">
          <div className="flex flex-col gap-6 w-full">
            {cardNeeded && (
              <AdminStripeWrapper
                clientSecret={clientSecret}
                stripePromise={stripePromise}
                address={data.address}
                setIsLoading={setIsLoading}
                isPending={isPending}
                startTransition={startTransition}
              />
            )}
          </div>
          <div className="flex flex-col gap-3 w-full sticky top-26">
            {!cardNeeded ? (
              <Button
                className="raised-off-page liquid-gold shine-on-hover w-full text-white"
                disabled={disabled}
                onClick={handleSubmit}
              >
                {!data.address?.is_valid
                  ? 'Please provide a valid address.'
                  : itemsMissing
                  ? 'Please add items.'
                  : isOrderCreating || isLoading || isPending
                  ? 'Processing…'
                  : 'Place Order'}
              </Button>
            ) : (
              <Button
                className="raised-off-page liquid-gold shine-on-hover w-full text-white"
                disabled={disabled}
                type="submit"
                form="admin-payment-form"
              >
                {!data.address?.is_valid
                  ? 'Please provide a valid address.'
                  : itemsMissing
                  ? 'Please add items.'
                  : isOrderCreating || isLoading || isPending
                  ? 'Processing…'
                  : 'Place Order'}
              </Button>
            )}
          </div>
        </div>
      )}
    </>
  )
}
