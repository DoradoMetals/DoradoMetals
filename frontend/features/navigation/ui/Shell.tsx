'use client'

import Link from 'next/link'
import NavLink from '@/shared/ui/NavLink'
import { usePathname } from 'next/navigation'
import { useDrawerStore } from '@/shared/store/drawerStore'
import { useCheckoutItems } from '@/shared/store/checkoutItemsStore'

import { Button } from '@dorado/components'
import { MenuIcon } from '@/features/navigation/ui/NavIcon'
import { CheckoutIcon } from '@/features/checkout/items/ui/CheckoutIcon'

import { motion } from 'framer-motion'
import { useUser } from '@/features/auth/authClient'
import { protectedRoutes } from '@/features/routes/types'
import CountBadge from '@/shared/ui/CountBadge'
import Spots from '@/features/spots/ui/Spots'
import { Logo } from '@/features/navigation/ui/Logo'
import AccountMenu from '@/features/navigation/ui/ProfileMenu'
import Sidebar from '@/features/navigation/ui/Sidebar'
import { CheckoutDrawer } from '@/features/checkout/items/ui/CheckoutDrawer'

export default function Shell() {
  const pathname = usePathname()
  const { user } = useUser()

  const { activeDrawer, openDrawer, closeDrawer } = useDrawerStore()
  const isAnyDrawerOpen = !!activeDrawer
  const items =
    useCheckoutItems((state) => state.sale.length) + useCheckoutItems((state) => state.purchase.length)

  const menuItems = Object.entries(protectedRoutes)
    .filter(([_, route]) => route.desktopDisplay)
    .filter(([_, route]) => route.roles.length === 0 || route.roles.includes(user?.role ?? ''))
    .map(([key, route]) => ({
      key,
      href: route.path,
      label: route.desktopLabel,
    }))

  return (
    <header className="z-60 sticky top-0 bg-highest flex flex-col items-center justify-center">
      <div className="flex items-start justify-between w-full sticky">
        <Spots />
      </div>

      <div className="hidden lg:flex py-3 max-w-7xl justify-center items-center w-full">
        <div className="flex items-center justify-between w-full">
          <div className="flex w-1/3 justify-start">
            <Link href="/" className="px-0">
              <Logo size={312} />
            </Link>
          </div>

          <nav aria-label="Primary site navigation" className="hidden lg:flex w-1/3 justify-center">
            {/* `uppercase tracking-widest` moved off this <ul>: it was the nav
                typography inherited by descendants, which is why the mobile
                Sidebar silently disagreed with it. <NavLink> owns it now via
                `.nav-link`. */}
            <ul className="flex items-end gap-8">
              {menuItems.map((item) => {
                const isActive = pathname === item.href
                return (
                  <li key={item.key}>
                    <NavLink href={item.href} active={isActive}>
                      {item.label}
                    </NavLink>
                  </li>
                )
              })}
            </ul>
          </nav>

          <div className="flex gap-4 items-center w-1/3 justify-end">
            <Button
              className="relative"
              variant="tertiary"
              size="icon"
              aria-label="Open checkout"
              onClick={() => openDrawer('checkout')}
            >
              <CheckoutIcon size={28} isOpen={activeDrawer === 'checkout'} />
              {items > 0 && (
                <CountBadge size="sm" className="absolute -top-0 -right-1">
                  {items}
                </CountBadge>
              )}
            </Button>

            <div className="flex items-center gap-5">
              <AccountMenu />
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between w-full lg:hidden py-2 px-3">
        <div className="flex items-center gap-2">
          <Link href="/" className="px-0">
            <Logo />
          </Link>
        </div>
        <div className="lg:hidden flex items-center gap-2">
          <Button
            className="relative"
            variant="tertiary"
            size="icon"
            aria-label="Open checkout"
            onClick={() => openDrawer('checkout')}
            disabled={isAnyDrawerOpen}
          >
            <motion.div
              initial={{ opacity: 1 }}
              animate={{ opacity: isAnyDrawerOpen ? 0 : 1 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="relative flex items-center justify-center will-change-transform"
            >
              <CheckoutIcon size={28} isOpen={false} />
              {items > 0 && (
                <CountBadge size="sm" className="absolute -top-0 -right-1">
                  {items}
                </CountBadge>
              )}
            </motion.div>
          </Button>

          <Button
            variant="tertiary"
            size="icon"
            aria-label={isAnyDrawerOpen ? 'Close menu' : 'Open menu'}
            onClick={() => {
              if (isAnyDrawerOpen) {
                closeDrawer()
              } else {
                openDrawer('sidebar')
              }
            }}
          >
            <MenuIcon size={28} isOpen={isAnyDrawerOpen} className="mt-1" />
          </Button>
        </div>
      </div>

      <Sidebar />
      <CheckoutDrawer />
    </header>
  )
}
