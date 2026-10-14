import NumberFlow, { type Format, type Value } from '@number-flow/react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../cn'

const amountVariants = cva('tabular-nums', {
  variants: {
    tag: {
      display: 'display',
      'stat-lg': 'stat-lg',
      stat: 'stat',
      'stat-sm': 'stat-sm',
      'stat-xs': 'stat-xs',
      'stat-2xs': 'stat-2xs',
      body: 'text-body font-medium text-foreground',
      small: 'text-small font-medium text-foreground',
      micro: 'micro font-medium text-foreground',
    },
  },
})

export type AmountTag = NonNullable<VariantProps<typeof amountVariants>['tag']>

export type AmountProps = {
  value: Value
  format?: Format
  tag?: AmountTag
  className?: string
}

const DEFAULT_FORMAT: Format = {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}

export function Amount({ value, format, tag, className }: AmountProps) {
  return (
    <NumberFlow
      willChange
      trend={0}
      value={value}
      format={format ?? DEFAULT_FORMAT}
      className={cn(amountVariants({ tag }), className)}
      opacityTiming={{ duration: 250, easing: 'ease-out' }}
      transformTiming={{
        easing: `linear(0, 0.001 0.43%, 0.0045 0.94%, 0.0195 2.03%, 0.0444 3.19%, 0.0808 4.49%, 0.1593 6.81%, 0.3676 12.31%, 0.4683 15.14%, 0.5652, 0.6487 21.22%, 0.6871, 0.722, 0.7536 26%, 0.7832 27.67%, 0.8107, 0.835 31.15%, 0.8574 32.96%, 0.8776 34.84%, 0.897 36.94%, 0.9141 39.11%, 0.9293 41.43%, 0.9423 43.82%, 0.9539 46.43%, 0.9637 49.18%, 0.9789 55.34%, 0.9888 62.37%, 0.995 71.13%, 0.9983 82.58%, 0.9997 99.96%)`,
        duration: 1500,
      }}
      spinTiming={{ duration: 150, easing: 'ease-out' }}
    />
  )
}
