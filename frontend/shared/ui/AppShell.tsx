'use client'

import Image from 'next/image'
import NextLink from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  Avatar,
  Button,
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
import { MessagesMenu } from '@/shared/ui/MessagesMenu'
import { SpotMarquee } from '@/shared/ui/SpotMarquee'
import { signInHref } from '@/shared/utils/returnTo'

const BARE_PREFIXES = ['/auth']

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

const SITE: Entry[] = [
  { href: '/how-it-works', label: 'How it works' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
]
const ADMIN: Entry = { href: '/admin', label: 'Admin' }

const SIGNED_IN_ACCOUNT: Entry[] = [
  { href: '/settings/email', label: 'Email' },
  { href: '/settings/phone', label: 'Phone' },
]

const SIGNED_OUT_ACCOUNT: Entry[] = [{ href: '/auth/sign-up', label: 'Create an account' }]

function useChrome() {
  const { user } = useGetSession()
  const pathname = usePathname() ?? '/'
  const signedIn = Boolean(user)
  const isAdmin = user?.role === 'admin'

  return {
    signedIn,
    nav: SITE,
    admin: signedIn && isAdmin ? [ADMIN] : [],
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
  const { signedIn, account, admin, who, initials: label } = useChrome()
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
        {admin.map((entry) => (
          <MenuItem key={entry.href} asChild>
            <NextLink href={entry.href}>{entry.label}</NextLink>
          </MenuItem>
        ))}
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

function MenuPanel({ pathname, onNavigate }: { pathname: string; onNavigate: () => void }) {
  const { signedIn, nav, admin, account } = useChrome()
  const { mutate: signOut } = useSignOut()

  return (
    <nav aria-label="Menu" className="flex flex-col gap-lg p-lg">
      {[...nav, ...admin, ...account].map((entry) => (
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

const FOOTER_DESKTOP: { heading: string; links: Entry[] }[] = [
  {
    heading: 'Product',
    links: [
      { href: '/how-it-works', label: 'How it works' },
      { href: '/pricing', label: 'Pricing' },
      { href: '/what-we-buy', label: 'What we buy' },
      { href: '/payouts', label: 'Payouts' },
      { href: '/security', label: 'Security' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { href: '/about', label: 'About' },
      { href: '/locations', label: 'Locations' },
      { href: '/careers', label: 'Careers' },
    ],
  },
  {
    heading: 'Resources',
    links: [
      { href: '/spot-prices', label: 'Spot prices' },
      { href: '/purity-guide', label: 'Purity guide' },
      { href: '/shipping', label: 'Shipping' },
      { href: '/faq', label: 'FAQ' },
      { href: '/support', label: 'Support' },
    ],
  },
  {
    heading: 'Connect',
    links: [
      { href: 'https://www.instagram.com/doradometals/', label: 'Instagram' },
      { href: 'https://www.facebook.com/people/Dorado-Metals/61576361032653/', label: 'Facebook' },
      { href: '/youtube', label: 'Youtube' },
      { href: 'https://x.com/DoradoMetals', label: 'X' },
      { href: '/linkedin', label: 'LinkedIn' },
    ],
  },
]

const FOOTER_MOBILE: { heading: string; links: Entry[] }[] = [
  { heading: 'Product', links: FOOTER_DESKTOP[0].links.slice(0, 4) },
  {
    heading: 'Metals',
    links: [
      { href: '/metals/gold', label: 'Gold' },
      { href: '/metals/silver', label: 'Silver' },
      { href: '/metals/platinum', label: 'Platinum' },
      { href: '/metals/scrap', label: 'Scrap' },
    ],
  },
  FOOTER_DESKTOP[1],
  {
    heading: 'Connect',
    links: [
      { href: '/contact', label: 'Contact us' },
      { href: '/support', label: 'Support' },
    ],
  },
]

const LEGAL: Entry[] = [
  { href: '/privacy-policy', label: 'Privacy' },
  { href: '/terms-and-conditions', label: 'Terms' },
  { href: '/accessibility', label: 'Accessibility' },
]

const SOCIAL: Entry[] = [
  { href: 'https://www.instagram.com/doradometals/', label: 'instagram' },
  { href: 'https://www.facebook.com/people/Dorado-Metals/61576361032653/', label: 'facebook' },
  { href: 'https://x.com/DoradoMetals', label: 'x' },
  { href: '/youtube', label: 'youtube' },
  { href: '/linkedin', label: 'linkedin' },
]

const footerLink = (entry: Entry) => (
  <UILink key={entry.href} asChild>
    <NextLink href={entry.href}>{entry.label}</NextLink>
  </UILink>
)

function SiteFooter({ desktop }: { desktop: boolean }) {
  const year = new Date().getFullYear()
  return (
    <Footer
      brand={
        <NextLink href="/" aria-label="Dorado Metals Exchange">
          <Image
            src="/icons/branding/symbol/white/symbol.svg"
            alt="Dorado Metals Exchange"
            width={84}
            height={42}
            className="h-[42px] w-auto lg:h-6"
          />
        </NextLink>
      }
      tagline={
        desktop ? 'Fast. Insured. Paid the day it arrives.' : 'Fast. Insured. Paid on arrival.'
      }
      cta={
        <Button asChild size={desktop ? 'lg' : 'sm'}>
          <NextLink href="/auth/sign-in">Get a Quote</NextLink>
        </Button>
      }
      columns={(desktop ? FOOTER_DESKTOP : FOOTER_MOBILE).map((column) => ({
        heading: column.heading,
        links: column.links.map(footerLink),
      }))}
      legal={desktop ? `© Dorado Metals Exchange LLC ${year}` : `© ${year}`}
      legalLinks={(desktop ? LEGAL : LEGAL.slice(0, 2)).map(footerLink)}
      social={SOCIAL.map((entry) => (
        <Button
          key={entry.label}
          asChild
          variant="tertiary"
          size="iconInline"
          aria-label={entry.label}
        >
          <a href={entry.href}>
            <Image src={`/icons/social/${entry.label}.svg`} alt="" width={16} height={16} />
          </a>
        </Button>
      ))}
    />
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/'
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { isAbove } = useBreakpoint()
  const desktop = isAbove('lg')
  const { signedIn } = useChrome()

  useEffect(() => setDrawerOpen(false), [pathname])
  useEffect(() => {
    if (desktop) setDrawerOpen(false)
  }, [desktop])

  if (isUnder(pathname, BARE_PREFIXES)) return <>{children}</>

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        spots={<SpotMarquee />}
        brand={<BrandMark />}
        nav={<NavLinks pathname={pathname} />}
        trailing={
          <div className="flex items-center gap-sm">
            {signedIn && <MessagesMenu />}
            <AccountMenu />
          </div>
        }
        mobileTrailing={signedIn ? <AccountMenu /> : undefined}
        drawerOpen={drawerOpen}
        onDrawerToggle={() => setDrawerOpen((open) => !open)}
      />

      <Drawer open={drawerOpen} setOpen={setDrawerOpen} anchor="right" label="Menu">
        <Text variant="h6" emphasis="subtlest" className="px-lg pt-lg">
          Menu
        </Text>
        <MenuPanel pathname={pathname} onNavigate={() => setDrawerOpen(false)} />
      </Drawer>

      <main className="flex-1">
        <div className="mx-auto w-full max-w-page">{children}</div>
      </main>

      <SiteFooter desktop={desktop} />
    </div>
  )
}
