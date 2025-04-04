'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Logo } from '../../icons/logo'
import Sidebar from './sidebar'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import ProfileMenu from './profileMenu'
import SignInButton from '../auth/signInButton'
import { MenuIcon } from '@/components/icons/navIcon'
import { CartIcon } from '@/components/icons/cartIcon'
import { cartStore } from '@/store/cartStore'
import { useCartAutoSync } from '@/lib/queries/useCart'
import { CartTabs } from '../cart/cartTabs'
import Spots from '../spots/spots'
import { useSellCartAutoSync } from '@/lib/queries/useSellCart'
import { sellCartStore } from '@/store/sellCartStore'
import { useGetSession } from '@/lib/queries/useAuth'

export default function Shell() {
  const pathname = usePathname()
  const { user } = useGetSession()
  const [isDrawerActive, setIsDrawerActive] = useState(false)
  const [isCartActive, setIsCartActive] = useState(false)
  const items = cartStore((state) => state.items.length)
  const sellItems = sellCartStore((state) => state.items.length)

  useSellCartAutoSync()
  useCartAutoSync()

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
    {
      key: 3,
      label: 'ADMIN',
      src: '/admin',
      className: pathname === '/admin' ? 'text-primary' : 'text-neutral-400',
      hidden: user?.role !== 'admin',
    },
  ]

  return (
    <>
      {/* Navbar */}
      <div className="sticky top-0 z-50 mb-6 shadow-lg">
        <Spots />
        <nav className="bg-card">
          <div className="flex items-center justify-between w-full p-4 sm:px-32">
            <div className="flex items-center gap-4">
              {/* Logo */}
              <Link className="px-0" href={'/'}>
                <Logo />
              </Link>

              {/* Title */}
              <div className="flex items-end">
                <Link href={'/'}>
                  <span className="text-base sm:text-lg xl:text-xl text-neutral-900 sm:font-semibold sm:tracking-wide lg:tracking-widest">
                    Dorado Metals Exchange
                  </span>
                </Link>

                {/* Desktop Navbar Links */}
                <div className="hidden lg:flex text-base items-center font-semibold tracking-wide pl-32 gap-8">
                  {menuItems
                    .filter((item) => !item.hidden)
                    .map((item) => (
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

                {user ? <ProfileMenu /> : <SignInButton />}
              </div>
            </div>

            {/* Mobile Sidebar and Menu*/}
            <div className="lg:hidden flex items-end ml-auto gap-4">
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
