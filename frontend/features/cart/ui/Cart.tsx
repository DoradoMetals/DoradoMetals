'use client'

import { Button } from '@/shared/ui/base/button'
import { Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react'
import Image from 'next/image'
import NumberFlow from '@number-flow/react'
import { cartStore } from '@/shared/store/cartStore'
import { useRouter } from 'next/navigation'
import { useDrawerStore } from '@/shared/store/drawerStore'
import { useUser } from '@/features/auth/authClient'
import { useCatalogQuote } from '@/features/quotes/queries'
import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'
import { EmptyState } from '@/shared/ui/EmptyState'

export default function Cart() {
  const router = useRouter()
  const { user } = useUser()

  const { closeDrawer } = useDrawerStore()

  const items = cartStore((state) => state.items)
  const addItem = cartStore((state) => state.addItem)
  const removeOne = cartStore((state) => state.removeOne)
  const removeAll = cartStore((state) => state.removeAll)

  // ONE ask quote for the whole cart - every line total and the footer total
  // are the server's answers, keyed back to the lines by product id. Public
  // like the catalogue, so a signed-out cart still prices.
  const { data: quote } = useCatalogQuote(
    items.map((item) => ({ id: item.id, quantity: item.quantity ?? 1 })),
    'ask'
  )
  const lineTotals = new Map((quote?.items ?? []).map((line) => [line.id, line.line_total]))
  const total = quote?.total ?? 0

  const emptyCart = (
    <EmptyState
      icon={ShoppingCart}
      iconSize={80}
      badge={0}
      title="Your cart is empty!"
      description="Add items to get started."
      className="h-full justify-center pb-10"
    >
      <Button
        size="xl"
        onClick={() => {
          router.push('/buy')
          closeDrawer()
        }}
      >
        Start Shopping
      </Button>
    </EmptyState>
  )

  const cartContent = (
    <div className="w-full flex-col">
      <div className="flex-col gap-10">
        {items.map((item, index) => {
          const lineTotal = lineTotals.get(item.id) ?? 0
          const quantity = item.quantity ?? 1

          return (
            <div
              key={item.name}
              className={`flex items-center justify-between w-full gap-4 py-4 ${
                index !== items.length - 1 ? 'border-b border-border' : 'border-none'
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
                    <h5>{item.name}</h5>
                    <small>{item.mint_name}</small>
                  </div>
                  <Button variant="tertiary" size="iconSm" onClick={() => removeAll(item)}>
                    <Trash2 size={16} />
                  </Button>
                </div>

                <div className="flex justify-between items-center mt-3">
                  <div className="flex items-center gap-2">
                    <Button variant="tertiary" size="iconSm" onClick={() => removeOne(item)}>
                      <Minus size={16} />
                    </Button>
                    <NumberFlow
                      value={quantity}
                      transformTiming={{ duration: 750, easing: 'ease-in' }}
                      spinTiming={{ duration: 150, easing: 'ease-out' }}
                      trend={0}
                    />
                    <Button variant="tertiary" size="iconSm" onClick={() => addItem(item)}>
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
  )

  const cartFooter = (
    <div className="w-full mt-2">
      <div className="flex justify-between items-end sm:mb-2">
        <h3>Total:</h3>
        <h3>
          <PriceNumberFlow value={total} />
        </h3>
      </div>
      <Button
        className="w-full"
        onClick={() => {
          user ? router.push('/sales-order-checkout') : router.push('/authentication')
        }}
      >
        {user ? 'Checkout' : 'Sign In to Checkout'}
      </Button>
    </div>
  )

  return (
    <>
      <div className="flex-1 overflow-y-auto px-5 pb-50">
        {items.length === 0 ? emptyCart : cartContent}
      </div>

      {items.length > 0 && <div className="sticky bottom-0 w-full z-10">{cartFooter}</div>}
    </>
  )
}
