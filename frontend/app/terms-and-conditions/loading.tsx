import { Skeleton } from '@dorado/components'

export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-lg px-md py-2xl lg:px-0">
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  )
}
