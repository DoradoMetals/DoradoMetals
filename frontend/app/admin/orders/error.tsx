'use client'

import { OrdersFailed } from './_components'

export default function Error({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <OrdersFailed onRetry={reset} />
}
