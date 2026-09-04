'use client'

import { Button } from '@dorado/components'
import { Minus, Plus, Trash2 } from 'lucide-react'
import Image from 'next/image'
import NumberFlow from '@number-flow/react'
import { useRouter } from 'next/navigation'
import { ShoppingCartSimpleIcon } from '@phosphor-icons/react'
import { useCheckoutItems } from '@/shared/store/checkoutItemsStore'
import { useCheckoutItemActions } from '@/features/checkout/items/queries'
import { useDecoratedLines, type DecoratedLine } from '@/features/checkout/items/flair'
import { formatRate } from '@/features/rates/utils/resolveRate'
import { getGrossLabel, getPurityLabel } from '@/features/scrap/types'
import { useDrawerStore } from '@/shared/store/drawerStore'
import { useUser } from '@/features/auth/authClient'
import { usePurchaseOrderQuote } from '@/features/quotes/queries'
import type { PurchaseOrderQuoteLine } from "@dorado/contracts";
import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'
import { EmptyState } from '@/shared/ui/EmptyState'

// The SELL basket: direction 'purchase' - the business buys.
export default function PurchaseItems() {
  const router = useRouter()
  const { user } = useUser()
  const { closeDrawer } = useDrawerStore()

  const items = useCheckoutItems((state) => state.purchase)
  const { addItem, removeOne, removeAll } = useCheckoutItemActions()
  const rows = useDecoratedLines(items)

  // Quote lines come back index-aligned with the store array.
  const { data: quote } = usePurchaseOrderQuote(items)
  const lineAt = (index: number): PurchaseOrderQuoteLine | undefined =>
    quote?.items.find((line) => line.index === index)

  const empty = (
    <EmptyState
      icon={ShoppingCartSimpleIcon}
      iconSize={80}
      badge={0}
      title="You have nothing to sell yet!"
      description="Add items to get a price estimate."
      className="h-full justify-center pb-10"
    >
      <Button
        size="xl"
        onClick={() => {
          router.push('/sell')
          closeDrawer()
        }}
      >
        Start Selling
      </Button>
    </EmptyState>
  )

  const border = (index: number) =>
    index !== rows.length - 1 ? 'border-b border-border' : 'border-none'

  const renderProduct = ({ line, index, name, image_front, mint_name }: DecoratedLine) => (
    <div
      key={line.id}
      className={`flex items-center justify-between w-full gap-4 py-4 ${border(index)}`}
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
          <Button variant="tertiary" size="iconSm" onClick={() => removeAll('purchase', line)}>
            <Trash2 size={16} />
          </Button>
        </div>

        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Button variant="tertiary" size="iconSm" onClick={() => removeOne('purchase', line)}>
              <Minus size={16} />
            </Button>
            <NumberFlow value={line.quantity ?? 1} trend={0} />
            <Button
              variant="tertiary"
              size="iconSm"
              onClick={() => addItem('purchase', { ...line, quantity: 1 })}
            >
              <Plus size={16} />
            </Button>
          </div>
          <strong>
            <PriceNumberFlow value={lineAt(index)?.line_total ?? 0} />
          </strong>
        </div>
      </div>
    </div>
  )

  const renderLot = ({ line, index, name, metal }: DecoratedLine) => {
    const quoted = lineAt(index)

    return (
      <div
        key={line.id}
        className={`flex items-center justify-between w-full gap-4 py-4 ${border(index)}`}
      >
        <div className="flex flex-col flex-grow">
          <div className="flex justify-between items-start w-full mt-2">
            <div className="flex flex-col">
              <h5>{name}</h5>
            </div>
            <Button variant="tertiary" size="iconSm" onClick={() => removeAll('purchase', line)}>
              <Trash2 size={16} />
            </Button>
          </div>

          <div className="flex items-end">
            <div className="flex flex-col mr-auto gap-1">
              {getGrossLabel(line.pre_melt ?? 0, line.unit ?? '')}
              {getPurityLabel(line.purity ?? 0, metal ?? '')}
              <small>Rate: {formatRate(quoted?.premium)}</small>
            </div>

            <strong className="ml-auto">
              <PriceNumberFlow value={quoted?.line_total ?? 0} />
            </strong>
          </div>
        </div>
      </div>
    )
  }

  const content = (
    <div className="w-full flex-col">
      {rows.map((row) => (row.line.bullion_id ? renderProduct(row) : renderLot(row)))}
    </div>
  )

  const footer = (
    <div className="w-full mt-2">
      <div className="flex justify-between items-end sm:mb-2">
        <h3>Price Estimate:</h3>
        <h3>
          <PriceNumberFlow value={quote?.total ?? 0} />
        </h3>
      </div>
      <Button
        className="w-full"
        onClick={() => router.push(user ? '/checkout' : '/authentication')}
      >
        {user ? 'Sell Your Items' : 'Sign In to Sell Your Items'}
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
