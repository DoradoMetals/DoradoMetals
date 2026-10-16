'use client'

import { RefinerOrderFailed } from '../_components/RefinerScreenStates'

export default function Error({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <RefinerOrderFailed onRetry={reset} />
}
