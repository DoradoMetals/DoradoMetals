'use client'

// THE CUSTOMER THE ADMIN IS ORDERING FOR, off GET /users/get_all - the
// contracts' user wire, snake_case. NOT better-auth's session user, which is
// the admin themselves and is a different shape under the same word.
import { AdminUser } from '@/features/users/types'
import { Address, UserAddress, makeEmptyWireAddress } from '@/features/addresses/types'
import { Skeleton } from '@/shared/ui/base/skeleton'
import { useDrawerStore } from '@/shared/store/drawerStore'
import Drawer from '@/shared/ui/base/drawer'
import { RadioGroup } from '@/shared/ui/RadioGroup'
import { Separator } from '@/shared/ui/base/separator'
import { DetailRow } from '@/shared/ui/DetailRow'
import { cn } from '@/shared/utils/cn'

import {
  adminSalesOrderCheckoutSchema,
  adminSalesOrderServiceOptions,
  paymentOptions,
} from '@/features/orders/salesOrders/types'
import type { SalesOrderQuote } from '@dorado/contracts'
import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'
import { useAdminSalesOrderCheckoutStore } from '@/shared/store/adminSalesOrderCheckoutStore'
import { SearchableDropdown } from '@/shared/ui/inputs/InputDropdownSearch'
import { Product } from '@/features/products/types'
import Image from 'next/image'
import { Minus, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/shared/ui/base/button'
import NumberFlow from '@number-flow/react'
import { SpotPrice } from '@/features/spots/types'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { Input } from '@/shared/ui/base/input'
import { LockIcon, LockOpenIcon, QuestionIcon } from '@phosphor-icons/react'
import { useRouter } from 'next/navigation'
import { useMutationState } from '@tanstack/react-query'
import { loadStripe } from '@stripe/stripe-js'
import { Switch } from '@/shared/ui/base/switch'
import { AddressSelect } from '@/features/addresses/ui/AddressSelect'
import { useUserAddress, useUserAddressLinks } from '@/features/addresses/queries'
import { useSpotPrices } from '@/features/spots/queries'
import { useCatalogQuote, useSalesOrderQuote } from '@/features/quotes/queries'
import { useProducts } from '@/features/products/queries'
import { useAdminCreateSalesOrder } from '@/features/orders/salesOrders/admin/queries'
import { useRetrievePaymentIntent, useUpdatePaymentIntent } from '@/features/stripe/queries'
import AdminStripeWrapper from '@/features/stripe/ui/AdminStripeWrapper'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

export function CreateSalesOrderDrawer() {
  const { data, setData } = useAdminSalesOrderCheckoutStore()
  const { activeDrawer, closeDrawer, createSalesOrderUser } = useDrawerStore()

  const [spotsLocked, setSpotsLocked] = useState(false)

  const { data: addresses = [], isLoading } = useUserAddress(createSalesOrderUser?.id ?? '')
  // The TARGET user's links (label / default), not the admin's own book.
  const { data: links = [] } = useUserAddressLinks(createSalesOrderUser?.id ?? '')
  const linkOf = useMemo(() => new Map(links.map((l) => [l.address_id, l])), [links])

  const isDrawerOpen = activeDrawer === 'createSalesOrder'
  const { data: spotPrices = [] } = useSpotPrices()

  // The preview is the server's sales-order quote (Jacob's no-previews
  // ruling; calculateSalesOrderPrices died here 2026-08-28). It prices at
  // LIVE server spots: the drawer's locked-spot overrides feed the CREATE -
  // order_metals rides the body as spot_prices - never this preview.
  // user_id names the TARGET customer, honored because this caller is an
  // admin: funds price against that customer's row, not the admin's own.
  const { data: orderPrices } = useSalesOrderQuote({
    items: (data.items ?? []).map((i) => ({ id: i.id, quantity: i.quantity ?? 1 })),
    using_funds: data.using_funds ?? true,
    shipping_service: data.service?.value ?? null,
    payment_method: data.payment_method ?? null,
    address_id: data.address?.id ?? null,
    user_id: createSalesOrderUser?.id ?? null,
  })

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

  const defaultAddress: Address | undefined =
    addresses.find((a) => linkOf.get(a.id)?.default_shipping) ?? addresses[0]

  useEffect(() => {
    if (addresses.length > 0 && defaultAddress && data.address?.id !== defaultAddress.id) {
      setData({ address: defaultAddress, user_address: linkOf.get(defaultAddress.id) })
    }
  }, [defaultAddress, addresses.length, data.address?.id, setData, linkOf])

  return (
    <Drawer label="New sales order" open={isDrawerOpen} setOpen={closeDrawer} anchor="left">
      <strong>{createSalesOrderUser?.name}</strong>

      <Separator />

      <div className="flex flex-col gap-2 items-start">
        <Button
          variant="link"
          className="ml-auto"
          onClick={() => setSpotsLocked((prev) => !prev)}
        >
          {spotsLocked ? (
            <div className="flex gap-1 items-center">
              Unlock Spots
              <LockOpenIcon size={16} className="text-primary" />
            </div>
          ) : (
            <div className="flex gap-1 items-center">
              Lock Spots
              <LockIcon size={16} className="text-primary" />
            </div>
          )}
        </Button>

        <SpotSelector spotsLocked={spotsLocked} />
        <ProductSelector />
      </div>

      <Separator />
      <div className="flex flex-col gap-3">
        <AddressSelector
          user={createSalesOrderUser}
          addresses={addresses}
          userAddresses={links}
          isLoading={isLoading}
        />
        <ServiceSelector />
      </div>

      <Separator />
      <div className="flex flex-col gap-3">
        <OrderSummary orderPrices={orderPrices} />
        <CreditSelect
          orderPrices={orderPrices}
          funds={orderPrices?.beginning_funds ?? createSalesOrderUser?.dorado_funds ?? 0}
        />
        <PaymentSelect orderPrices={orderPrices} user={createSalesOrderUser!} />
      </div>
    </Drawer>
  )
}

function SpotSelector({ spotsLocked }: { spotsLocked: boolean }) {
  const { data, setData } = useAdminSalesOrderCheckoutStore()
  const spots = data.order_metals ?? []

  const updateSpot = (spot: SpotPrice, new_spot: number) => {
    const updated = spots.map((s) => (s.id === spot.id ? { ...s, ask: new_spot } : s))
    setData({ order_metals: updated })
  }

  return (
    <div className="grid grid-cols-2 w-full gap-4 sm:flex sm:items-center sm:justify-between sm:gap-4">
      {spots.map((spot) => (
        <div key={spot.id} className="flex flex-col w-full">
          <p>{spot.name}</p>

          <div className="flex items-center gap-1 w-full">
            <Input
              type="number"
              pattern="[0-9]*"
              inputMode="decimal"
              readOnly={!spotsLocked}
              className={cn(
                'no-spinner text-center w-full h-8',
                !spotsLocked && 'cursor-not-allowed'
              )}
              value={spot?.ask ?? ''}
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
  const items = data.items ?? []

  // The per-line preview is the server's ask quote, batched over the picked
  // items. It prices from LIVE server spots: the drawer's locked spot
  // overrides feed the CREATE body, never this preview.
  const { data: quote } = useCatalogQuote(
    items.map((i) => ({ id: i.id, quantity: i.quantity ?? 1 })),
    'ask'
  )
  const lineTotals = new Map((quote?.items ?? []).map((line) => [line.id, line.line_total]))

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
        getLabel={(p) => p.name}
        selected={null}
        onSelect={addItem}
        placeholder="Search products…"
        limit={50}
      />
      <div className="w-full flex-col">
        <div className="flex-col gap-5">
          {items.map((item, index) => {
            const lineTotal = lineTotals.get(item.id) ?? 0
            const quantity = item.quantity ?? 1

            return (
              <div
                key={item.name}
                className={`flex items-center justify-between w-full gap-4 py-4 ${
                  index !== items.length - 1 ? 'border-b border-neutral-300' : 'border-none'
                }`}
              >
                <div className="flex-shrink-0">
                  <Image
                    src={item.image_front}
                    width={80}
                    height={80}
                    className="pointer-events-none cursor-auto object-contain focus:outline-none"
                    alt={item.name}
                  />
                </div>

                <div className="flex flex-col flex-grow min-w-0">
                  <div className="flex justify-between items-start w-full mt-2">
                    <div className="flex flex-col">
                      <strong>{item.name}</strong>
                      <small>{item.mint_name}</small>
                    </div>
                    <Button
                      variant="tertiary"
                      size="sm"
                      className="p-0 pb-2"
                      onClick={() => removeAll(item)}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>

                  <div className="flex justify-between items-center mt-3">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="tertiary"
                        size="sm"
                        className="p-1"
                        onClick={() => removeOne(item)}
                      >
                        <Minus size={16} />
                      </Button>
                      <NumberFlow
                        value={quantity}
                        transformTiming={{ duration: 750, easing: 'ease-in' }}
                        spinTiming={{ duration: 150, easing: 'ease-out' }}
                        opacityTiming={{ duration: 350, easing: 'ease-out' }}
                        trend={0}
                      />
                      <Button
                        variant="tertiary"
                        size="sm"
                        className="p-1"
                        onClick={() => addItem(item)}
                      >
                        <Plus size={16} />
                      </Button>
                    </div>
                    <strong>
                      <PriceNumberFlow value={lineTotal} />
                    </strong>
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
  user: AdminUser | null
  addresses: Address[]
  userAddresses: UserAddress[]
  isLoading: boolean
}

function AddressSelector({ user, addresses, userAddresses, isLoading }: AddressSelectProps) {
  const { data, setData } = useAdminSalesOrderCheckoutStore()

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
              <AddressSelect
                addresses={addresses}
                userAddresses={userAddresses}
                value={data.address?.id ?? null}
                onChange={(addr) =>
                  setData({
                    address: addr,
                    user_address: userAddresses.find((l) => l.address_id === addr.id),
                  })
                }
              />
            </div>
          ) : user ? (
            <p className="flex items-center justify-center">
              Please create an address for this user.
            </p>
          ) : (
            <p className="flex items-center justify-center">
              Select a user to see addresses.
            </p>
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
        options={adminSalesOrderServiceOptions}
        className="flex w-full flex-col gap-3"
      >
        {(option) => (
          <>
            <div className="flex items-center gap-2">
              {option.icon && <option.icon size={24} />}
              <strong>{option.label}</strong>
            </div>
            <DetailRow label={option.time} variant="subtotal">
              <PriceNumberFlow value={option.cost} />
            </DetailRow>
          </>
        )}
      </RadioGroup>
    </div>
  )
}

function OrderSummary({ orderPrices }: { orderPrices?: SalesOrderQuote }) {
  const { data } = useAdminSalesOrderCheckoutStore()
  const router = useRouter()

  // 0 until the first quote lands; placeholderData keeps later ticks
  // flicker-free. The field names are the quote contract's own.
  const appliedFunds = orderPrices?.pre_charges_amount ?? 0
  const subjectToCharges = orderPrices?.subject_to_charges_amount ?? 0
  const surcharge = orderPrices?.charges_amount ?? 0
  const salesTax = orderPrices?.sales_tax ?? 0

  const paymentContent = (
    <div className="w-full flex-col">
      <h2 className="eyebrow my-4">Payment Details</h2>

      <DetailRow label="Shipping">
        <PriceNumberFlow value={orderPrices?.shipping_charge ?? 0} />
      </DetailRow>

      {appliedFunds > 0 && (
        <DetailRow label="Dorado Funds Applied">
          -<PriceNumberFlow value={appliedFunds} />
        </DetailRow>
      )}
      {subjectToCharges > 0 && (
        <DetailRow label={appliedFunds > 0 ? 'Amount Remaining' : 'Items'}>
          <PriceNumberFlow value={subjectToCharges} />
        </DetailRow>
      )}

      {surcharge > 0 && (
        <DetailRow
          label={`${
            paymentOptions.find((option) => option.method === data.payment_method)?.label
          } Surcharge (${
            paymentOptions.find((option) => option.method === data.payment_method)?.surcharge_label
          })`}
        >
          <PriceNumberFlow value={surcharge} />
        </DetailRow>
      )}

      {salesTax > 0 && (
        <DetailRow
          label={
            <span className="flex items-center gap-1">
              Sales Tax
              <Button
                variant="tertiary"
                size="iconInline"
                onClick={() => router.push('/sales-tax')}
              >
                <QuestionIcon size={16} />
              </Button>
            </span>
          }
        >
          <PriceNumberFlow value={salesTax} />
        </DetailRow>
      )}

      <div className="pt-2">
        <Separator />

        <DetailRow label="Order Total" variant="total" className="pt-2">
          <PriceNumberFlow value={orderPrices?.post_charges_amount ?? 0} />
        </DetailRow>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex w-full rounded-lg border border-border p-4">
        <div className="flex flex-col w-full gap-3">{paymentContent}</div>
      </div>
    </div>
  )
}

// `funds` is the TARGET user's credit, priced by the SERVER: the quote names
// that user (subjectOf honors it for admins), so beginning_funds is their row
// balance. The client-state figure only bridges until the first quote lands.
function CreditSelect({
  orderPrices,
  funds,
}: {
  orderPrices?: SalesOrderQuote
  funds: number
}) {
  const { data, setData } = useAdminSalesOrderCheckoutStore()

  const handleFundsToggle = (checked: boolean) => {
    setData({
      using_funds: checked,
    })
  }

  useEffect(() => {
    // Hold the auto-switch until the first quote lands - a 0 base total
    // would call any credit balance "covers it" and flip to CREDIT.
    if (!orderPrices) return
    const usingFunds = !!data.using_funds
    const prev = data.payment_method

    let next = prev

    if (usingFunds) {
      if (funds >= orderPrices.base_total) {
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
  }, [data.using_funds, data.payment_method, funds, orderPrices?.base_total])

  return (
    <>
      {funds > 0 && (
        <div className="">
          <h2 className="eyebrow mb-4">Payment Method:</h2>

          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1 items-start">
              <p>Use Bullion Credit?</p>
              <Switch
                checked={data.using_funds}
                onCheckedChange={handleFundsToggle}
                disabled={funds <= 0}
              />
            </div>
            <div className="flex flex-col gap-1 items-end">
              <p>Credit Available:</p>
              <strong className="stat-sm">
                <PriceNumberFlow value={funds} />
              </strong>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function PaymentSelect({ orderPrices, user }: { orderPrices?: SalesOrderQuote; user: AdminUser }) {
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
    if (clientSecret && (orderPrices?.post_charges_amount ?? 0) > 0 && cardNeeded && !itemsMissing) {
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
    orderPrices?.post_charges_amount,
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
                className="w-full"
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
                className="w-full"
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
