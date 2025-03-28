'use client'
import CartDrawer from '@/components/drawers/cartDrawer'
import { Dispatch } from 'react'

export default function Cart({
  isCartActive,
  setIsCartActive,
}: {
  isCartActive: boolean
  setIsCartActive: Dispatch<React.SetStateAction<boolean>>
}) {

  const cartContent = (
    <>
      <div className="w-full flex-col">
        <div className='text-xl'>
          Cart
        </div>
      </div>
    </>
  )

  return (
    <div className="">
      <CartDrawer open={isCartActive} setOpen={setIsCartActive}>
        <div className="w-screen h-full bg-card border-t-1 border-primary">{cartContent}</div>
      </CartDrawer>
    </div>
  )
}
