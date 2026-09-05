'use client'

import { Amount, Button, EmptyState } from '@dorado/components'
import { Minus, Plus, ShoppingCart, Trash2 } from '@dorado/icons'
import Image from 'next/image'
import NumberFlow from '@number-flow/react'
import { useRouter } from 'next/navigation'
import { useBasket, useCheckoutItemActions } from '@/features/checkout/items/queries'
import { useDecoratedLines } from '@/features/checkout/items/flair'
import { useDrawerStore } from '@/shared/store/drawerStore'
import { useUser } from '@/features/auth/authClient'
import { useCheckoutQuote } from '@/features/quotes/queries'

// The BUY basket: direction 'sale' - the business sells.
export default function SaleItems() {
  const router = useRouter()
  const { user } = useUser()
  const { closeDrawer } = useDrawerStore()

  const items = useBasket('sale')
  const { addOne, removeOne, removeAll } = useCheckoutItemActions()
  const rows = useDecoratedLines(items)

  // ONE quote for the whole basket - every line total and the footer total are
  // the server's answers, keyed by the row's own id.
  const { data: answer } = useCheckoutQuote('sale')
  const quote = answer?.direction === 'sale' ? answer : undefined
  const lineTotals = new Map((quote?.items ?? []).map((line) => [line.id, line.line_total]))

  const empty = (
    <EmptyState
      icon={<ShoppingCart />}
      badge={0}
      title="You have nothing to buy yet!"
      description="Add items to get started."
      className="h-full justify-center pb-10"
      action={
        <Button
          size="xl"
          onClick={() => {
            router.push('/buy')
            closeDrawer()
          }}
        >
          Start Shopping
        </Button>
      }
    />
  )

  const content = (
    <div className="w-full flex-col">
      <div className="flex-col gap-10">
        {rows.map(({ line, index, name, image_front, mint_name }) => (
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
                  <h5>{name}</h5>
                  <small>{mint_name}</small>
                </div>
                <Button variant="tertiary" size="iconSm" onClick={() => removeAll('sale', line)}>
                  <Trash2 size={16} />
                </Button>
              </div>

              <div className="flex justify-between items-center mt-3">
                <div className="flex items-center gap-2">
                  <Button variant="tertiary" size="iconSm" onClick={() => removeOne('sale', line)}>
                    <Minus size={16} />
                  </Button>
                  <NumberFlow
                    value={line.quantity ?? 1}
                    transformTiming={{ duration: 750, easing: 'ease-in' }}
                    spinTiming={{ duration: 150, easing: 'ease-out' }}
                    trend={0}
                    className="tabular-nums"
                  />
                  <Button
                    variant="tertiary"
                    size="iconSm"
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
        ))}
      </div>
    </div>
  )

  const footer = (
    <div className="w-full mt-2">
      <div className="flex justify-between items-end sm:mb-2">
        <h3>Total:</h3>
        <h3>
          <Amount value={quote?.order_total ?? 0} />
        </h3>
      </div>
      <Button
        className="w-full"
        onClick={() => router.push(user ? '/sales-order-checkout' : '/authentication')}
      >
        {user ? 'Checkout' : 'Sign In to Checkout'}
      </Button>
    </div>
  )

  return (
    <>
      <div className="flex-1 overflow-y-auto px-5 pb-50">
        {items.length === 0 ? empty : content}
      </div>

      {items.length > 0 && <div className="sticky bottom-0 w-full z-10">{footer}</div>}
    </>
  )
}
