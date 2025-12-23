'use client'

import Drawer from '@/shared/ui/base/drawer'
import { Button } from '@/shared/ui/base/button'
import { UserIcon, ListIcon, SignOutIcon, SignInIcon, SwapIcon } from '@phosphor-icons/react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useSignOut } from '@/features/auth/queries'
import { useDrawerStore } from '@/store/drawerStore'
import { useUser } from '@/features/auth/authClient'
import { useSpotTypeStore } from '@/store/spotStore'
import { protectedRoutes } from '@/types/routes'
import { ThemeSwitcher } from '@/features/navigation/ui/ThemeSwitcher'

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
      <div className="flex flex-col items-center justify-center gap-3 p-10">
        <div className="flex items-center gap-5 justify-center">
          <div className="flex flex-col items-center">
            <Button
              variant="outline"
              onClick={() => {
                router.push('/account?tab=details')
                closeDrawer()
              }}
              className="w-20 h-18 flex flex-col items-center justify-center rounded-lg bg-card raised-off-page"
            >
              <UserIcon size={24} className="text-primary" />
              <div className="text-sm text-primary">Account</div>
            </Button>
          </div>

          <div className="flex flex-col items-center">
            <Button
              variant="outline"
                onClick={() => {
                  router.push('/account?tab=sold')
                  closeDrawer()
                }}
              className="w-20 h-18 flex flex-col items-center justify-center rounded-lg bg-card raised-off-page"
            >
              <ListIcon size={24} className="text-primary" />
              <div className="text-sm text-primary">Orders</div>
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
                className="w-20 h-18 flex flex-col items-center justify-center rounded-lg bg-card raised-off-page"
              >
                <SignOutIcon size={24} className="text-primary" />
                <div className="text-sm text-primary">Sign Out</div>
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
                className="w-20 h-18 flex flex-col items-center justify-center rounded-lg bg-card raised-off-page"
              >
                <SignInIcon size={24} className="text-primary" />
                <div className="text-sm text-primary">Sign In</div>
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
              className="w-20 h-18 flex flex-col items-center justify-center rounded-lg bg-card raised-off-page"
            >
              <SwapIcon size={24} className="text-primary" />
              <div className="text-sm text-primary">{type === 'Bid' ? 'Ask' : 'Bid'} Spots</div>
            </Button>
          </div>
        </div>
      </div>

      <div className="flex w-full justify-center items-center pb-6 px-8">
        <div className="flex-grow bg-primary h-[1px]" />
      </div>

      <nav aria-label="Primary site navigation" className="flex-col items-center pb-5">
        <ul className="flex-col p-5 gap-3">
          {menuItems.map((item) => {
            const isActive = pathname === item.href
            const linkClasses = isActive
              ? 'text-primary'
              : 'text-neutral-200 dark:text-neutral-800  hover:text-primary'
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
