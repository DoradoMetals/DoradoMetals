import { Skeleton } from '@dorado/components'

export default function Loading() {
  return (
    <div className="flex flex-col gap-md lg:gap-lg" aria-busy="true">
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-[155px] w-full" />
      <div className="flex flex-col gap-md lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-lg">
        <div className="flex flex-col gap-md lg:gap-lg">
          <Skeleton className="h-[212px] w-full" />
          <Skeleton className="h-[134px] w-full" />
          <Skeleton className="h-[411px] w-full" />
        </div>
        <div className="flex flex-col gap-md lg:gap-lg">
          <Skeleton className="h-[264px] w-full" />
          <Skeleton className="h-[341px] w-full" />
        </div>
      </div>
    </div>
  )
}
