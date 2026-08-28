'use client'

import { Button } from '@/shared/ui/base/button'
import { Minus, Plus, Trash2 } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import NumberFlow from '@number-flow/react'
import { sellCartStore } from '@/shared/store/sellCartStore'
import { useRouter } from 'next/navigation'
import { formatRate } from '@/features/rates/utils/resolveRate'
import { getGrossLabel, getPurityLabel, Scrap } from '@/features/scrap/types'
import { Product } from '@/features/products/types'
import { useDrawerStore } from '@/shared/store/drawerStore'
import { useUser } from '@/features/auth/authClient'
import { ShoppingCartSimpleIcon } from '@phosphor-icons/react'
import { usePurchaseOrderQuote } from '@/features/quotes/queries'
import type { PurchaseOrderQuoteLine } from '@dorado/contracts'
import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'

export default function SellCart() {
  const router = useRouter()
  const { user } = useUser()
  const { closeDrawer } = useDrawerStore()
  const items = sellCartStore((state) => state.items)
  const addItem = sellCartStore((state) => state.addItem)
  const removeOne = sellCartStore((state) => state.removeOne)
  const removeAll = sellCartStore((state) => state.removeAll)

  // ONE purchase-order quote for the whole cart: it prices products and scrap
  // alike, banded on each metal's total content across every line. Its lines
  // come back INDEX-ALIGNED with the store array - sell-cart lines have no
  // stable id, so `items[i]` answers as `index: i` - which is why the
  // product/scrap renders below carry their ORIGINAL store index rather than
  // their position in the filtered list. Gated on the session: the endpoint
  // is per-caller, so a signed-out cart estimates at zero.
  const { data: quote } = usePurchaseOrderQuote(items)
  const lineAt = (storeIndex: number): PurchaseOrderQuoteLine | undefined =>
    quote?.items.find((line) => line.index === storeIndex)

  const indexed = items.map((item, storeIndex) => ({ item, storeIndex }))
  const productItems = indexed.filter(({ item }) => item.type === 'product')
  const scrapItems = indexed.filter(({ item }) => item.type === 'scrap')

  const total = quote?.total ?? 0

  const emptyCart = (
    <div className="w-full h-full flex flex-col items-center justify-center text-center gap-4 pb-10">
      <div className="relative mb-5">
        <ShoppingCartSimpleIcon size={80} strokeWidth={1.5} className="text-primary" />
        {/* Zero-count bubble, same shape as the buy cart's. --border-strong is
            the token for an edge meant to read as deliberate; the numeral's
            size and colour come from the tag. */}
        <p className="absolute -top-6 right-3.5 border border-border-strong rounded-full w-10 h-10 flex items-center justify-center">
          0
        </p>
      </div>

      <div className="flex-col items-center gap-1 mb-5">
        <h2>Your sell cart is empty!</h2>
        <small>Add items to get a price estimate.</small>
      </div>
      <Link href="/sell" passHref>
        <Button
          size="xl"
          onClick={() => {
            router.push('/sell')
            closeDrawer()
          }}
        >
          Start Selling
        </Button>
      </Link>
    </div>
  )

  const renderProductItem = (item: Product, index: number, storeIndex: number) => {
    const lineTotal = lineAt(storeIndex)?.line_total ?? 0
    const quantity = item.quantity ?? 1

    return (
      <div
        key={index}
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
            <Button
              variant="tertiary"
              size="iconSm"
              onClick={() => removeAll({ type: 'product', data: item })}
            >
              <Trash2 size={16} />
            </Button>
          </div>

          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Button
                variant="tertiary"
                size="iconSm"
                onClick={() => removeOne({ type: 'product', data: item })}
              >
                <Minus size={16} />
              </Button>
              <NumberFlow value={quantity} trend={0} />
              <Button
                variant="tertiary"
                size="iconSm"
                onClick={() => addItem({ type: 'product', data: { ...item, quantity: 1 } })}
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

  const renderScrapItem = (item: Scrap, index: number, storeIndex: number) => {
    // A scrap line's total IS its price - content covers the whole line. The
    // rate shown prefers the quote's server-resolved band; the store's own
    // re-tiered bid_premium stands in while there is no quote (signed out).
    const line = lineAt(storeIndex)
    const price = line?.line_total ?? 0

    return (
      <div
        key={index}
        className={`flex items-center justify-between w-full gap-4 py-4 ${
          index !== items.length - 1 ? 'border-b border-border' : 'border-none'
        }`}
      >
        <div className="flex flex-col flex-grow">
          <div className="flex justify-between items-start w-full mt-2">
            <div className="flex flex-col">
              <h5>{item.name || 'Custom Scrap'}</h5>
            </div>
            <Button
              variant="tertiary"
              size="iconSm"
              onClick={() => removeAll({ type: 'scrap', data: item })}
            >
              <Trash2 size={16} />
            </Button>
          </div>

          <div className="flex items-end">
            <div className="flex flex-col mr-auto gap-1">
              {getGrossLabel(item.pre_melt, item.gross_unit)}
              {getPurityLabel(item.purity, item.metal)}
              <small>Rate: {formatRate(line?.premium ?? item.bid_premium)}</small>
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
      {productItems.length > 0 && (
        <div>
          {productItems.map(({ item, storeIndex }, i) =>
            renderProductItem(item.data as Product, i, storeIndex)
          )}
        </div>
      )}
      {scrapItems.length > 0 && (
        <div>
          {scrapItems.map(({ item, storeIndex }, i) =>
            renderScrapItem(item.data as Scrap, i, storeIndex)
          )}
        </div>
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
