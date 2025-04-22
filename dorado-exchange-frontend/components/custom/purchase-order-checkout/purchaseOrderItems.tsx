'use client'

import { Button } from '@/components/ui/button'
import { Minus, Plus, ShoppingCart, Trash2, X } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import NumberFlow from '@number-flow/react'
import { sellCartStore } from '@/store/sellCartStore'
import { useSpotPrices } from '@/lib/queries/useSpotPrices'
import getProductPrice from '@/utils/getProductPrice'
import PriceNumberFlow from '../products/PriceNumberFlow'
import { useRouter } from 'next/navigation'
import getScrapPrice from '@/utils/getScrapPrice'
import { getGrossLabel, getPurityLabel, Scrap } from '@/types/scrap'
import { Product } from '@/types/product'
import { Dispatch } from 'react'

export default function PurchaseOrderItems() {
  const router = useRouter()
  const items = sellCartStore((state) => state.items)
  const addItem = sellCartStore((state) => state.addItem)
  const removeOne = sellCartStore((state) => state.removeOne)
  const removeAll = sellCartStore((state) => state.removeAll)
  const { data: spotPrices = [] } = useSpotPrices()

  const productItems = items.filter((item) => item.type === 'product')
  const scrapItems = items.filter((item) => item.type === 'scrap')

  const total = items.reduce((acc, item) => {
    if (item.type === 'product') {
      const spot = spotPrices.find((s) => s.type === item.data.metal_type)
      const price = getProductPrice(item.data, spot)
      const quantity = item.data.quantity ?? 1
      return acc + price * quantity
    }

    if (item.type === 'scrap') {
      const spot = spotPrices.find((s) => s.type === item.data.metal)
      const price = getScrapPrice(item.data.content ?? 0, spot)
      return acc + price
    }

    return acc
  }, 0)



  const renderProductItem = (item: Product, index: number) => {
    const spot = spotPrices.find((s) => s.type === item.metal_type)
    const price = getProductPrice(item, spot)
    const quantity = item.quantity ?? 1

    return (
      <div
        key={index}
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
              onClick={() => removeAll({ type: 'product', data: item })}
            >
              <Trash2 size={16} className="text-neutral-500" />
            </Button>
          </div>

          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="hover:bg-card p-1"
                onClick={() => removeOne({ type: 'product', data: item })}
              >
                <Minus size={16} />
              </Button>
              <NumberFlow value={quantity} className="primary-text" trend={0} />
              <Button
                variant="ghost"
                size="sm"
                className="hover:bg-card p-1"
                onClick={() => addItem({ type: 'product', data: item })}
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
  }

  const renderScrapItem = (item: Scrap, index: number) => {
    const spot = spotPrices.find((s) => s.type === item.metal)
    const price = getScrapPrice(item.content ?? 0, spot)

    return (
      <div
        key={index}
        className={`flex items-center justify-between w-full gap-4 py-4 ${
          index !== items.length - 1 ? 'border-b border-neutral-300' : 'border-none'
        }`}
      >
        <div className="flex flex-col flex-grow">
          <div className="flex justify-between items-start w-full mt-2">
            <div className="flex flex-col">
              <div className="text-sm text-neutral-800">{item.name || 'Custom Scrap'}</div>
              <div className="flex items-center secondary-text gap-5"></div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="hover:bg-card p-0 pb-2"
              onClick={() => removeAll({ type: 'scrap', data: item })}
            >
              <Trash2 size={16} className="text-neutral-500" />
            </Button>
          </div>

          <div className="flex items-end">
            <div className="flex flex-col mr-auto gap-1">
              {getGrossLabel(item.gross, item.gross_unit)}
              {getPurityLabel(item.purity, item.metal)}
            </div>

            <div className="ml-auto text-neutral-800 text-base">
              <PriceNumberFlow value={price} />
            </div>
          </div>
        </div>
      </div>
    )
  }

  const cartContent = (
    <div className="w-full flex-col space-y-10">
      {productItems.length > 0 && (
        <div>{productItems.map((item, i) => renderProductItem(item.data as Product, i))}</div>
      )}
      {scrapItems.length > 0 && (
        <div>{scrapItems.map((item, i) => renderScrapItem(item.data as Scrap, i))}</div>
      )}
    </div>
  )



  return (
    <>
      <div className="">
        {cartContent}
      </div>

    </>
  )
}
