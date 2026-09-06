'use client'
import { Hero } from '@dorado/components'

export default function Home() {
  return (
    <main>
      <Hero
        sellerCount={2400}
        primaryAction={{ href: '/auth/sign-in', label: 'Get a Quote' }}
      />
    </main>
  )
}
