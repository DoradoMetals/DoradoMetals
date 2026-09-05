'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import { Button, EmptyState } from '@dorado/components'
import { TriangleAlert } from '@dorado/icons'

export default function GlobalError({
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
    <html lang="en">
      <body>
        <div className="flex min-h-screen items-center justify-center">
          <EmptyState
            icon={<TriangleAlert />}
            title="Something went wrong"
            description="We hit an unexpected error. Try again, or come back later."
            action={<Button onClick={() => reset()}>Try again</Button>}
          />
        </div>
      </body>
    </html>
  )
}
