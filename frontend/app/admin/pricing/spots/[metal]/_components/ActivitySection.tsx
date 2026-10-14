import { Accordion, EmptyState, Text } from '@dorado/components'
import { Lock, Package, RefreshCw, SlidersHorizontal } from '@dorado/icons'
import type { SpotActivity } from '@dorado/contracts'

import { formatStamp } from '../../../_lib'
import { activityTitle } from '../_lib'

function KindIcon({ kind }: { kind: SpotActivity['kind'] }) {
  if (kind === 'adjustment') return <SlidersHorizontal aria-hidden className="size-4" />
  if (kind === 'source') return <RefreshCw aria-hidden className="size-4" />
  return <Lock aria-hidden className="size-4" />
}

export function ActivitySection({
  activity,
  className,
}: {
  activity: SpotActivity[]
  className?: string
}) {
  return (
    <Accordion label="Activity" trailing="Last 7 days" defaultOpen flush className={className}>
      <div className="flex flex-col px-md pb-md">
        {activity.length === 0 ? (
          <EmptyState
            icon={<Package />}
            title="No activity"
            description="Nothing happened to this metal in the last 7 days."
          />
        ) : (
          <ul className="flex flex-col">
            {activity.map((entry) => (
              <li key={`${entry.kind}:${entry.id}`} className="flex items-start gap-sm py-xs">
                <span className="pt-3xs text-muted-foreground">
                  <KindIcon kind={entry.kind} />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-3xs">
                  <Text variant="small-medium" emphasis="default">
                    {activityTitle(entry)}
                  </Text>
                  <Text variant="micro">{entry.actor_name ?? 'System'}</Text>
                </div>
                <Text variant="micro">{formatStamp(entry.at)}</Text>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Accordion>
  )
}
