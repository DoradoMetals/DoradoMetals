'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useDrawerStore } from '@/store/drawerStore'
import { cartStore } from '@/store/cartStore'
import { sellCartStore } from '@/store/sellCartStore'
import { useCartAutoSync } from '@/lib/queries/useCart'
import { useSellCartAutoSync } from '@/lib/queries/useSellCart'

import { Logo } from '../../icons/logo'
import { Button } from '@/components/ui/button'
import { MenuIcon } from '@/components/icons/navIcon'
import { CartIcon } from '@/components/icons/cartIcon'
import { CartTabs } from '../cart/cartTabs'
import Spots from '../spots/spots'
import Sidebar from './sidebar'

import React from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useUser } from '@/lib/authClient'
import { protectedRoutes } from '@/types/routes'
import { useSignOut } from '@/lib/queries/useAuth'
import { MoonStarsIcon, SignInIcon, SignOutIcon, SunIcon, UserIcon } from '@phosphor-icons/react'
import { useTheme } from 'next-themes'
import getPrimaryIconStroke from '@/utils/getPrimaryIconStroke'

export default function Shell() {
  const pathname = usePathname()
  const { user } = useUser()

  const signOutMutation = useSignOut()

  const { activeDrawer, openDrawer, closeDrawer } = useDrawerStore()
  const isAnyDrawerOpen = !!activeDrawer
  const items =
    cartStore((state) => state.items.length) + sellCartStore((state) => state.items.length)

  const { theme, setTheme } = useTheme()

  useSellCartAutoSync()
  useCartAutoSync()

  const menuItems = Object.entries(protectedRoutes)
    .filter(([_, route]) => route.desktopDisplay)
    .filter(([_, route]) => route.roles.length === 0 || route.roles.includes(user?.role ?? ''))
    .map(([key, route]) => ({
      key,
      href: route.path,
      label: route.desktopLabel,
    }))

  return (
    <div
      className={cn(
        'z-60 sticky top-0 bg-card h-24',
        isAnyDrawerOpen ? 'shadow-none' : 'raised-off-page'
      )}
    >
      <div className="flex items-start justify-between w-full w-screen sticky mt-1">
        <Spots />
      </div>

      <div className="hidden lg:flex p-4 pt-0 px-20 mt-2">
        <div className="flex items-center gap-2 -mt-4">
          <Link href="/" className="px-0">
            <Logo size={212} />
          </Link>

          <div className="flex items-end">
            <div className="flex text-base items-center tracking-wide pl-32 gap-8">
              <nav aria-label="Primary site navigation" className="hidden lg:block px-20 pt-2">
                <ul className="flex items-end text-base uppercase tracking-wide gap-8">
                  {menuItems.map((item) => {
                    const isActive = pathname === item.href
                    const linkClasses = isActive
                      ? 'text-primary-gradient'
                      : 'text-neutral-500 hover-text-primary-gradient'
                    return (
                      <li key={item.key}>
                        <Link href={item.href} className={linkClasses}>
                          {item.label}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </nav>
            </div>
          </div>
        </div>

        <div className="hidden lg:flex items-center gap-2 ml-auto">
          <div className="flex gap-4 items-center">
            <Button className="px-0 relative" variant="ghost" onClick={() => openDrawer('cart')}>
              <CartIcon
                size={24}
                isOpen={activeDrawer === 'cart'}
                className="text-neutral-800 hover:text-neutral-900"
              />
              {items > 0 && (
                <div className="absolute -top-0 -right-1 h-4 w-4 flex overflow-hidden rounded-full primary-gradient">
                  <div className="flex flex-1 items-center text-white justify-center text-[10px]">
                    {items}
                  </div>
                </div>
              )}
            </Button>

            <div className="flex items-center gap-5">
              <Button
                variant="ghost"
                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                className="p-0 text-neutral-800"
              >
                {theme === 'light' ? <MoonStarsIcon size={24} /> : <SunIcon size={24} />}
              </Button>
              {user ? (
                <Button
                  variant="ghost"
                  className="p-0 flex gap-1 items-center text-neutral-800"
                  onClick={async () => {
                    try {
                      await signOutMutation.mutateAsync()
                    } catch (err) {
                      console.error('Sign out failed:', err)
                    }
                  }}
                  disabled={signOutMutation.isPending}
                >
                  Sign Out <SignOutIcon size={24} />
                </Button>
              ) : (
                <Link
                  className="p-0 flex gap-1 items-center text-neutral-800"
                  href={'/authentication?tab=sign-in'}
                >
                  Sign In <SignInIcon size={24} />
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex lg:hidden py-4 pt-0 px-3">
        <div className="flex items-center gap-2">
          <Link href="/" className="px-0">
            <Logo />
          </Link>
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
              <CartIcon size={28} isOpen={false} className="text-neutral-900 hover:bg-card" />
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
            <MenuIcon size={28} isOpen={isAnyDrawerOpen} className="p-0 text-neutral-900 mt-1" />
          </Button>
        </div>
      </div>

      <Sidebar />
      <CartTabs />
    </div>
  )
}
