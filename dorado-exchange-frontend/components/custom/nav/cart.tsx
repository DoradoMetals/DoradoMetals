'use client'
import CartDrawer from '@/components/drawers/cartDrawer'
import { Button } from '@/components/ui/button'
import {
  useAddToCart,
  useCart,
  useRemoveFromCart,
  useRemoveItemFromCart,
} from '@/lib/queries/useCart'
import NumberFlow from '@number-flow/react'
import { Minus, Plus, ShoppingCart, X } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { Dispatch } from 'react'
import ProductPrice from '../products/productPrice'

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
  const removeItemFromCartMutation = useRemoveItemFromCart()

  const emptyCart = (
    <div className="w-full h-full flex flex-col items-center justify-center text-center gap-4 py-10">
      <div className="relative mb-5">
        <ShoppingCart size={80} className="text-neutral-800" strokeWidth={1.5} />
        <div className="absolute -top-6 right-3.5 border border-secondary text-xl text-secondary rounded-full w-10 h-10 flex items-center  justify-center ">
          0
        </div>
      </div>

      <div className="flex-col items-center gap-1 mb-5">
        <h2 className="title-text tracking-wide">Your cart is empty!</h2>
        <p className="tertiary-text">Add items to get started.</p>
      </div>
      <Link href="/buy" passHref>
        <Button
          variant="outline"
          className="bg-card hover:bg-highest border-1"
          onClick={() => setIsCartActive(false)}
        >
          Start Shopping
        </Button>
      </Link>
    </div>
  )

  const cartContent = (
    <>
      <div className="w-full p-5 flex-col">
        <div className="title-text mb-2">Cart {`(${cart?.length})`}</div>
        <div className="flex-col gap-10">
          {cart?.map((item, index) => (
            <div
              key={index}
              className="flex items-center justify-between w-full gap-4 py-4 border-b border-border"
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
                    className="hover:bg-card p-1"
                    onClick={() => removeItemFromCartMutation.mutate(item)}
                  >
                    <X size={16} />
                  </Button>
                </div>

                <div className="flex justify-between items-center mt-3">
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

                  <ProductPrice product={item} />
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
        <div className="w-full h-full bg-card border-t-1 border-text-neutral-700 lg:border-none flex flex-col py-3">
          <Button
            variant="ghost"
            size="icon"
            className="hidden sm:flex hover:bg-card"
            onClick={() => setIsCartActive(false)}
          >
            <X size={24} className="text-neutral-900" />
          </Button>
          <div className="flex-1 overflow-y-auto px-5 pb-50">
            {cart?.length === 0 ? emptyCart : cartContent}
          </div>
        </div>
      </CartDrawer>
    </div>
  )
}
