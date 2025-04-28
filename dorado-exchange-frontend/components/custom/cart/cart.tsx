'use client'

import { Button } from '@/components/ui/button'
import { Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import NumberFlow from '@number-flow/react'
import { cartStore } from '@/store/cartStore'
import { useSpotPrices } from '@/lib/queries/useSpotPrices'
import getProductPrice from '@/utils/getProductPrice'
import PriceNumberFlow from '../products/PriceNumberFlow'
import { useRouter } from 'next/navigation'
import { useDrawerStore } from '@/store/drawerStore'

export default function Cart() {
  const router = useRouter()
  const { closeDrawer } = useDrawerStore()

  const items = cartStore((state) => state.items)
  const addItem = cartStore((state) => state.addItem)
  const removeOne = cartStore((state) => state.removeOne)
  const removeAll = cartStore((state) => state.removeAll)

  const { data: spotPrices = [] } = useSpotPrices()

  const total = items.reduce((acc, item) => {
    const spot = spotPrices.find((s) => s.type === item.metal_type)
    const price = getProductPrice(item, spot)
    const quantity = item.quantity ?? 1
    return acc + price * quantity
  }, 0)

  const emptyCart = (
    <div className="w-full h-full flex flex-col items-center justify-center text-center gap-4 pb-10">
      <div className="relative mb-5">
        <ShoppingCart size={80} className="text-neutral-800" strokeWidth={1.5} />
        <div className="absolute -top-6 right-3.5 border border-secondary text-xl text-secondary rounded-full w-10 h-10 flex items-center justify-center">
          0
        </div>
      </div>

      <div className="flex-col items-center gap-1 mb-5">
        <h2 className="title-text tracking-wide">Your cart is empty!</h2>
        <p className="tertiary-text">Add items to get started.</p>
      </div>

      <Button
        variant="secondary"
        onClick={() => {
          router.push('/buy')
          closeDrawer()
        }}
      >
        Start Shopping
      </Button>
    </div>
  )

  const cartContent = (
    <div className="w-full flex-col mt-5">
      <div className="flex-col gap-10">
        {items.map((item, index) => {
          const spot = spotPrices.find((s) => s.type === item.metal_type)
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
  )

  const cartFooter = (
    <div className="w-full p-5 bg-card">
      <div className="flex justify-between items-center mb-4">
        <div className="text-lg text-neutral-800">Total</div>
        <div className="text-lg text-neutral-800">
          <PriceNumberFlow value={total} />
        </div>
      </div>
      <Button
        className="w-full bg-secondary text-neutral-900 hover:bg-secondary hover:shadow-lg"
      >
        Checkout
      </Button>
    </div>
  )

  return (
    <>
      <div className="flex-1 overflow-y-auto px-5 pb-50">
        {items.length === 0 ? emptyCart : cartContent}
      </div>

      {items.length > 0 && <div className="sticky bottom-0 w-full bg-card z-10">{cartFooter}</div>}
    </>
  )
}