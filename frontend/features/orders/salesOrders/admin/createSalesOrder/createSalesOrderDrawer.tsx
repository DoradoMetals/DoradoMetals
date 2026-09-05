'use client'

// THE CUSTOMER THE ADMIN IS ORDERING FOR, off GET /users/get_all - the
// contracts' user wire, snake_case. NOT better-auth's session user, which is
// the admin themselves and is a different shape under the same word.
import { Amount, Link, Skeleton, Drawer, RadioGroup, RadioOption, Divider, Button, Input, Autocomplete } from '@dorado/components'
import { CircleHelp, Lock, LockOpen, Minus, Plus, Trash2 } from '@dorado/icons'
import NextLink from 'next/link'
import { UserAddress, makeEmptyWireAddress } from '@/features/addresses/types'
import { useDrawerStore } from '@/shared/store/drawerStore'
import { cn } from '@/shared/utils/cn'

import {
  saleServiceToOption,
  SalesOrderServiceUIOption,
} from '@/features/orders/salesOrders/types'
import { useSaleShippingServices } from '@/features/shipping/queries'
import { usePaymentMethods } from '@dorado/client'
import type { Address, AdminUser, SaleQuote } from "@dorado/contracts";
import { useAdminSalesOrderCheckoutStore } from '@/shared/store/adminSalesOrderCheckoutStore'
import fuzzysort from 'fuzzysort'
import { Product } from '@/features/products/types'
import { useDecoratedLines } from '@/features/checkout/items/flair'
import { useBasket, useCheckoutItemActions } from '@/features/checkout/items/queries'
import Image from 'next/image'
import NumberFlow from '@number-flow/react'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { loadStripe } from '@stripe/stripe-js'
import { AddressSelect } from '@/features/addresses/ui/AddressSelect'
import { useUserAddress, useUserAddressLinks } from '@/features/addresses/queries'
import { useSpotPrices } from '@/features/spots/queries'
import { useCheckoutQuote } from '@/features/quotes/queries'
import { useProducts } from '@/features/products/queries'
import { useAdminCreateSalesOrder } from '@/features/orders/salesOrders/admin/queries'
import { toNewCheckoutItem } from '@/features/checkout/items/types'
import { usePaymentIntentSecret, useUpdatePaymentIntent } from '@dorado/client'
import StripeWrapper from '@/features/stripe/ui/StripeWrapper'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

export function CreateSalesOrderDrawer() {
  const { data, setData } = useAdminSalesOrderCheckoutStore()
  const { activeDrawer, closeDrawer, createSalesOrderUser } = useDrawerStore()


  const { data: addresses = [], isLoading } = useUserAddress(createSalesOrderUser?.id ?? '')
  // The TARGET user's links (label / default), not the admin's own book.
  const { data: links = [] } = useUserAddressLinks(createSalesOrderUser?.id ?? '')
  const linkOf = useMemo(() => new Map(links.map((l) => [l.address_id, l])), [links])

  const isDrawerOpen = activeDrawer === 'createSalesOrder'

  const defaultAddress: Address | undefined =
    addresses.find((a) => linkOf.get(a.id)?.default_shipping) ?? addresses[0]

  // THE ADDRESS IS DERIVED, NOT SYNCED. An effect used to copy the default
  // out of the book into the store as soon as the read landed, so the first
  // render had none and the store held a second copy of a row already on
  // screen. The admin's own pick wins; absent one, the default IS the choice.
  const address = data.address ?? defaultAddress ?? null
  const userAddress = address ? linkOf.get(address.id) : undefined


  // THE PREVIEW IS THE CUSTOMER'S OWN SALE CHECKOUT, PRICED. It used to hand
  // a drawer-local basket plus a service CODE and a payment-method TYPE to a
  // body-shaped quote; the row holds all three, and `user_id` names the TARGET
  // customer - honored because this caller is an admin.
  const { data: answer } = useCheckoutQuote('sale', { user_id: createSalesOrderUser?.id })
  const orderPrices = answer?.direction === 'sale' ? answer : undefined



  return (
    <Drawer label="New sales order" open={isDrawerOpen} setOpen={closeDrawer} anchor="left">
      <strong>{createSalesOrderUser?.name}</strong>

      <Divider />

      <div className="flex flex-col gap-2 items-start">
        <SpotSelector />
        <ProductSelector user_id={createSalesOrderUser?.id ?? ''} />
      </div>

      <Divider />
      <div className="flex flex-col gap-3">
        <AddressSelector
          user={createSalesOrderUser}
          address={address}
          addresses={addresses}
          userAddresses={links}
          isLoading={isLoading}
        />
        <ServiceSelector />
      </div>

      <Divider />
      <div className="flex flex-col gap-3">
        <OrderSummary orderPrices={orderPrices} />
        <CreditSelect
          orderPrices={orderPrices}
          funds={orderPrices?.beginning_funds ?? createSalesOrderUser?.dorado_funds ?? 0}
        />
        <PaymentSelect orderPrices={orderPrices} user={createSalesOrderUser!} address={address} />
      </div>
    </Drawer>
  )
}

// THE SPOTS ARE THE SERVER'S, AND SO IS THE PRICE. This let an admin type
// over the feed and lock it, and none of it went anywhere: the create is one
// checkout_id and the order is priced from the business's own quotes at
// placement. It shows what the order will price at, and nothing more.
function SpotSelector() {
  const { data: spots = [] } = useSpotPrices()

  return (
    <div className="grid grid-cols-2 w-full gap-4 sm:flex sm:items-center sm:justify-between sm:gap-4">
      {spots.map((spot) => (
        <div key={spot.id} className="flex flex-col w-full">
          <p>{spot.id}</p>

          <div className="flex items-center gap-1 w-full">
            <Input
              type="number"
              pattern="[0-9]*"
              readOnly
              inputClassName={cn('text-center w-full h-8')}
              value={spot?.ask ?? ''}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

// THE DRAFT IS THE CUSTOMER'S OWN SALE BASKET, not a persisted copy of it in
// a store (ruling 63). Every line here is a `checkout.items` row belonging to
// the customer the admin is ordering for, and the create body is those rows.
function ProductSelector({ user_id }: { user_id: string }) {
  const { data: products = [] } = useProducts()
  const items = useBasket('sale', user_id)
  const { addItem, addOne, removeOne, removeAll } = useCheckoutItemActions(user_id)
  const rows = useDecoratedLines(items)
  const [productQuery, setProductQuery] = useState('')

  const productMatches = useMemo(() => {
    if (!productQuery) return []
    return fuzzysort
      .go(productQuery, products, { key: 'name', threshold: -10000, limit: 50 })
      .map((r) => r.obj)
  }, [productQuery, products])

  // Each line's total is the checkout quote's own, keyed by the row's id.
  const { data: answer } = useCheckoutQuote('sale', { user_id })
  const lineTotals = new Map(
    (answer?.direction === 'sale' ? answer.items : []).map((line) => [line.id, line.line_total])
  )


  return (
    <div className="flex flex-col items-center w-full">
      <Autocomplete
        value={productQuery}
        onValueChange={setProductQuery}
        items={productMatches.map((p) => ({ id: p.id, textValue: p.name }))}
        onSelect={(item) => {
          const product = products.find((p) => p.id === item.id)
          if (product) addItem('sale', { bullion_id: product.id, quantity: 1 })
          setProductQuery(item.textValue)
        }}
        placeholder="Search products…"
      />
      <div className="w-full flex-col">
        <div className="flex-col gap-5">
          {rows.map(({ line, index, name, image_front, mint_name }) => {
            return (
              <div
                key={line.id}
                className={`flex items-center justify-between w-full gap-4 py-4 ${
                  index !== rows.length - 1 ? 'border-b border-border' : 'border-none'
                }`}
              >
                {image_front && (
                  <div className="flex-shrink-0">
                    <Image
                      src={image_front}
                      width={80}
                      height={80}
                      className="pointer-events-none cursor-auto object-contain focus:outline-none"
                      alt={name}
                    />
                  </div>
                )}

                <div className="flex flex-col flex-grow min-w-0">
                  <div className="flex justify-between items-start w-full mt-2">
                    <div className="flex flex-col">
                      <strong>{name}</strong>
                      <small>{mint_name}</small>
                    </div>
                    <Button
                      variant="tertiary"
                      size="sm"
                      className="p-0 pb-2"
                      onClick={() => removeAll('sale', line)}
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
                        onClick={() => removeOne('sale', line)}
                      >
                        <Minus size={16} />
                      </Button>
                      <NumberFlow
                        value={line.quantity ?? 1}
                        transformTiming={{ duration: 750, easing: 'ease-in' }}
                        spinTiming={{ duration: 150, easing: 'ease-out' }}
                        opacityTiming={{ duration: 350, easing: 'ease-out' }}
                        trend={0}
                      />
                      <Button
                        variant="tertiary"
                        size="sm"
                        className="p-1"
                        onClick={() => addOne('sale', line)}
                      >
                        <Plus size={16} />
                      </Button>
                    </div>
                    <strong>
                      <Amount value={lineTotals.get(line.id) ?? 0} />
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
  // THE RESOLVED CHOICE, from the parent: the admin's own pick if they made
  // one, else the customer's default. It is a prop rather than a second copy
  // in the store, which is what the deleted sync effect kept in step.
  address: Address | null
  addresses: Address[]
  userAddresses: UserAddress[]
  isLoading: boolean
}

function AddressSelector({ user, address, addresses, userAddresses, isLoading }: AddressSelectProps) {
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
                value={address?.id ?? null}
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

  // Every service, FREE included - the admin grant is the whole difference
  // the old admin-only record used to encode (D207/D208).
  const { data: services = [] } = useSaleShippingServices()
  const options = useMemo(() => {
    const out: Record<string, SalesOrderServiceUIOption> = {}
    for (const svc of services) {
      if (svc.code) out[svc.code] = saleServiceToOption(svc)
    }
    return out
  }, [services])

  function handleServiceChange(serviceKey: string) {
    const option = options[serviceKey]

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
        className="flex w-full flex-col gap-3"
      >
        {Object.entries(options).map(([key, option]) => (
          <RadioOption key={key} value={key} variant="card">
            <div className="flex items-center gap-2">
              {option.icon && <option.icon size={24} />}
              <strong>{option.label}</strong>
            </div>
            <div className="flex w-full items-center justify-between gap-2">
              <small>{option.time}</small>
              <strong>
                <Amount value={option.cost} />
              </strong>
            </div>
          </RadioOption>
        ))}
      </RadioGroup>
    </div>
  )
}

function OrderSummary({ orderPrices }: { orderPrices?: SaleQuote }) {
  const { data } = useAdminSalesOrderCheckoutStore()
  const { data: saleMethods = [] } = usePaymentMethods('sale')
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

      <div className="flex w-full items-center justify-between gap-2">
        <p>Shipping</p>
        <strong>
          <Amount value={orderPrices?.shipping_charge ?? 0} />
        </strong>
      </div>

      {appliedFunds > 0 && (
        <div className="flex w-full items-center justify-between gap-2">
          <p>Dorado Funds Applied</p>
          <strong>
            -<Amount value={appliedFunds} />
          </strong>
        </div>
      )}
      {subjectToCharges > 0 && (
        <div className="flex w-full items-center justify-between gap-2">
          <p>{appliedFunds > 0 ? 'Amount Remaining' : 'Items'}</p>
          <strong>
            <Amount value={subjectToCharges} />
          </strong>
        </div>
      )}

      {surcharge > 0 && (
        <div className="flex w-full items-center justify-between gap-2">
          <p>{`${
            saleMethods.find((m) => m.type === data.payment_method)?.label
          } Surcharge (${
            saleMethods.find((m) => m.type === data.payment_method)?.surcharge_label
          })`}</p>
          <strong>
            <Amount value={surcharge} />
          </strong>
        </div>
      )}

      {salesTax > 0 && (
        <div className="flex w-full items-center justify-between gap-2">
          <p>
            <span className="flex items-center gap-1">
              Sales Tax
              <Link asChild className="inline-flex size-4 items-center justify-center">
                <NextLink href="/sales-tax" aria-label="About sales tax">
                  <CircleHelp size={16} />
                </NextLink>
              </Link>
            </span>
          </p>
          <strong>
            <Amount value={salesTax} />
          </strong>
        </div>
      )}

      <div className="pt-2">
        <Divider />

        <div className="flex w-full items-center justify-between gap-2 pt-2">
          <strong>Order Total</strong>
          <strong className="stat-sm">
            <Amount value={orderPrices?.post_charges_amount ?? 0} />
          </strong>
        </div>
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
  orderPrices?: SaleQuote
  funds: number
}) {
  const { data, setData } = useAdminSalesOrderCheckoutStore()

  // CREDIT IS NOT A CHOICE (Jacob, 2026-09-03): the server applies the
  // customer's balance whenever one exists. The switch is gone; the method
  // follows the quote.
  useEffect(() => {
    // Hold the auto-switch until the first quote lands - a 0 base total
    // would call any credit balance "covers it" and flip to CREDIT.
    if (!orderPrices) return
    const prev = data.payment_method

    let next = prev
    if (funds >= orderPrices.base_total) {
      next = 'CREDIT'
    } else if (prev === 'CREDIT') {
      next = 'CARD'
    }

    if (next !== prev) {
      setData({ payment_method: next })
    }
  }, [data.payment_method, funds, orderPrices?.base_total])

  return (
    <>
      {funds > 0 && (
        <div className="">
          <h2 className="eyebrow mb-4">Bullion Credit:</h2>

          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1 items-start">
              <p>Credit Applied:</p>
              <strong className="stat-sm">
                <Amount value={orderPrices?.pre_charges_amount ?? 0} />
              </strong>
            </div>
            <div className="flex flex-col gap-1 items-end">
              <p>Credit Available:</p>
              <strong className="stat-sm">
                <Amount value={funds} />
              </strong>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function PaymentSelect(
  { orderPrices, user, address }:
  { orderPrices?: SaleQuote; user: AdminUser; address: Address | null }
) {
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const { closeDrawer } = useDrawerStore()
  const [isPending, startTransition] = useTransition()

  const { data, setData } = useAdminSalesOrderCheckoutStore()
  const createOrder = useAdminCreateSalesOrder(user.id!)
  const updatePaymentIntent = useUpdatePaymentIntent()
  const { data: clientSecret } = usePaymentIntentSecret('admin', user.id!)
  const isOrderCreating = createOrder.isPending

  const cardNeeded = useMemo(() => {
    if (data.payment_method === 'CREDIT') {
      return false
    } else {
      return true
    }
  }, [data.payment_method])
  const items = useBasket('sale', user.id!)
  const itemsMissing = items.length === 0

  const disabled =
    itemsMissing ||
    !address?.is_valid ||
    isOrderCreating ||
    isLoading ||
    isPending ||
    (cardNeeded && (!clientSecret || !stripePromise))

  // THE INTENT RE-PRICES FROM THE CHECKOUT ROW. Its body used to carry the
  // items, the service, the payment method and the address, resolved from two
  // reference lists here; `UpdatePaymentIntentBody` is `{ user_id, type }` now
  // and the server reads the rest off the customer's own row.
  useEffect(() => {
    if (clientSecret && (orderPrices?.post_charges_amount ?? 0) > 0 && cardNeeded && !itemsMissing) {
      updatePaymentIntent.mutate({ type: 'admin', user_id: user.id! })
    }
  }, [
    clientSecret,
    orderPrices?.post_charges_amount,
    data.payment_method,
    data.service?.value,
    user,
    cardNeeded,
    itemsMissing,
  ])

  const finishCreate = () => {
    startTransition(() => {
      closeDrawer()
    })
    useAdminSalesOrderCheckoutStore.getState().clear()
  }

  // What the payment form calls BEFORE the charge. This used to run AFTER
  // confirmPayment - the admin path kept the D179 ordering long after the
  // customer path was fixed, so a throw here meant a charged card and no
  // order, with paidButNoOrder as the apology. Under the shared form the
  // order is created awaiting payment first, and a failed charge just
  // retries against the saved order.
  const form = () => {
    if (!address || !data.service) {
      throw new Error('The order is not complete')
    }
    return { ...data, address, service: data.service, user }
  }

  // THE INTENT IS THE SERVER'S TO FIND (ruling 43): the customer's own open
  // intent is selected by user_id, because an id in the body could name
  // somebody else's. The card flow calls this once Stripe has confirmed.
  const createOrderForIntent = async () => {
    await createOrder.mutateAsync({ sales_order: form(), items: items.map(toNewCheckoutItem) })
  }

  const handleSubmit = () => {
    createOrder.mutate(
      { sales_order: form(), items: items.map(toNewCheckoutItem) },
      { onSuccess: finishCreate }
    )
  }

  return (
    <>
      {clientSecret && address && (
        <div className="flex flex-col items-center w-full gap-3">
          <div className="flex flex-col gap-6 w-full">
            {cardNeeded && (
              <StripeWrapper
                clientSecret={clientSecret}
                stripePromise={stripePromise}
                address={address}
                formId="admin-payment-form"
                // The TARGET customer's identity on the billing details - the
                // old admin form stamped the ADMIN's session name and email
                // onto the customer's payment.
                billTo={{ name: user.name, email: user.email }}
                createOrder={createOrderForIntent}
                onSuccess={finishCreate}
                onPaymentMethodChange={(method) => {
                  if (data.payment_method !== 'CREDIT') {
                    setData({ payment_method: method })
                  }
                }}
                setIsLoading={setIsLoading}
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
                {!address?.is_valid
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
                {!address?.is_valid
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
