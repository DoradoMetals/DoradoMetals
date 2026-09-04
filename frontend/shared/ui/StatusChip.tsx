import { Badge, type BadgeProps } from '@dorado/components'

export type ChipTone =
  | 'neutral'
  | 'brand'
  | 'success'
  | 'danger'
  | 'warning'
  | 'info'
  | 'positive'
  | 'negative'

const TONE_INTENT: Record<ChipTone, NonNullable<BadgeProps['intent']>> = {
  neutral: 'neutral',
  brand: 'neutral',
  success: 'success',
  danger: 'danger',
  warning: 'warning',
  info: 'info',
  positive: 'success',
  negative: 'danger',
}

type StatusChipProps = {
  positive?: boolean
  children: React.ReactNode
  className?: string
  tone?: ChipTone
  size?: 'sm' | 'default' | 'lg'
}

export default function StatusChip({
  positive,
  tone,
  size,
  className,
  children,
}: StatusChipProps) {
  const resolved = tone ?? (positive === undefined ? 'neutral' : positive ? 'success' : 'danger')
  return (
    <Badge variant="soft" intent={TONE_INTENT[resolved]} size={size} className={className}>
      {children}
    </Badge>
  )
}

export { TONE_INTENT }
