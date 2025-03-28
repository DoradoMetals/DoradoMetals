'use client'
import CartDrawer from '@/components/drawers/cartDrawer'
import { Button } from '@/components/ui/button'
import { useAddToCart, useCart, useRemoveFromCart, useRemoveItemFromCart } from '@/lib/queries/useCart'
import { removeItem } from '@motionone/utils'
import NumberFlow from '@number-flow/react'
import { Minus, Plus, X } from 'lucide-react'
import Image from 'next/image'
import { Dispatch, useEffect } from 'react'

export default function Cart({
  isCartActive,
  setIsCartActive,
}: {
  isCartActive: boolean
  setIsCartActive: Dispatch<React.SetStateAction<boolean>>
}) {
  const { data: cart, isLoading } = useCart()
  const addToCartMutation = useAddToCart()
  const removeFromCartMutation = useRemoveFromCart()
  const removeItemFromCartMutation = useRemoveItemFromCart();

  const cartContent = (
    <>
      <div className="w-full p-5 flex-col">
        <div className="title-text mb-5">Cart {`(${cart?.length})`}</div>
        <div className="flex-col gap-10">
          {cart?.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between w-full gap-4 py-4 border-b border-border"
            >
              {/* Thumbnail */}
              <div className="flex-shrink-0">
                <Image
                  src={item.image_front}
                  width={80}
                  height={80}
                  className="pointer-events-none cursor-auto object-contain focus:outline-none drop-shadow-lg"
                  alt={item.product_name}
                />
              </div>

              {/* Product info and quantity controls */}
              <div className="flex flex-col flex-grow min-w-0">
                <div className="flex justify-between items-start w-full mt-2">
                  <div className="flex flex-col">
                    <div className="primary-text">
                      {item.product_name}
                    </div>
                    <div className="secondary-text">{item.product_type}</div>
                  </div>
                  <Button
                      variant="ghost"
                      size="sm"
                      className="hover:bg-card p-1"
                      onClick={() => removeItemFromCartMutation.mutate(item)}
                    >
                      <X size={16} />
                    </Button>
                </div>

                <div className="flex justify-between items-center mt-3">
                  {/* Quantity Controls */}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="hover:bg-card p-1"
                      onClick={() => removeFromCartMutation.mutate(item)}
                    >
                      <Minus size={16} />
                    </Button>

                    <NumberFlow
                      value={item.quantity ?? 0}
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
                      onClick={() => addToCartMutation.mutate(item)}
                    >
                      <Plus size={16} />
                    </Button>
                  </div>

                  {/* Price */}
                  <div className="primary-text">$3,456.35</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )

  return (
    <div className="">
      <CartDrawer open={isCartActive} setOpen={setIsCartActive}>
        <div className="w-full h-full bg-card border-t-1 border-primary lg:border-none">
          {cartContent}
        </div>
      </CartDrawer>
    </div>
  )
}
