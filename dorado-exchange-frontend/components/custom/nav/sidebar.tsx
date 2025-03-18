'use client'
import Drawer from '@/components/drawers/navDrawer'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { LogIn, User } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Dispatch } from 'react'
import { ThemeSwitcher } from '../theme/theme-switcher'
import { useSignOut } from '@/lib/queries/useAuth'
import { useUserStore } from '@/store/useUserStore'

export default function Sidebar({
  isDrawerActive,
  setIsDrawerActive,
}: {
  isDrawerActive: boolean
  setIsDrawerActive: Dispatch<React.SetStateAction<boolean>>
}) {
  const data = useUserStore()
  const router = useRouter()
  const signOutMutation = useSignOut() // ✅ Use TanStack Mutation

  const pathname = usePathname()
  const menuItems = [
    {
      key: 1,
      label: 'Buy from Us',
      src: '/buy',
      className: pathname === '/buy' ? 'text-primary' : '',
    },
    {
      key: 2,
      label: 'Sell to Us',
      src: '/sell',
      className: pathname === '/sell' ? 'text-primary' : '',
    },
  ]

  const drawerContent = (
    <>
      <div className="w-full flex-col">
        <div className="flex items-center p-10 gap-5 justify-center">
          <div className="flex flex-col items-center">
            <ThemeSwitcher />
          </div>

          <div className="flex flex-col items-center">
            <Button
              variant="outline"
              onClick={() => {
                {
                  router.push('/account'), setIsDrawerActive(false)
                }
              }}
              className="w-16 h-16 flex flex-col items-center justify-center rounded-lg border-1"
            >
              <User size={20} strokeWidth={1}/>
              <div className="text-sm font-light">Account</div>
            </Button>
          </div>

          {data.user ? (
            <div className="flex flex-col items-center">
              <Button
                variant="outline"
                onClick={() => {
                  signOutMutation.mutate(undefined, { onSuccess: () => router.push('/') }),
                    setIsDrawerActive(false)
                }}
                className="w-16 h-16 flex flex-col items-center justify-center rounded-lg border-1"
              >
                <LogIn size={20} strokeWidth={1}/>
                <div className="text-sm font-light">Sign Out</div>
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <Button
                variant="outline"
                onClick={() => {
                  router.push('/authentication?tab=sign-in'), setIsDrawerActive(false)
                }}
                className="w-16 h-16 flex flex-col items-center justify-center rounded-lg border-1"
              >
                <LogIn size={20} strokeWidth={1}/>
                <div className="text-sm font-light">Sign In</div>
              </Button>
            </div>
          )}
        </div>

        <div className="flex w-full justify-center items-center pb-10 px-20">
          <div className="flex-grow">
            <Separator />
          </div>
        </div>

        <div className="flex-col text-lg p-5 gap-3">
          {menuItems.map((item) => (
            <div className="flex-col items-center pb-5" key={item.key}>
              <div className="flex items-center font-light justify-center pb-2 text-xl" key={item.key}>
                <Link
                  className={item.className}
                  key={item.key}
                  href={item.src}
                  onClick={() => setIsDrawerActive(false)}
                >
                  {item.label}
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )

  return (
    <div className="">
      <Drawer open={isDrawerActive} setOpen={setIsDrawerActive}>
        <div className="w-screen h-full bg-background">{drawerContent}</div>
      </Drawer>
    </div>
  )
}
