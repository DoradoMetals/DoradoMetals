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
  MenuLabel,
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

// EVERY LINK IN THE CHROME RESOLVES TO A ROUTE THAT EXISTS, and that is the
// whole rule of this file. Figma's Header draws How It Works / Pricing / About
// / Contact and the Footer draws Company and Legal columns; none of those
// routes was rebuilt after the nuke, so none of them is drawn here. A nav entry
// or a footer column appears the day its page does.
//
//   nav      Home, and Admin for a signed-in admin.
//   account  the two Settings screens, or the two ways in when signed out.
const HOME: Entry = { href: '/', label: 'Home' }
const ADMIN: Entry = { href: '/admin', label: 'Admin' }

const SIGNED_IN_ACCOUNT: Entry[] = [
  { href: '/settings/email', label: 'Email' },
  { href: '/settings/phone', label: 'Phone' },
]

const SIGNED_OUT_ACCOUNT: Entry[] = [
  { href: '/auth/sign-up', label: 'Create an account' },
]

function useChrome() {
  const { user } = useGetSession()
  // Signing in from the nav returns to the page it was clicked on.
  const pathname = usePathname() ?? '/'
  const signedIn = Boolean(user)
  const isAdmin = user?.role === 'admin'

  return {
    signedIn,
    nav: signedIn && isAdmin ? [HOME, ADMIN] : [HOME],
    account: signedIn
      ? SIGNED_IN_ACCOUNT
      : [{ href: signInHref(pathname), label: 'Sign in' }, ...SIGNED_OUT_ACCOUNT],
    who: user?.name || user?.email || '',
    initials: initials(user?.name, user?.email),
  }
}

function NavLinks({ pathname }: { pathname: string }) {
  const { nav } = useChrome()

  return (
    <>
      {nav.map((entry) => (
        <UILink key={entry.href} asChild variant="nav" active={pathname === entry.href}>
          <NextLink href={entry.href}>{entry.label}</NextLink>
        </UILink>
      ))}
    </>
  )
}

function AccountMenu() {
  const { signedIn, account, who, initials: label } = useChrome()
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
        <MenuLabel>Account</MenuLabel>
        {who && (
          <Text variant="small" emphasis="subtle" className="px-2 pb-1">
            {who}
          </Text>
        )}
        <MenuSeparator />
        <MenuLabel>Settings</MenuLabel>
        {account.map((entry) => (
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

// The Drawer carries the same links the desktop bar does - the nav entries and
// the account entries - because the mobile bar is brand and hamburger only
// (Figma 51:57) and this is where the rest of the header goes.
function MenuPanel({ pathname, onNavigate }: { pathname: string; onNavigate: () => void }) {
  const { signedIn, nav, account } = useChrome()
  const { mutate: signOut } = useSignOut()

  return (
    <nav aria-label="Menu" className="flex flex-col gap-lg p-lg">
      {[...nav, ...account].map((entry) => (
        <UILink key={entry.href} asChild variant="nav" active={pathname === entry.href}>
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
  const { account } = useChrome()

  // ONE COLUMN, AND THAT IS NOT AN OVERSIGHT. `Footer` renders whatever columns
  // it is handed, so a Company column is one array entry away - but About,
  // Contact and Careers do not exist as routes, and a footer link that 404s is
  // worse than a footer that is short.
  return (
    <Footer
      brand={<BrandMark />}
      tagline="Fast. Insured. Paid the day it arrives."
      columns={[
        {
          heading: 'Account',
          links: account.map((entry) => (
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
        nav={<NavLinks pathname={pathname} />}
        trailing={<AccountMenu />}
        drawerOpen={drawerOpen}
        onDrawerToggle={() => setDrawerOpen((open) => !open)}
      />

      <Drawer open={drawerOpen} setOpen={setDrawerOpen} anchor="right" label="Menu">
        <Text variant="h6" emphasis="subtlest" className="px-lg pt-lg">
          Menu
        </Text>
        <MenuPanel pathname={pathname} onNavigate={() => setDrawerOpen(false)} />
      </Drawer>

      <main className="flex-1">{children}</main>

      {!isUnder(pathname, NO_FOOTER_PREFIXES) && <SiteFooter />}
    </div>
  )
}
