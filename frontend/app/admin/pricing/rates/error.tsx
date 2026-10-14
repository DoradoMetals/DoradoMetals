'use client'

import { Button, EmptyState } from '@dorado/components'
import { TriangleAlert } from '@dorado/icons'

export default function Error({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <EmptyState
      icon={<TriangleAlert />}
      title="Pricing did not load"
      description="The API refused the request."
      action={<Button onClick={() => reset()}>Try again</Button>}
    />
  )
}
