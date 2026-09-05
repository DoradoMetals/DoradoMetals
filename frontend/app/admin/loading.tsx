import { Skeleton } from '@dorado/components'

export default function Loading() {
  return (
    <div className="flex min-h-[50vh] w-full flex-col items-center justify-center gap-2 px-4">
      <Skeleton shape="block" className="w-full max-w-3xl" />
      <Skeleton shape="block" className="w-full max-w-3xl" />
      <Skeleton shape="block" className="w-full max-w-3xl" />
    </div>
  )
}
