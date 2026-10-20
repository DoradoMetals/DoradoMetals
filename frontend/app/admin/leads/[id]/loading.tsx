import { Skeleton } from '@dorado/components'

export default function Loading() {
  return (
    <div role="status" aria-label="Loading lead" className="flex flex-col gap-md">
      <Skeleton className="h-[155px] w-full" />
      <Skeleton className="h-[300px] w-full" />
    </div>
  )
}
