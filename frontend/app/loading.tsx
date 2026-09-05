import { Spinner } from '@dorado/components'

export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Spinner size="lg" />
    </div>
  )
}
