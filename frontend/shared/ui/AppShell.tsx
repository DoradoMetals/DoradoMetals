'use client'

import Image from 'next/image'
import NextLink from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  Avatar,
  Drawer,
  Footer,
  Header,
  Link as UILink,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  Text,
  useBreakpoint,
} from '@dorado/components'

import { useGetSession, useSignOut } from '@/shared/hooks/auth/queries'
import { signInHref } from '@/shared/utils/returnTo'

// The auth screens draw their own full-bleed panel (AuthShell), so they wear no
// chrome. Everything else does.
const BARE_PREFIXES = ['/auth']

// Admin wears the Header and NO Footer: every frame in the Orders file
// (ymmNlCDLVIfanpRQ7QHMIs) is Header at y=0 then Content, and none has one.
const NO_FOOTER_PREFIXES = ['/admin']

const isUnder = (pathname: string, prefixes: string[]) =>
  prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))

function BrandMark({ className }: { className?: string }) {
  return (
    <NextLink href="/" aria-label="Dorado Metals Exchange" className={className}>
      <Image
        src="/icons/branding/symbol/white/symbol.svg"
        alt="Dorado Metals Exchange"
        width={49}
        height={24}
        priority
        className="h-6 w-auto lg:h-5"
      />
    </NextLink>
  )
}

function initials(name?: string | null, email?: string | null) {
  const source = (name ?? email ?? '').trim()
  if (!source) return '?'
  const parts = source.split(/[\s@._-]+/).filter(Boolean)
  return (parts[0]?.[0] ?? '?').concat(parts[1]?.[0] ?? '').toUpperCase()
}

type Entry = { href: string; label: string }

function useAccountEntries(): { entries: Entry[]; signedIn: boolean; label: string } {
  const { user } = useGetSession()
  // Signing in from the nav returns to the page it was clicked on.
  const pathname = usePathname() ?? '/'
  const signedIn = Boolean(user)
  const isAdmin = user?.role === 'admin'

  const entries: Entry[] = signedIn
    ? [
        { href: '/settings/email', label: 'Account' },
        ...(isAdmin ? [{ href: '/admin/orders', label: 'Admin' }] : []),
      ]
    : [
        { href: signInHref(pathname), label: 'Sign in' },
        { href: '/auth/sign-up', label: 'Create an account' },
      ]

  return { entries, signedIn, label: initials(user?.name, user?.email) }
}

function AccountMenu() {
  const { entries, signedIn, label } = useAccountEntries()
  const { mutate: signOut } = useSignOut()
  const pathname = usePathname() ?? '/'

  if (!signedIn) {
    return (
      <UILink asChild variant="nav">
        <NextLink href={signInHref(pathname)}>Sign in</NextLink>
      </UILink>
    )
  }

  return (
    <Menu>
      <MenuTrigger aria-label="Account menu" className="rounded-full outline-none">
        <Avatar size="sm" fallback={label} />
      </MenuTrigger>
      <MenuContent align="end">
        {entries.map((entry) => (
          <MenuItem key={entry.href} asChild>
            <NextLink href={entry.href}>{entry.label}</NextLink>
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuItem intent="danger" onSelect={() => signOut()}>
          Sign out
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}

function MenuPanel({ onNavigate }: { onNavigate: () => void }) {
  const { entries, signedIn } = useAccountEntries()
  const { mutate: signOut } = useSignOut()

  return (
    <nav aria-label="Menu" className="flex flex-col gap-lg p-lg">
      {entries.map((entry) => (
        <UILink key={entry.href} asChild variant="nav">
          <NextLink href={entry.href} onClick={onNavigate}>
            {entry.label}
          </NextLink>
        </UILink>
      ))}
      {signedIn && (
        <UILink
          asChild
          variant="nav"
          intent="danger"
          onClick={() => {
            onNavigate()
            signOut()
          }}
        >
          <button type="button">Sign out</button>
        </UILink>
      )}
    </nav>
  )
}

function SiteFooter() {
  const { entries } = useAccountEntries()

  return (
    <Footer
      brand={<BrandMark />}
      tagline="Fast. Insured. Paid the day it arrives."
      columns={[
        {
          heading: 'Account',
          links: entries.map((entry) => (
            <UILink key={entry.href} asChild>
              <NextLink href={entry.href}>{entry.label}</NextLink>
            </UILink>
          )),
        },
      ]}
      legal={`© ${new Date().getFullYear()} Dorado Metals Exchange LLC`}
    />
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/'
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { isAbove } = useBreakpoint()
  const desktop = isAbove('lg')

  useEffect(() => setDrawerOpen(false), [pathname])
  useEffect(() => {
    if (desktop) setDrawerOpen(false)
  }, [desktop])

  if (isUnder(pathname, BARE_PREFIXES)) return <>{children}</>

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        brand={<BrandMark />}
        trailing={<AccountMenu />}
        drawerOpen={drawerOpen}
        onDrawerToggle={() => setDrawerOpen((open) => !open)}
      />

      <Drawer open={drawerOpen} setOpen={setDrawerOpen} anchor="right" label="Menu">
        <Text variant="h6" emphasis="subtlest" className="px-lg pt-lg">
          Menu
        </Text>
        <MenuPanel onNavigate={() => setDrawerOpen(false)} />
      </Drawer>

      <main className="flex-1">{children}</main>

      {!isUnder(pathname, NO_FOOTER_PREFIXES) && <SiteFooter />}
    </div>
  )
}
