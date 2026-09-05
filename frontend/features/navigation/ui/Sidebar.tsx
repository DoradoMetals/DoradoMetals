'use client'

import { Button, Drawer, Link as DsLink } from '@dorado/components'
import { User, ListIcon, LogOut, LogIn, ArrowLeftRight } from '@dorado/icons'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useSignOut } from '@/features/auth/queries'
import { useDrawerStore } from '@/shared/store/drawerStore'
import { useUser } from '@/features/auth/authClient'
import { useSpotTypeStore } from '@/shared/store/spotStore'
import { protectedRoutes } from '@/features/routes/types'

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
            <Button variant="tertiary" className="h-18 w-20 flex-col gap-1"
              onClick={() => {
                router.push('/account?tab=details')
                closeDrawer()
              }}>
              <User />
              <small>Account</small>
            </Button>
          </div>

          <div className="flex flex-col items-center">
            <Button variant="tertiary" className="h-18 w-20 flex-col gap-1"
              onClick={() => {
                router.push('/account?tab=sold')
                closeDrawer()
              }}>
              <ListIcon />
              <small>Orders</small>
            </Button>
          </div>

          {user ? (
            <div className="flex flex-col items-center">
              <Button variant="tertiary" className="h-18 w-20 flex-col gap-1"
                onClick={async () => {
                  try {
                    await signOutMutation.mutateAsync()
                    closeDrawer()
                  } catch (err) {
                    console.error('Sign out failed:', err)
                  }
                }}
                disabled={signOutMutation.isPending}>
              <LogOut />
              <small>Sign Out</small>
            </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <Button variant="tertiary" className="h-18 w-20 flex-col gap-1"
                onClick={() => {
                  router.push('/authentication?tab=sign-in')
                  closeDrawer()
                }}>
              <LogIn />
              <small>Sign In</small>
            </Button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-5 justify-center">
          <div className="flex flex-col items-center">
            <Button variant="tertiary" className="h-18 w-20 flex-col gap-1"
              onClick={() => {
                toggleType()
              }}>
              <ArrowLeftRight />
              <small>{`${type === 'Bid' ? 'Ask' : 'Bid'} Spots`}</small>
            </Button>
          </div>
        </div>
      </div>

      <div className="flex w-full justify-center items-center pb-6 px-8">
        <hr className="flex-grow" />
      </div>

      <nav aria-label="Primary site navigation" className="flex-col items-center pb-5">
        <ul className="flex-col p-5 gap-3">
          {menuItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <li className="flex-col items-center pb-5" key={item.key}>
                <div className="flex items-center justify-center">
                  <DsLink asChild variant="nav" active={isActive}>
                    <Link href={item.href}>{item.label}</Link>
                  </DsLink>
                </div>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )

  return (
    <Drawer label="Navigation" open={isDrawerOpen} setOpen={closeDrawer}>
      {drawerContent}
    </Drawer>
  )
}
