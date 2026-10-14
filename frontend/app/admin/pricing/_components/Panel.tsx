import { cn, Text } from '@dorado/components'

export type PanelProps = {
  title: React.ReactNode
  trailing?: React.ReactNode
  id?: string
  className?: string
  children: React.ReactNode
}

export function Panel({ title, trailing, id, className, children }: PanelProps) {
  return (
    <section
      id={id}
      className={cn('flex flex-col rounded-lg border border-border bg-card', className)}
    >
      <header className="flex items-center justify-between gap-xs px-md pb-xs-plus pt-sm-plus">
        <Text variant="h5" as="h2">
          {title}
        </Text>
        {trailing}
      </header>
      <div className="flex flex-col px-md pb-sm">{children}</div>
    </section>
  )
}
