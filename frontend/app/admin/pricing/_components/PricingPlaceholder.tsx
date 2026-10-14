import { EmptyState } from '@dorado/components'
import { Inbox } from '@dorado/icons'

export function PricingPlaceholder({ title }: { title: string }) {
  return (
    <section aria-label={title}>
      <EmptyState
        icon={<Inbox />}
        title={`${title} are coming`}
        description="This surface is being ported."
      />
    </section>
  )
}
