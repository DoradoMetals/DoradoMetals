'use client'
import { Hero } from '@dorado/components'

export default function Home() {
  return (
    <main>
      {/* The count is the app's to supply - the Hero refuses to invent one.
          Wire this to the real figure when a source exists. */}
      <Hero sellerCount={2400} />
    </main>
  )
}
