import { UserName } from '@/shared/ui/UserName'
import { formatStamp } from '@/shared/utils/formatStamp'
import { useUserNames } from '@dorado/client'
import { Accordion, EmptyState, Text } from '@dorado/components'
import { History, Lock, RefreshCw, SlidersHorizontal } from '@dorado/icons'
import type { SpotActivity, SpotSourceRead } from '@dorado/contracts'

import { activityTitle } from '../_lib'

function KindIcon({ kind }: { kind: SpotActivity['kind'] }) {
  if (kind === 'adjustment') return <SlidersHorizontal aria-hidden className="size-4" />
  if (kind === 'source') return <RefreshCw aria-hidden className="size-4" />
  return <Lock aria-hidden className="size-4" />
}

export function ActivitySection({
  activity,
  sources,
  className,
}: {
  activity: SpotActivity[]
  sources: SpotSourceRead[]
  className?: string
}) {
  const names = useUserNames(activity.map((entry) => entry.actor_id)).data
  return (
    <Accordion label="Activity" trailing="Last 7 days" defaultOpen flush className={className}>
      <div className="flex flex-col px-md pb-md">
        {activity.length === 0 ? (
          <EmptyState
            icon={<History />}
            title="No activity yet"
            description="Locks, adjustments and feed changes for this metal show here."
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
                    {activityTitle(entry, sources)}
                  </Text>
                  <Text variant="micro">
                    <UserName id={entry.actor_id} names={names} />
                  </Text>
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
