'use client'

import { Button } from '@dorado/components'
import { Minus, Plus, Trash2 } from 'lucide-react'
import Image from 'next/image'
import NumberFlow from '@number-flow/react'
import { sellCartStore } from '@/shared/store/sellCartStore'
import { useRouter } from 'next/navigation'
import { formatRate } from '@/features/rates/utils/resolveRate'
import { getGrossLabel, getPurityLabel } from '@/features/scrap/types'
import type { SellCartItem } from '@/features/cart/types'
import { useDrawerStore } from '@/shared/store/drawerStore'
import { useUser } from '@/features/auth/authClient'
import { ShoppingCartSimpleIcon } from '@phosphor-icons/react'
import { usePurchaseOrderQuote } from '@/features/quotes/queries'
import type { PurchaseOrderQuoteLine } from '@dorado/contracts'
import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'
import { EmptyState } from '@/shared/ui/EmptyState'

export default function SellCart() {
  const router = useRouter()
  const { user } = useUser()
  const { closeDrawer } = useDrawerStore()
  const items = sellCartStore((state) => state.items)
  const premiums = sellCartStore((state) => state.premiums)
  const addItem = sellCartStore((state) => state.addItem)
  const removeOne = sellCartStore((state) => state.removeOne)
  const removeAll = sellCartStore((state) => state.removeAll)

  // Quote lines come back index-aligned with the store array.
  const { data: quote } = usePurchaseOrderQuote(items)
  const lineAt = (storeIndex: number): PurchaseOrderQuoteLine | undefined =>
    quote?.items.find((line) => line.index === storeIndex)

  const total = quote?.total ?? 0

  const emptyCart = (
    <EmptyState
      icon={ShoppingCartSimpleIcon}
      iconSize={80}
      badge={0}
      title="Your sell cart is empty!"
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
    index !== items.length - 1 ? 'border-b border-border' : 'border-none'

  const renderProductItem = (item: SellCartItem, index: number) => {
    const lineTotal = lineAt(index)?.line_total ?? 0
    const quantity = item.quantity ?? 1

    return (
      <div
        key={item.id}
        className={`flex items-center justify-between w-full gap-4 py-4 ${border(index)}`}
      >
        <div className="flex-shrink-0">
          <Image
            src={item.image_front ?? ''}
            width={80}
            height={80}
            className="pointer-events-none cursor-auto object-contain focus:outline-none"
            alt={item.name ?? ''}
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

          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Button variant="tertiary" size="iconSm" onClick={() => removeOne(item)}>
                <Minus size={16} />
              </Button>
              <NumberFlow value={quantity} trend={0} />
              <Button
                variant="tertiary"
                size="iconSm"
                onClick={() => addItem({ ...item, quantity: 1 })}
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
  }

  const renderScrapItem = (item: SellCartItem, index: number) => {
    // A lot's total IS its price; the store's band stands in until the quote.
    const line = lineAt(index)
    const price = line?.line_total ?? 0

    return (
      <div
        key={item.id}
        className={`flex items-center justify-between w-full gap-4 py-4 ${border(index)}`}
      >
        <div className="flex flex-col flex-grow">
          <div className="flex justify-between items-start w-full mt-2">
            <div className="flex flex-col">
              <h5>{item.name || 'Custom Scrap'}</h5>
            </div>
            <Button variant="tertiary" size="iconSm" onClick={() => removeAll(item)}>
              <Trash2 size={16} />
            </Button>
          </div>

          <div className="flex items-end">
            <div className="flex flex-col mr-auto gap-1">
              {getGrossLabel(item.pre_melt ?? 0, item.unit ?? '')}
              {getPurityLabel(item.purity ?? 0, item.metal ?? '')}
              <small>Rate: {formatRate(line?.premium ?? premiums[item.id])}</small>
            </div>

            <strong className="ml-auto">
              <PriceNumberFlow value={price} />
            </strong>
          </div>
        </div>
      </div>
    )
  }

  const cartContent = (
    <div className="w-full flex-col">
      {items.map((item, index) =>
        item.bullion_id !== null ? renderProductItem(item, index) : renderScrapItem(item, index)
      )}
    </div>
  )

  const cartFooter = (
    <div className="w-full mt-2">
      <div className="flex justify-between items-end sm:mb-2">
        <h3>Price Estimate:</h3>
        <h3>
          <PriceNumberFlow value={total} />
        </h3>
      </div>
      <Button
        className="w-full"
        onClick={() => {
          user ? router.push('/checkout') : router.push('/authentication')
        }}
      >
        {user ? 'Sell Your Items' : 'Sign In to Sell Your Items'}
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
