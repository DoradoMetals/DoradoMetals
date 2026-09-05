'use client'

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
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <EmptyState
        icon={<TriangleAlert />}
        title="Something went wrong"
        description="This page hit an unexpected error. Try again, or head back."
        action={
          <div className="flex gap-2">
            <Button onClick={() => reset()}>Try again</Button>
            <Button variant="secondary" asChild>
              <Link href="/buy">Back to catalog</Link>
            </Button>
          </div>
        }
      />
    </div>
  )
}
