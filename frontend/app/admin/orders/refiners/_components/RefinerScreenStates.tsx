import { Alert, Button, Skeleton } from '@dorado/components'

import { CardNotice } from '../../_components/CardNotice'

export function RefinerOrderSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading refiner order"
      className="flex flex-col gap-md lg:gap-lg"
    >
      <Skeleton className="h-[150px] w-full" />
      <div className="grid grid-cols-1 gap-md lg:grid-cols-[minmax(0,1fr)_388px] lg:gap-lg">
        <div className="flex flex-col gap-md lg:gap-lg">
          <Skeleton className="h-[160px] w-full" />
          <Skeleton className="h-[400px] w-full" />
        </div>
        <div className="flex flex-col gap-md lg:gap-lg">
          <Skeleton className="h-[256px] w-full" />
          <Skeleton className="h-[160px] w-full" />
        </div>
      </div>
    </div>
  )
}

export function RefinerOrderFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-sm">
      <Alert intent="danger" title="Couldn’t load this refiner order" className="w-full">
        Check your connection, then try again.
      </Alert>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}

export function RefinerSaveFailed({
  stale,
  message,
  onReload,
  onRetry,
}: {
  stale: boolean
  message?: string
  onReload: () => void
  onRetry: () => void
}) {
  return (
    <CardNotice
      kind={stale ? 'stale' : 'error'}
      message={message}
      onReload={onReload}
      onRetry={onRetry}
    />
  )
}
