'use client'

import Drawer from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { SignIn, SignOut, User, List } from "@phosphor-icons/react"
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { ThemeSwitcher } from '../theme/theme-switcher'
import { useSignOut } from '@/lib/queries/useAuth'
import { useUser } from '@/lib/authClient'
import { useDrawerStore } from '@/store/drawerStore'
import getPrimaryIconStroke from '@/utils/getPrimaryIconStroke'

export default function Sidebar() {
  const { user } = useUser()
  const router = useRouter()
  const pathname = usePathname()
  const signOutMutation = useSignOut()

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
      className: pathname === '/buy' ? 'text-primary-gradient' : 'text-neutral-500 hover-text-primary-gradient',
    },
    {
      key: 2,
      label: 'Sell to Us',
      src: '/sell',
      className: pathname === '/sell' ? 'text-primary-gradient' : 'text-neutral-500 hover-text-primary-gradient',
    },
    {
      key: 3,
      label: 'Admin',
      src: '/admin',
      className: pathname === '/admin' ? 'text-primary-gradient' : 'text-neutral-500 hover-text-primary-gradient',
      hidden: user?.role !== 'admin',
    },
  ]

  const drawerContent = (
    <div className="w-full flex-col">
      {/* Top buttons */}
      <div className="flex items-center p-10 gap-5 justify-center">
        <div className="flex flex-col items-center">
          <ThemeSwitcher />
        </div>

        <div className="flex flex-col items-center">
          <Button
            variant="outline"
            onClick={() => {
              router.push('/account')
              closeDrawer()
            }}
            className="w-16 h-16 flex flex-col items-center justify-center rounded-lg bg-highest raised-off-page"
          >
            <User size={20} color={getPrimaryIconStroke()} />
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
            className="w-16 h-16 flex flex-col items-center justify-center rounded-lg bg-highest raised-off-page"
          >
            <List size={20} color={getPrimaryIconStroke()} />
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
              className="w-16 h-16 flex flex-col items-center justify-center rounded-lg bg-highest raised-off-page"
            >
              <SignOut size={20} color={getPrimaryIconStroke()} />
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
              className="w-16 h-16 flex flex-col items-center justify-center rounded-lg bg-highest raised-off-page"
            >
              <SignIn size={20} color={getPrimaryIconStroke()} />
              <div className="text-sm text-primary-gradient">Sign In</div>
            </Button>
          </div>
        )}
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
                <Link
                  href={item.src}
                  className={item.className}
                  onClick={closeDrawer}
                >
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
      <div className="w-screen h-full bg-card border-t-1 border-neutral-200">
        {drawerContent}
      </div>
    </Drawer>
  )
}
