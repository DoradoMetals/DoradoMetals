import { Skeleton } from '@dorado/components'

export default function Loading() {
  return (
    <div role="status" aria-label="Loading leads" className="flex flex-col gap-lg">
      <Skeleton className="h-[250px] w-full" />
      <Skeleton className="h-[400px] w-full" />
    </div>
  )
}
