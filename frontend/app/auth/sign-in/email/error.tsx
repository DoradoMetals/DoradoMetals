'use client'

import NextLink from 'next/link'
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
      title="Something went wrong"
      description="We could not finish that. Try again, or head back."
      action={
        <div className="flex gap-2">
          <Button onClick={() => reset()}>Try again</Button>
          <Button variant="secondary" asChild>
            <NextLink href="/">Back to home</NextLink>
          </Button>
        </div>
      }
    />
  )
}
