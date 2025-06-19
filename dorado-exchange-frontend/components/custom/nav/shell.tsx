'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useDrawerStore } from '@/store/drawerStore'
import { cartStore } from '@/store/cartStore'
import { sellCartStore } from '@/store/sellCartStore'
import { useCartAutoSync } from '@/lib/queries/useCart'
import { useSellCartAutoSync } from '@/lib/queries/useSellCart'

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
import { useUser } from '@/lib/authClient'

export default function Shell() {
  const pathname = usePathname()
  const { user} = useUser()

  const { activeDrawer, openDrawer, closeDrawer } = useDrawerStore()
  const isAnyDrawerOpen = !!activeDrawer
  const items =
    cartStore((state) => state.items.length) + sellCartStore((state) => state.items.length)

  useSellCartAutoSync()
  useCartAutoSync()

  const menuItems = [
    {
      key: 1,
      label: 'BUY',
      src: '/buy',
      className:
        pathname === '/buy'
          ? 'text-primary-gradient'
          : 'text-neutral-500 hover-text-primary-gradient',
    },
    {
      key: 2,
      label: 'SELL',
      src: '/sell',
      className:
        pathname === '/sell'
          ? 'text-primary-gradient'
          : 'text-neutral-500 hover-text-primary-gradient',
    },
    {
      key: 3,
      label: 'ADMIN',
      src: '/admin',
      className:
        pathname === '/admin'
          ? 'text-primary-gradient'
          : 'text-neutral-500 hover-text-primary-gradient',
      hidden: user?.role !== 'admin',
    },
  ]

  return (
    <div
      className={cn(
        'z-60 sticky top-0 bg-card h-24',
        isAnyDrawerOpen ? 'shadow-none' : 'raised-off-page'
      )}
    >
      <Spots />

      <nav>
        <div className="hidden lg:flex p-4 pt-0 px-20 mt-2">
          <div className="flex items-center gap-2 -mt-4">
            <Link href="/" className="px-0">
              <DesktopLogo />
            </Link>

            <div className="flex items-end">
              <Link href="/">
                <h1 className="text-lg text-neutral-700 font-medium tracking-wide">
                  Dorado Metals Exchange
                </h1>
              </Link>

              <div className="flex text-base items-center tracking-wide pl-32 gap-8">
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
                <div className="absolute -top-0 -right-1 h-4 w-4 flex overflow-hidden rounded-full primary-gradient ">
                  <div className="flex flex-1 items-center text-white justify-center text-[10px]">
                    {items}
                  </div>
                </div>
              )}
            </Button>

            {user ? <ProfileMenu /> : <SignInButton />}
          </div>
        </div>

        <div className="flex lg:hidden py-4 pt-0 px-3">
          <div className="flex items-center gap-2">
            <Link href="/" className="px-0">
              <Logo />
            </Link>

            <div className="flex items-end">
              <Link href="/">
                <h1 className="text-base text-neutral-900 font-medium">Dorado Metals Exchange</h1>
              </Link>
            </div>
          </div>
          <div className="lg:hidden flex items-center ml-auto gap-2">
            <Button
              className="px-0 hover:bg-card relative"
              variant="ghost"
              onClick={() => openDrawer('cart')}
              disabled={isAnyDrawerOpen}
            >
              <motion.div
                initial={{ opacity: 1 }}
                animate={{ opacity: isAnyDrawerOpen ? 0 : 1 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                className="relative flex items-center justify-center will-change-transform"
              >
                <CartIcon size={20} isOpen={false} className="text-neutral-900 hover:bg-card" />
                {items > 0 && (
                  <div className="absolute -top-0 -right-1 h-4 w-4 flex overflow-hidden rounded-full primary-gradient ">
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
