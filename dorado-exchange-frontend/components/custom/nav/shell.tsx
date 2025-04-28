'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useDrawerStore } from '@/store/drawerStore'
import { cartStore } from '@/store/cartStore'
import { sellCartStore } from '@/store/sellCartStore'
import { useCartAutoSync } from '@/lib/queries/useCart'
import { useSellCartAutoSync } from '@/lib/queries/useSellCart'
import { useUser } from '@/lib/authClient'

import { Logo } from '../../icons/logo'
import { Button } from '@/components/ui/button'
import { MenuIcon } from '@/components/icons/navIcon'
import { CartIcon } from '@/components/icons/cartIcon'
import { CartTabs } from '../cart/cartTabs'
import ProfileMenu from './profileMenu'
import SignInButton from '../auth/signInButton'
import Spots from '../spots/spots'
import Sidebar from './sidebar'

import { motion } from 'framer-motion'

export default function Shell() {
  const pathname = usePathname()
  const { user } = useUser()

  const { activeDrawer, openDrawer, closeDrawer } = useDrawerStore()
  const isAnyDrawerOpen = !!activeDrawer

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
    <div className="sticky top-0 z-50 mb-6 shadow-sm">
      <Spots />
      <nav className="bg-card">
        <div className="flex items-center justify-between w-full p-4 sm:px-10 md:px-20">
          <div className="flex items-center gap-4">
            <Link href="/" className="px-0">
              <Logo />
            </Link>

            <div className="flex items-end">
              <Link href="/">
                <span className="text-base sm:text-lg xl:text-xl text-neutral-900 sm:font-semibold sm:tracking-wide lg:tracking-widest">
                  Dorado Metals Exchange
                </span>
              </Link>

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

          <div className="hidden lg:flex items-center gap-8">
            <Button
              className="px-0 hover:bg-card relative"
              variant="ghost"
              onClick={() => openDrawer('cart')}
            >
              <CartIcon
                size={24}
                isOpen={activeDrawer === 'cart'}
                className="text-neutral-700 hover:bg-card"
              />
              {(items > 0 || sellItems > 0) && (
                <div className="absolute -top-1 -right-1 flex overflow-hidden rounded-full">
                  {items > 0 && sellItems > 0 ? (
                    <>
                      <div className="flex items-center bg-secondary text-white justify-center text-[10px] px-[3px] py-[3px] flex-1 border-t border-b border-l border-r rounded-l-full border-secondary text-secondary bg-card">
                        {items}
                      </div>
                      <div className="flex items-center bg-primary text-white justify-center text-[10px] px-[3px] py-[3px] flex-1 border-t border-b border-l border-r rounded-r-full border-primary text-primary bg-card">
                        {sellItems}
                      </div>
                    </>
                  ) : items > 0 ? (
                    <div className="flex items-center bg-secondary text-white justify-center text-[10px] px-[8px] py-[3px] flex-1 border-t border-b border-l border-r rounded-full border-secondary text-secondary bg-card">
                      {items}
                    </div>
                  ) : (
                    <div className="flex items-center bg-primary text-white justify-center text-[10px] px-[8px] py-[3px] flex-1 border-t border-b border-l border-r rounded-full border-primary text-primary bg-card">
                      {sellItems}
                    </div>
                  )}
                </div>
              )}
            </Button>

            {user ? <ProfileMenu /> : <SignInButton />}
          </div>

          <div className="lg:hidden flex items-center ml-auto gap-1">
            <Button
              className="px-0 hover:bg-card relative"
              variant="ghost"
              onClick={() => openDrawer('cart')}
            >
              <motion.div
                initial={{ opacity: 1 }}
                animate={{ opacity: isAnyDrawerOpen ? 0 : 1 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                className="relative flex items-center justify-center"
              >
                <CartIcon size={20} isOpen={false} className="text-neutral-700 hover:bg-card" />
                {(items > 0 || sellItems > 0) && (
                  <div className="absolute -top-1 -right-1 flex overflow-hidden rounded-full">
                    {items > 0 && sellItems > 0 ? (
                      <>
                        <div className="flex items-center bg-secondary text-white justify-center text-[10px] px-[3px] py-[3px] flex-1 border-t border-b border-l border-r rounded-l-full border-secondary text-secondary bg-card">
                          {items}
                        </div>
                        <div className="flex items-center bg-primary text-white justify-center text-[10px] px-[3px] py-[3px] flex-1 border-t border-b border-l border-r rounded-r-full border-primary text-primary bg-card">
                          {sellItems}
                        </div>
                      </>
                    ) : items > 0 ? (
                      <div className="flex items-center bg-secondary text-white justify-center text-[10px] px-[8px] py-[3px] flex-1 border-t border-b border-l border-r rounded-full border-secondary text-secondary bg-card">
                        {items}
                      </div>
                    ) : (
                      <div className="flex items-center bg-primary text-white justify-center text-[10px] px-[8px] py-[3px] flex-1 border-t border-b border-l border-r rounded-full border-primary text-primary bg-card">
                        {sellItems}
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            </Button>

            <Button
              className="px-0 hover:bg-card"
              variant="ghost"
              onClick={() => {
                if (isAnyDrawerOpen) {
                  closeDrawer()
                } else {
                  openDrawer('sidebar')
                }
              }}
            >
              <MenuIcon size={24} isOpen={isAnyDrawerOpen} className="text-neutral-700 mt-1" />
            </Button>
          </div>
        </div>

        <Sidebar />
        <CartTabs />
      </nav>
    </div>
  )
}
