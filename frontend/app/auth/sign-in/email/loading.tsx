import { Skeleton } from '@dorado/components'

export default function Loading() {
  return (
    <div className="flex w-full flex-col gap-lg">
      <Skeleton className="h-6 w-2/3 self-center" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  )
}
