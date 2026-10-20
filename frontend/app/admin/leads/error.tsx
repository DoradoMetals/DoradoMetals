'use client'

import { Alert, Button } from '@dorado/components'

export default function Error({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex flex-col items-start gap-sm">
      <Alert intent="danger" title="Couldn't load leads" className="w-full">
        Check your connection, then try again.
      </Alert>
      <Button variant="secondary" onClick={reset}>
        Try again
      </Button>
    </div>
  )
}
