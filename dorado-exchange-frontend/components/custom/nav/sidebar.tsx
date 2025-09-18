'use client'

import Drawer from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import { UserIcon, ListIcon, SignOutIcon, SignInIcon, SwapIcon } from '@phosphor-icons/react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { ThemeSwitcher } from '../theme/theme-switcher'
import { useSignOut } from '@/lib/queries/useAuth'
import { useDrawerStore } from '@/store/drawerStore'
import getPrimaryIconStroke from '@/utils/getPrimaryIconStroke'
import { useUser } from '@/lib/authClient'
import { useSpotTypeStore } from '@/store/spotStore'
import { protectedRoutes } from '@/types/routes'

export default function Sidebar() {
  const { user } = useUser()
  const router = useRouter()
  const pathname = usePathname()
  const signOutMutation = useSignOut()

  const { type, toggleType } = useSpotTypeStore()
  const { activeDrawer, closeDrawer } = useDrawerStore()
  const isDrawerOpen = activeDrawer === 'sidebar'

  useEffect(() => {
    closeDrawer()
  }, [pathname, closeDrawer])

  const menuItems = Object.entries(protectedRoutes)
    .filter(([_, route]) => route.mobileDisplay)
    .filter(([_, route]) => route.roles.length === 0 || route.roles?.includes(user?.role ?? ''))
    .map(([key, route]) => ({
      key,
      href: route.path,
      label: route.mobileLabel,
    }))

  const drawerContent = (
    <div className="w-full flex-col">
      {/* Top buttons */}
      <div className="flex flex-col items-center justify-center gap-3 p-10">
        <div className="flex items-center gap-5 justify-center">
          <div className="flex flex-col items-center">
            <Button
              variant="outline"
              onClick={() => {
                router.push('/account')
                closeDrawer()
              }}
              className="w-18 h-16 flex flex-col items-center justify-center rounded-lg bg-card raised-off-page"
            >
              <UserIcon size={24} color={getPrimaryIconStroke()} />
              <div className="text-sm text-primary-gradient">Account</div>
            </Button>
          </div>

          <div className="flex flex-col items-center">
            <Button
              variant="outline"
              onClick={() => {
                router.push('/orders')
                closeDrawer()
              }}
              className="w-18 h-16 flex flex-col items-center justify-center rounded-lg bg-card raised-off-page"
            >
              <ListIcon size={24} color={getPrimaryIconStroke()} />
              <div className="text-sm text-primary-gradient">Orders</div>
            </Button>
          </div>

          {user ? (
            <div className="flex flex-col items-center">
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await signOutMutation.mutateAsync()
                    closeDrawer()
                  } catch (err) {
                    console.error('Sign out failed:', err)
                  }
                }}
                disabled={signOutMutation.isPending}
                className="w-18 h-16 flex flex-col items-center justify-center rounded-lg bg-card raised-off-page"
              >
                <SignOutIcon size={24} color={getPrimaryIconStroke()} />
                <div className="text-sm text-primary-gradient">Sign Out</div>
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <Button
                variant="outline"
                onClick={() => {
                  router.push('/authentication?tab=sign-in')
                  closeDrawer()
                }}
                className="w-18 h-16 flex flex-col items-center justify-center rounded-lg bg-card raised-off-page"
              >
                <SignInIcon size={24} color={getPrimaryIconStroke()} />
                <div className="text-sm text-primary-gradient">Sign In</div>
              </Button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-5 justify-center">
          <div className="flex flex-col items-center">
            <ThemeSwitcher />
          </div>
          <div className="flex flex-col items-center">
            <Button
              variant="outline"
              onClick={() => {
                toggleType()
              }}
              className="w-18 h-16 flex flex-col items-center justify-center rounded-lg bg-card raised-off-page"
            >
              <SwapIcon size={24} color={getPrimaryIconStroke()} />
              <div className="text-sm text-primary-gradient">
                {type === 'Bid' ? 'Ask' : 'Bid'} Spots
              </div>
            </Button>
          </div>
        </div>
      </div>

      {/* Separator */}
      <div className="flex w-full justify-center items-center pb-6 px-8">
        <div className="flex-grow primary-gradient h-[1px]" />
      </div>

      {/* Menu items */}
      <nav aria-label="Primary site navigation" className="flex-col items-center pb-5">
        <ul className="flex-col p-5 gap-3">
          {menuItems.map((item) => {
            const isActive = pathname === item.href
            const linkClasses = isActive
              ? 'text-primary-gradient'
              : 'text-neutral-200 dark:text-neutral-800  hover-text-primary-gradient'
            return (
              <li className="flex-col items-center pb-5 text-xl" key={item.key}>
                <div className="flex items-center justify-center">
                  <Link href={item.href} className={linkClasses}>
                    {item.label}
                  </Link>
                </div>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )

  return (
    <Drawer
      open={isDrawerOpen}
      setOpen={closeDrawer}
      className="bg-neutral-800/50 dark:bg-neutral-200/50 !backdrop-blur-sm border-t-1 border-border"
    >
      {drawerContent}
    </Drawer>
  )
}
