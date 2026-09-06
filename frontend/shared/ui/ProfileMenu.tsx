'use client'
import { useEffect, useState } from 'react'
import {
  Avatar,
  Button,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from '@dorado/components'
import { ListIcon, Lock, LogIn, CircleUser, User, UserPlus } from '@dorado/icons'
import { useGetSession, useSignOut } from '@/shared/hooks/auth/queries'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function AccountMenu() {
  const { user } = useGetSession()
  const pathname = usePathname()

  const signOutMutation = useSignOut()

  const [open, setOpen] = useState(false)
  useEffect(() => setOpen(false), [pathname])

  return (
    <Menu open={open} onOpenChange={setOpen}>
      <MenuTrigger asChild>
        <Button variant="tertiary" size="icon" aria-label="Account menu">
          <Avatar className="flex items-center">
            <User size={28} />
          </Avatar>
        </Button>
      </MenuTrigger>
      {user ? (
        <MenuContent align="end">
          <div className="flex flex-col gap-0.5 px-2 py-1.5">
            <strong>{user?.name}</strong>
            <small data-emphasis="subtlest">{user?.email}</small>
          </div>
          <MenuSeparator />
          <MenuItem asChild>
            <Link href="/account?tab=details">
              <CircleUser />
              View Account
            </Link>
          </MenuItem>
          <MenuItem asChild>
            <Link href="/account?tab=sold">
              <ListIcon />
              View Orders
            </Link>
          </MenuItem>
          <MenuItem asChild>
            <Link href="/account?tab=security">
              <Lock />
              Security
            </Link>
          </MenuItem>
          <MenuSeparator />
          <MenuItem
            intent="danger"
            disabled={signOutMutation.isPending}
            onSelect={async () => {
              try {
                await signOutMutation.mutateAsync()
              } catch (err) {
                console.error('Sign out failed:', err)
              }
            }}
          >
            {signOutMutation.isPending ? 'Signing Out...' : 'Sign Out'}
          </MenuItem>
        </MenuContent>
      ) : (
        <MenuContent align="end">
          <MenuItem asChild>
            <Link href="/auth/sign-in">
              <LogIn />
              Sign In
            </Link>
          </MenuItem>
          <MenuItem asChild>
            <Link href="/auth/sign-up">
              <UserPlus />
              Register
            </Link>
          </MenuItem>
        </MenuContent>
      )}
    </Menu>
  )
}
