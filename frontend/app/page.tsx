'use client'

import { Hero } from '@dorado/components'

// The placeholder homepage. The Header and Footer moved to the app layout
// (docs/waves/app-shell.md), so the page is the Hero and nothing else.
//
// Hero draws two CTAs; only the primary is passed, because "Browse bullion"
// points at /buy and that route does not exist yet.
export default function Home() {
  return <Hero sellerCount={2400} primaryAction={{ href: '/auth/sign-in', label: 'Get a Quote' }} />
}
