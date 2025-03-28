'use client'
import CartDrawer from '@/components/drawers/cartDrawer'
import { useCart } from '@/lib/queries/useCart'
import { Dispatch, useEffect } from 'react'

export default function Cart({
  isCartActive,
  setIsCartActive,
}: {
  isCartActive: boolean
  setIsCartActive: Dispatch<React.SetStateAction<boolean>>
}) {
  const { data: cart, isLoading } = useCart()

  const cartContent = (
    <>
      <div className="w-full flex-col">
        <div className="title-text p-5 mb-5">Cart</div>
        {cart?.map((item) => (
          <div key={item.id} className="flex gap-4 w-full items-center">
            <div className="flex items-center">{item.product_name}</div>
            <div className="flex flex-col gap-1">
              <div className="title-text">{item.product_type}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  )

  return (
    <div className="">
      <CartDrawer open={isCartActive} setOpen={setIsCartActive}>
        <div className="w-screen h-full bg-card border-t-1 border-primary lg:border-none">
          {cartContent}
        </div>
      </CartDrawer>
    </div>
  )
}
