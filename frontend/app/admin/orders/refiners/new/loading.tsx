import { Skeleton } from '@dorado/components'

export default function Loading() {
  return (
    <div role="status" aria-label="Loading draft">
      <Skeleton className="h-[150px] w-full" />
    </div>
  )
}
