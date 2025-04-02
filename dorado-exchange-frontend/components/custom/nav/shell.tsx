'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Logo } from '../../icons/logo'
import Sidebar from './sidebar'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import ProfileMenu from './profileMenu'
import SignInButton from '../auth/signInButton'
import { useUserStore } from '@/store/userStore'
import { MenuIcon } from '@/components/icons/navIcon'
import { CartIcon } from '@/components/icons/cartIcon'
import { cartStore } from '@/store/cartStore'
import { useCartAutoSync, useHydrateCartFromBackend } from '@/lib/queries/useCart'
import { CartTabs } from '../cart/cartTabs'
import Spots from '../spots/spots'
import { useHydrateSellCartFromBackend, useSellCartAutoSync } from '@/lib/queries/useSellCart'
import { sellCartStore } from '@/store/sellCartStore'

export default function Shell() {
  const pathname = usePathname()
  const data = useUserStore()
  const [isDrawerActive, setIsDrawerActive] = useState(false)
  const [isCartActive, setIsCartActive] = useState(false)
  const items = cartStore((state) => state.items.length)
  const sellItems = sellCartStore((state) => state.items.length)

  useSellCartAutoSync()
  useHydrateSellCartFromBackend()
  useCartAutoSync()
  useHydrateCartFromBackend()

  function getBadgePosition(type: 'buy' | 'sell', buyCount: number) {
    if (type === 'buy') return '-top-0 -right-0'
    if (type === 'sell') return buyCount > 0 ? 'top-0 -right-4' : '-top-0 -right-0'
    return ''
  }

  const menuItems = [
    {
      key: 1,
      label: 'BUY',
      src: '/buy',
      className: pathname === '/buy' ? 'text-primary' : 'text-neutral-400',
    },
    {
      key: 2,
      label: 'SELL',
      src: '/sell',
      className: pathname === '/sell' ? 'text-primary' : 'text-neutral-400',
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
                <div className="hidden lg:flex gap-3 text-sm items-center font-semibold tracking-widest pl-20 gap-10">
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
              <div className="flex items-center gap-8">
                <Button
                  className="px-0 hover:bg-card relative"
                  variant="ghost"
                  onClick={() => {
                    setIsCartActive(true)
                  }}
                >
                  <CartIcon
                    size={24}
                    isOpen={isCartActive}
                    className="text-muted-foreground hover:bg-card"
                  />
                  {items > 0 && (
                    <span
                      className={`absolute ${getBadgePosition(
                        'buy',
                        items
                      )} w-4 h-4 bg-secondary text-white text-[12px] py-0.5 rounded-full leading-none`}
                    >
                      {items}
                    </span>
                  )}
                  {sellItems > 0 && (
                    <span
                      className={`absolute ${getBadgePosition(
                        'sell',
                        items
                      )} w-4 h-4 bg-primary text-white text-[12px] py-0.5 rounded-full leading-none`}
                    >
                      {sellItems}
                    </span>
                  )}
                </Button>

                {data.user ? <ProfileMenu /> : <SignInButton />}
              </div>
            </div>

            {/* Mobile Sidebar and Menu*/}
            <div className="lg:hidden flex items-end ml-auto gap-3">
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
                  className="text-neutral-700 hover:bg-card"
                />
                {items > 0 && (
                  <span
                    className={`absolute ${getBadgePosition(
                      'buy',
                      items
                    )} w-4 h-4 bg-secondary text-white text-[12px] py-0.5 rounded-full leading-none`}
                  >
                    {items}
                  </span>
                )}
                {sellItems > 0 && (
                  <span
                    className={`absolute ${getBadgePosition(
                      'sell',
                      items
                    )} w-4 h-4 bg-primary text-white text-[12px] py-0.5 rounded-full leading-none`}
                  >
                    {sellItems}
                  </span>
                )}
              </Button>

              <Button
                className="px-0 hover:bg-card"
                variant="ghost"
                onClick={() => setIsDrawerActive(true)}
              >
                <MenuIcon size={24} isOpen={isDrawerActive} className="text-neutral-700" />
              </Button>
            </div>
          </div>
          <Sidebar isDrawerActive={isDrawerActive} setIsDrawerActive={setIsDrawerActive} />
          <CartTabs isCartActive={isCartActive} setIsCartActive={setIsCartActive} />
        </nav>
      </div>
    </>
  )
}
