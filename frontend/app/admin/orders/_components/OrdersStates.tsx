import { Alert, Button, EmptyState, Skeleton } from '@dorado/components'
import { Package } from '@dorado/icons'

export function OrdersSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div
      role="status"
      aria-label="Loading orders"
      className="grid grid-cols-1 gap-md lg:grid-cols-4"
    >
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className="h-[372px] w-full" />
      ))}
    </div>
  )
}

export function OrdersEmpty() {
  return (
    <EmptyState
      icon={<Package aria-hidden />}
      title="No orders here"
      description="Orders that match these filters show here."
    />
  )
}

export function OrdersFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-sm">
      <Alert intent="danger" title="Couldn't load orders" className="w-full">
        Check your connection, then try again.
      </Alert>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}
