'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import { Button, EmptyState } from '@dorado/components'
import { TriangleAlert } from '@dorado/icons'
import Link from 'next/link'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <EmptyState
        icon={<TriangleAlert />}
        title="Something went wrong"
        description="We hit an unexpected error. Try again, or head back home."
        action={
          <div className="flex gap-2">
            <Button onClick={() => reset()}>Try again</Button>
            <Button variant="secondary" asChild>
              <Link href="/">Back to home</Link>
            </Button>
          </div>
        }
      />
    </div>
  )
}
