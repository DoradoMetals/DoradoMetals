import { Skeleton } from '@dorado/components'

export default function Loading() {
  return (
    <div className="flex flex-col gap-lg p-xl">
      <Skeleton className="h-[150px] w-full" />
      <Skeleton className="h-[400px] w-full" />
    </div>
  )
}
