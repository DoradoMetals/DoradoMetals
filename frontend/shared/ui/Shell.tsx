'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useDrawerStore } from '@/shared/store/drawerStore'
import { useBasket } from '@/shared/hooks/checkout/items/queries'

import { Badge, Button, Header, Link as DsLink } from '@dorado/components'
import { CheckoutIcon } from '@/shared/ui/CheckoutIcon'

import { useUser } from '@/shared/hooks/auth/authClient'
import { protectedRoutes } from '@/shared/types/routes'
import Spots from '@/shared/ui/Spots'
import { Logo } from '@/shared/ui/Logo'
import AccountMenu from '@/shared/ui/ProfileMenu'
import Sidebar from '@/shared/ui/Sidebar'
import { CheckoutDrawer } from '@/shared/ui/CheckoutDrawer'

export default function Shell() {
  const pathname = usePathname()
  const { user } = useUser()

  const { activeDrawer, openDrawer, closeDrawer } = useDrawerStore()
  const menuOpen = activeDrawer === 'sidebar'
  const items = useBasket('sale').length + useBasket('purchase').length

  const menuItems = Object.entries(protectedRoutes)
    .filter(([_, route]) => route.desktopDisplay)
    .filter(([_, route]) => route.roles.length === 0 || route.roles.includes(user?.role ?? ''))
    .map(([key, route]) => ({
      key,
      href: route.path,
      label: route.desktopLabel,
    }))

  return (
    <>
      <Spots />

      <Header
        className="sticky top-0 z-50"
        brand={
          <Link href="/" className="px-0">
            <Logo size={118} height={26} />
          </Link>
        }
        nav={menuItems.map((item) => (
          <DsLink key={item.key} asChild variant="nav" active={pathname === item.href}>
            <Link href={item.href}>{item.label}</Link>
          </DsLink>
        ))}
        trailing={
          <div className="flex items-center gap-4">
            <Button
              className="relative"
              variant="tertiary"
              size="icon"
              aria-label="Open checkout"
              onClick={() => openDrawer('checkout')}
            >
              <CheckoutIcon isOpen={activeDrawer === 'checkout'} />
              {items > 0 && (
                <Badge
                  variant="solid"
                  intent="neutral"
                  size="sm"
                  className="absolute top-0 -right-1"
                >
                  {items}
                </Badge>
              )}
            </Button>
            <AccountMenu />
          </div>
        }
        drawerOpen={menuOpen}
        onDrawerToggle={() => (menuOpen ? closeDrawer() : openDrawer('sidebar'))}
      />

      <Sidebar />
      <CheckoutDrawer />
    </>
  )
}
