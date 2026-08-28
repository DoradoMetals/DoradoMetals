'use client'
import { useEffect, useState } from 'react'
import {
  Popover,
  PopoverBody,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
  PopoverFooter,
} from '@/shared/ui/base/popover'
import { Button } from '@/shared/ui/base/button'
import { Avatar } from '@/shared/ui/base/avatar'
import {
  ListIcon,
  LockIcon,
  SignInIcon,
  UserCircleIcon,
  UserIcon,
  UserPlusIcon,
} from '@phosphor-icons/react'
import { useGetSession, useSignOut } from '@/features/auth/queries'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

export default function AccountMenu() {
  const { user } = useGetSession()
  const router = useRouter()
  const pathname = usePathname()

  const signOutMutation = useSignOut()

  const [open, setOpen] = useState(false)
  useEffect(() => setOpen(false), [pathname])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="tertiary" size="icon" aria-label="Account menu">
          <Avatar className="flex items-center">
            <UserIcon size={28} />
          </Avatar>
        </Button>
      </PopoverTrigger>
      {user ? (
        <PopoverContent className="w-fit max-w-2xs z-90 p-2 space-y-1">
          <PopoverHeader>
            <div className="flex flex-col items-center space-x-3">
              <PopoverTitle>{user?.name}</PopoverTitle>
              <PopoverDescription>{user?.email}</PopoverDescription>
            </div>
          </PopoverHeader>
          <hr />
          <PopoverBody className="flex justify-center">
            <div className="flex flex-col items-start gap-1 w-full">
              <Button
                variant="tertiary"
                size="sm"
                className="w-full justify-start"
                onClick={() => router.push('/account?tab=details')}
              >
                <UserCircleIcon size={24} />
                <span className="text-left">View Account</span>
              </Button>

              <Button
                variant="tertiary"
                size="sm"
                className="w-full justify-start"
                onClick={() => router.push('/account?tab=sold')}
              >
                <ListIcon size={24} />
                <span className="text-left">View Orders</span>
              </Button>

              <Button
                variant="tertiary"
                size="sm"
                className="w-full justify-start"
                onClick={() => router.push('/account?tab=security')}
              >
                <LockIcon size={24} />
                <span className="text-left">Security</span>
              </Button>
            </div>
          </PopoverBody>
          <hr />
          <PopoverFooter>
            <Button
              variant="secondary"
              intent="danger"
              className="flex items-center gap-1 w-full"
              size="sm"
              onClick={async () => {
                try {
                  await signOutMutation.mutateAsync()
                } catch (err) {
                  console.error('Sign out failed:', err)
                }
              }}
              disabled={signOutMutation.isPending}
            >
              {signOutMutation.isPending ? 'Signing Out...' : 'Sign Out'}
            </Button>
          </PopoverFooter>
        </PopoverContent>
      ) : (
        <PopoverContent className="w-fit z-90">
          <PopoverBody className="space-y-3 p-4">
            <Link className="flex gap-3 items-center" href={'/authentication?tab=sign-in'}>
              <SignInIcon size={24} />
              Sign In
            </Link>
            <Link className="flex gap-3 items-center" href={'/authentication?tab=sign-up'}>
              <UserPlusIcon size={24} />
              Register
            </Link>
          </PopoverBody>
        </PopoverContent>
      )}
    </Popover>
  )
}
