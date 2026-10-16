'use client'

import { SectionError } from './_components'

export default function Error({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <SectionError title="Couldn’t load this order" onRetry={reset} />
}
