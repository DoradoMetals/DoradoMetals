'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Footer, Header, Hero, Link as UILink } from '@dorado/components'

// THE PLACEHOLDER HOMEPAGE (the frontend nuke, ruling 99).
//
// Every customer surface is deleted; the only thing behind this page is the
// auth flow. So it is three Figma components and nothing else - Header, Hero
// and Footer straight out of `@dorado/components`, with no copy invented
// beyond the title and the one line under it. There is no nav, because there
// is nowhere to navigate: the single control is the sign-in link.
//
// Hero draws its own CTAs ("Get a Quote" -> /sell, "Browse bullion" -> /buy)
// and both of those routes are gone. They 404 until the surfaces are built.
// Fixing that means editing the design system, and `packages/components` is
// Jacob's - it is not this lane's to change.
function Brand() {
  return (
    <Link href="/" aria-label="Dorado Metals Exchange">
      <Image
        src="/icons/branding/symbol/white/symbol.svg"
        alt="Dorado Metals Exchange"
        width={104}
        height={51}
        priority
      />
    </Link>
  )
}

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header
        brand={<Brand />}
        trailing={
          <UILink asChild>
            <Link href="/auth/sign-in">Sign in</Link>
          </UILink>
        }
      />

      <main className="flex-1">
        <Hero
          sellerCount={2400}
          primaryAction={{ href: '/auth/sign-in', label: 'Get a Quote' }}
        />
      </main>

      <Footer
        brand={<Brand />}
        columns={[
          {
            heading: 'Account',
            links: [
              <UILink key="sign-in" asChild>
                <Link href="/auth/sign-in">Sign in</Link>
              </UILink>,
              <UILink key="sign-up" asChild>
                <Link href="/auth/sign-up">Create an account</Link>
              </UILink>,
            ],
          },
        ]}
        legal={<small>© {new Date().getFullYear()} Dorado Metals Exchange</small>}
      />
    </div>
  )
}
