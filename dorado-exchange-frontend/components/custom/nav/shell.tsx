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

import React, { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useScroll, useMotionValueEvent } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useUser } from '@/lib/authClient'
import { protectedRoutes } from '@/types/routes'
import { MagnifyingGlassIcon, MoonIcon, PhoneIcon, SunIcon, XIcon } from '@phosphor-icons/react'
import { useTheme } from 'next-themes'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Input } from '@/components/ui/input'
import formatPhoneNumber from '@/utils/formatPhoneNumber'
import AccountMenu from './accountMenu'

export default function Shell({
  visible,

}: {
  visible: boolean
}) {
  const pathname = usePathname()
  const { user } = useUser()

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
        'z-60 sticky top-0 bg-highest flex flex-col items-center justify-center',
        isAnyDrawerOpen || visible ? 'shadow-none' : 'raised-off-page'
      )}
    >
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
            <ul className="flex items-end text-xl uppercase font-medium tracking-widest gap-8">
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

          <div className="flex gap-4 items-center w-1/3 justify-end">
            <Button className="px-0 relative" variant="ghost" onClick={() => openDrawer('cart')}>
              <CartIcon
                size={28}
                isOpen={activeDrawer === 'cart'}
                className="text-neutral-700 hover:text-neutral-900"
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
                className="p-0 text-neutral-700 hover:text-neutral-900"
              >
                {theme === 'light' ? <MoonIcon size={28} /> : <SunIcon size={28} />}
              </Button>

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

