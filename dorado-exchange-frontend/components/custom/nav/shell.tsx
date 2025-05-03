'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useDrawerStore } from '@/store/drawerStore'
import { cartStore } from '@/store/cartStore'
import { sellCartStore } from '@/store/sellCartStore'
import { useCartAutoSync } from '@/lib/queries/useCart'
import { useSellCartAutoSync } from '@/lib/queries/useSellCart'
import { useUser } from '@/lib/authClient'

import { DesktopLogo, Logo } from '../../icons/logo'
import { Button } from '@/components/ui/button'
import { MenuIcon } from '@/components/icons/navIcon'
import { CartIcon } from '@/components/icons/cartIcon'
import { CartTabs } from '../cart/cartTabs'
import ProfileMenu from './profileMenu'
import SignInButton from '../auth/signInButton'
import Spots from '../spots/spots'
import Sidebar from './sidebar'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

export default function Shell() {
  const pathname = usePathname()
  const { user } = useUser()

  const { activeDrawer, openDrawer, closeDrawer } = useDrawerStore()
  const isAnyDrawerOpen = !!activeDrawer

  const items =
    cartStore((state) => state.items.length) + sellCartStore((state) => state.items.length)

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
      className: pathname === '/buy' ? 'text-primary' : 'text-neutral-500',
    },
    {
      key: 2,
      label: 'SELL',
      src: '/sell',
      className: pathname === '/sell' ? 'text-primary' : 'text-neutral-500',
    },
    {
      key: 3,
      label: 'ADMIN',
      src: '/admin',
      className: pathname === '/admin' ? 'text-primary' : 'text-neutral-500',
      hidden: user?.role !== 'admin',
    },
  ]

  return (
    <div className="z-50 bg-card raised-off-page">
      <Spots />

      <nav>
        <div className="hidden lg:flex p-4 pt-1 px-20">
          <div className="flex items-center gap-2 -mt-4">
            <Link href="/" className="px-0">
              <DesktopLogo />
            </Link>

            <div className="flex items-end">
              <Link href="/">
                <span className="text-lg text-neutral-900 font-medium tracking-widest">
                  Dorado Metals Exchange
                </span>
              </Link>

              <div className="flex text-base items-center font-semibold tracking-wide pl-32 gap-8">
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
          <div className="hidden lg:flex items-center gap-2 ml-auto">
            <Button className="px-0 relative" variant="ghost" onClick={() => openDrawer('cart')}>
              <CartIcon size={24} isOpen={activeDrawer === 'cart'} className="text-neutral-900" />
              {items > 0 && (
                <div className="absolute -top-0 -right-1 h-4 w-4 flex overflow-hidden rounded-full bg-primary ">
                  <div className="flex flex-1 items-center text-white justify-center text-[10px]">
                    {items}
                  </div>
                </div>
              )}
            </Button>

            {user ? <ProfileMenu /> : <SignInButton />}
          </div>
        </div>

        <div className="flex lg:hidden p-4 pt-1 px-5">
          <div className="flex items-center gap-2">
            <Link href="/" className="px-0">
              <Logo />
            </Link>

            <div className="flex items-end">
              <Link href="/">
                <span className="text-lg text-neutral-900 tracking-wide">
                  Dorado Metals Exchange
                </span>
              </Link>
            </div>
          </div>
          <div className="lg:hidden flex items-center ml-auto gap-2">
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
                <CartIcon size={20} isOpen={false} className="text-neutral-900 hover:bg-card" />
                {items > 0 && (
                <div className="absolute -top-0 -right-1 h-4 w-4 flex overflow-hidden rounded-full bg-primary ">
                  <div className="flex flex-1 items-center text-white justify-center text-[10px]">
                    {items}
                  </div>
                </div>
              )}
              </motion.div>
            </Button>

            <Button
              className="p-0 hover:bg-card"
              variant="ghost"
              onClick={() => {
                if (isAnyDrawerOpen) {
                  closeDrawer()
                } else {
                  openDrawer('sidebar')
                }
              }}
            >
              <MenuIcon size={24} isOpen={isAnyDrawerOpen} className="p-0 text-neutral-900 mt-1" />
            </Button>
          </div>
        </div>

        <Sidebar />
        <CartTabs />
      </nav>
    </div>
  )
}
