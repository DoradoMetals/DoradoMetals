'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Logo } from '../../icons/logo'
import Sidebar from './sidebar'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import ProfileMenu from './profileMenu'
import SignInButton from '../auth/signInButton'
import { useUserStore } from '@/store/useUserStore'
import { MenuIcon } from '@/components/icons/navIcon'
import Cart from './cart'
import { CartIcon } from '@/components/icons/cartIcon'
import Spots from './spots'
import { useCart } from '@/lib/queries/useCart'


export default function Shell() {
  const pathname = usePathname()
  const data = useUserStore()
  const [isDrawerActive, setIsDrawerActive] = useState(false)
  const [isCartActive, setIsCartActive] = useState(false)
  const { data: cart } = useCart()
  const totalItems = cart?.reduce((sum, item) => sum + (item.quantity ?? 1), 0) ?? 0

  const menuItems = [
    {
      key: 1,
      label: 'BUY',
      src: '/buy',
      className: pathname === '/buy' ? 'text-primary' : 'text-muted',
    },
    {
      key: 2,
      label: 'SELL',
      src: '/sell',
      className: pathname === '/sell' ? 'text-primary' : 'text-muted',
    },
  ]

  return (
    <>
      {/* Navbar */}
      <div className="sticky top-0 z-50 mb-5 shadow-lg">
        <Spots />
        <nav className="bg-card">
          <div className="flex items-center justify-between w-full py-5 p-3 sm:px-20">
            <div className="flex items-center gap-3">
              {/* Logo */}
              <Link className="px-0" href={'/'}>
                <Logo />
              </Link>

              {/* Title */}
              <div className="flex items-center">
                <Link href={'/'}>
                  <span className="text-lg font-light tracking-wide lg:tracking-widest">
                    Dorado Metals Exchange
                  </span>
                </Link>

                {/* Desktop Navbar Links */}
                <div className="hidden lg:flex gap-3 text-sm items-center text-md font-semibold tracking-widest pl-20 gap-10">
                  {menuItems.map((item) => (
                    <Link className={item.className} key={item.key} href={item.src}>
                      <p>{item.label}</p>
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            {/* Desktop Menu */}

            <div className="hidden lg:block flex items-center items-end">
              <div className="flex items-center gap-5">
              <Button
  className="px-0 hover:bg-card relative"
  variant="ghost"
  onClick={() => {
    setIsCartActive(true)
  }}
>
  <CartIcon
    size={20}
    isOpen={isCartActive}
    className="text-muted-foreground hover:bg-card"
  />
  {totalItems > 0 && (
    <span className="absolute -top-1 -right-1 bg-destructive text-white text-[10px] px-1.5 py-0.5 rounded-full leading-none">
      {totalItems}
    </span>
  )}
</Button>

                {data.user ? <ProfileMenu /> : <SignInButton />}
              </div>
            </div>

            {/* Mobile Sidebar and Menu*/}
            <div className="lg:hidden flex gap-3 ml-auto">
            <Button
  className="px-0 hover:bg-card relative"
  variant="ghost"
  onClick={() => {
    setIsCartActive(true)
  }}
>
  <CartIcon
    size={20}
    isOpen={isCartActive}
    className="text-muted-foreground hover:bg-card"
  />
  {totalItems > 0 && (
    <span className="absolute -top-1 -right-1 bg-destructive text-white text-[10px] px-1.5 py-0.5 rounded-full leading-none">
      {totalItems}
    </span>
  )}
</Button>


              <Button
                className="px-0 hover:bg-card"
                variant="ghost"
                onClick={() => setIsDrawerActive(true)}
              >
                <MenuIcon size={20} isOpen={isDrawerActive} className="text-muted-foreground" />
              </Button>
            </div>
          </div>
          <Sidebar isDrawerActive={isDrawerActive} setIsDrawerActive={setIsDrawerActive} />
          <Cart isCartActive={isCartActive} setIsCartActive={setIsCartActive} />
        </nav>
      </div>
    </>
  )
}
