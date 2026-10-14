import { cn, Text } from '@dorado/components'
import { BadgeAlert } from '@dorado/icons'

export type FeedNoticeProps = {
  intent: 'danger' | 'warning'
  mobile: boolean
  title: React.ReactNode
  message: React.ReactNode
  actions: React.ReactNode
}

export function FeedNotice({ intent, mobile, title, message, actions }: FeedNoticeProps) {
  const tone = intent === 'danger' ? 'text-destructive' : 'text-warning'
  const icon = <BadgeAlert aria-hidden className={cn('size-4 shrink-0', tone)} />

  return (
    <section
      role={intent === 'danger' ? 'alert' : 'status'}
      className={cn(
        'flex rounded-lg py-sm pl-md pr-sm',
        intent === 'danger' ? 'bg-destructive-soft' : 'bg-warning-soft',
        mobile ? 'flex-col gap-sm' : 'items-center gap-sm'
      )}
    >
      {mobile ? (
        <div className="flex gap-xs">
          <span className="pt-3xs">{icon}</span>
          <div className="flex flex-col gap-xs">
            <Text variant="small-medium" className={tone}>
              {title}
            </Text>
            <Text variant="small">{message}</Text>
          </div>
        </div>
      ) : (
        <>
          {icon}
          <p className="flex flex-1 items-center gap-xs">
            <Text variant="small-medium" className={tone}>
              {title}
            </Text>
            <Text variant="small">{message}</Text>
          </p>
        </>
      )}
      <div className={cn('flex gap-xs', mobile && '*:flex-1')}>{actions}</div>
    </section>
  )
}
