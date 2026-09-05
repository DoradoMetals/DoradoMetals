import { Button, EmptyState } from '@dorado/components'
import { SearchX } from '@dorado/icons'
import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <EmptyState
        icon={<SearchX />}
        title="Page not found"
        description="The page you're looking for doesn't exist or has moved."
        action={
          <Button asChild>
            <Link href="/">Back to home</Link>
          </Button>
        }
      />
    </div>
  )
}
