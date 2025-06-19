'use client'

import Drawer from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import {
  SignIn,
  SignOut,
  User,
  List,
  UserIcon,
  ListIcon,
  SignOutIcon,
  SignInIcon,
  SwapIcon,
} from '@phosphor-icons/react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { ThemeSwitcher } from '../theme/theme-switcher'
import { useSignOut } from '@/lib/queries/useAuth'
import { useDrawerStore } from '@/store/drawerStore'
import getPrimaryIconStroke from '@/utils/getPrimaryIconStroke'
import { useUser } from '@/lib/authClient'
import { useSpotTypeStore } from '@/store/spotStore'

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

  const menuItems = [
    {
      key: 1,
      label: 'Buy from Us',
      src: '/buy',
      className:
        pathname === '/buy' ? 'text-primary-gradient' : 'text-white hover-text-primary-gradient',
    },
    {
      key: 2,
      label: 'Sell to Us',
      src: '/sell',
      className:
        pathname === '/sell' ? 'text-primary-gradient' : 'text-white hover-text-primary-gradient',
    },
    {
      key: 3,
      label: 'Admin',
      src: '/admin',
      className:
        pathname === '/admin' ? 'text-primary-gradient' : 'text-white hover-text-primary-gradient',
      hidden: user?.role !== 'admin',
    },
  ]

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
              className="w-16 h-16 flex flex-col items-center justify-center rounded-lg bg-card raised-off-page"
            >
              <UserIcon size={20} color={getPrimaryIconStroke()} />
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
              className="w-16 h-16 flex flex-col items-center justify-center rounded-lg bg-card raised-off-page"
            >
              <ListIcon size={20} color={getPrimaryIconStroke()} />
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
                className="w-16 h-16 flex flex-col items-center justify-center rounded-lg bg-card raised-off-page"
              >
                <SignOutIcon size={20} color={getPrimaryIconStroke()} />
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
                className="w-16 h-16 flex flex-col items-center justify-center rounded-lg bg-card raised-off-page"
              >
                <SignInIcon size={20} color={getPrimaryIconStroke()} />
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
              className="w-16 h-16 flex flex-col items-center justify-center rounded-lg bg-card raised-off-page"
            >
              <SwapIcon size={20} color={getPrimaryIconStroke()} />
              <div className="text-sm text-primary-gradient">{type === 'Bid' ? 'Ask' : 'Bid'}</div>
            </Button>
          </div>
        </div>
      </div>

      {/* Separator */}
      <div className="flex w-full justify-center items-center pb-6 px-8">
        <div className="flex-grow primary-gradient h-[1px]" />
      </div>

      {/* Menu items */}
      <div className="flex-col text-lg p-5 gap-3">
        {menuItems
          .filter((item) => !item.hidden)
          .map((item) => (
            <div className="flex-col items-center pb-5" key={item.key}>
              <div className="flex items-center justify-center pb-2 text-xl">
                <Link href={item.src} className={item.className} onClick={closeDrawer}>
                  {item.label}
                </Link>
              </div>
            </div>
          ))}
      </div>
    </div>
  )

  return (
    <Drawer open={isDrawerOpen} setOpen={closeDrawer}>
      <div className="w-screen h-full bg-neutral-800/50 dark:bg-neutral-200/50 backdrop-blur-xl border-t-1 border-border">
        {drawerContent}
      </div>
    </Drawer>
  )
}
