import { Badge, type BadgeProps } from '@dorado/components'

export type CountBadgeTone = 'default' | 'brand' | 'destructive' | 'quiet'
export type CountBadgeSize = 'sm' | 'default'

const TONE: Record<CountBadgeTone, { variant: BadgeProps['variant']; intent: BadgeProps['intent'] }> = {
  default: { variant: 'solid', intent: 'neutral' },
  brand: { variant: 'solid', intent: 'neutral' },
  destructive: { variant: 'solid', intent: 'danger' },
  quiet: { variant: 'soft', intent: 'neutral' },
}

export type CountBadgeProps = {
  children: React.ReactNode
  /** LAYOUT ONLY (ml-auto, absolute placement). Never appearance. */
  className?: string
  tone?: CountBadgeTone
  size?: CountBadgeSize
}

export default function CountBadge({
  children,
  className,
  tone = 'default',
  size = 'default',
}: CountBadgeProps) {
  const { variant, intent } = TONE[tone]
  return (
    <Badge variant={variant} intent={intent} size={size} className={className}>
      {children}
    </Badge>
  )
}
