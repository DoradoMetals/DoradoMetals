'use client'
import React, { useEffect, useState } from 'react'
import {
  Popover,
  PopoverBody,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
  PopoverFooter,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/avatar'
import {
  ListIcon,
  LockIcon,
  SignInIcon,
  UserCircleIcon,
  UserIcon,
  UserPlusIcon,
} from '@phosphor-icons/react'
import { useGetSession, useSignOut } from '@/lib/queries/useAuth'
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
        <Button variant="ghost" className="p-0">
          <Avatar className="flex items-center">
            <UserIcon size={28} className="text-neutral-700 hover:text-neutral-900" />
          </Avatar>
        </Button>
      </PopoverTrigger>
      {user ? (
        <PopoverContent className="w-fit max-w-2xs z-90 bg-highest rounded-lg p-2 space-y-1 border-border border-1">
          <PopoverHeader className="">
            <div className="flex flex-col items-center space-x-3">
              <PopoverTitle className="text-lg text-neutral-900">{user?.name}</PopoverTitle>
              <PopoverDescription className="text-xs text-neutral-700">
                {user?.email}
              </PopoverDescription>
            </div>
          </PopoverHeader>
          <div className="separator-inset" />
          <PopoverBody className="flex justify-center">
            <div className="flex flex-col items-start gap-1 w-full">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2 p-0 text-neutral-700 hover:text-neutral-900"
                onClick={() => router.push('/account?tab=details')}
              >
                <UserCircleIcon size={24} />
                <span className="text-left">View Account</span>
              </Button>

              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2 p-0 text-neutral-700 hover:text-neutral-900"
                onClick={() => router.push('/account?tab=sold')}
              >
                <ListIcon size={24} />
                <span className="text-left">View Orders</span>
              </Button>

              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2 p-0 text-neutral-700 hover:text-neutral-900"
                onClick={() => router.push('/account?tab=security')}
              >
                <LockIcon size={24} />
                <span className="text-left">Security</span>
              </Button>
            </div>
          </PopoverBody>
          <div className="separator-inset" />
          <PopoverFooter>
            <Button
              className="flex items-center gap-1 w-full bg-highest hover:bg-destructive border-1 border-destructive hover:border-destructive text-destructive hover:text-white"
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
        <PopoverContent className="w-fit z-90 bg-highest rounded-lg">
          <PopoverBody className="space-y-3 p-4">
            <Link
              className="p-0 flex gap-3 items-center text-neutral-800"
              href={'/authentication?tab=sign-in'}
            >
              <SignInIcon size={24} />
              Sign In
            </Link>
            <Link
              className="p-0 flex gap-3 items-center text-neutral-800"
              href={'/authentication?tab=sign-up'}
            >
              <UserPlusIcon size={24} />
              Register
            </Link>
          </PopoverBody>
        </PopoverContent>
      )}
    </Popover>
  )
}
