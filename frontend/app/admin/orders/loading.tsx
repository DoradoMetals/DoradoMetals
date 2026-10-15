import { Skeleton } from '@dorado/components'

import { OrdersSkeleton } from './_components'

export default function Loading() {
  return (
    <div className="flex flex-col gap-lg">
      <Skeleton className="h-[250px] w-full" />
      <OrdersSkeleton />
    </div>
  )
}
