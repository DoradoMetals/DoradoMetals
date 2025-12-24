import * as React from 'react'
import { cn } from '@/shared/utils/cn'
import { PayoutMethod } from '@/features/payouts/types'
import type { IconProps } from '@phosphor-icons/react'


export function PayoutCard({ method }: { method: PayoutMethod }) {
  const Icon = method.icon as React.ComponentType<IconProps>

  const hasFee = method.cost > 0
  const feeLabel = hasFee ? `$${method.cost.toFixed(2)} fee` : 'No additional fee'

  return (
    <article className="rounded-lg bg-card raised-off-page">
      <div className="px-4 sm:px-6 pt-4 sm:pt-6 pb-5 sm:pb-7">
        <div className="flex flex-col items-start gap-2 md:flex-row md:justify-between w-full">
          <HeadingWithIcon icon={Icon}>{method.label}</HeadingWithIcon>

          <div className="mt-1 text-xs sm:text-sm text-neutral-600 flex flex-wrap gap-3">
            <span>{method.time_delay}</span>
            <span className="h-3 w-px bg-border self-center" />
            <span>{feeLabel}</span>
          </div>
        </div>

        <div className="mt-3 sm:mt-4 flex flex-col gap-3 sm:gap-4">
          <p className="text-sm sm:text-base leading-relaxed text-neutral-800">
            {method.longIntro}
          </p>

          <div className="mt-1 sm:mt-2">
            <p className="text-base sm:text-lg text-neutral-700 mb-1.5 font-semibold tracking-wide">
              {method.fitHeading}
            </p>
            <ul className="space-y-1.5 text-sm sm:text-base text-neutral-900">
              {method.fitBullets.map((b) => (
                <li key={b} className="flex gap-2">
                  <span className="mt-[6px] h-1.5 w-1.5 rounded-full bg-neutral-900 shrink-0" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>

          {method.details.map((p) => (
            <p key={p} className="text-sm sm:text-base leading-relaxed text-neutral-800">
              {p}
            </p>
          ))}
        </div>
      </div>
    </article>
  )
}

function HeadingWithIcon({
  icon: Icon,
  children,
  className,
  iconSize = 32,
}: {
  icon: React.ComponentType<IconProps>
  children: React.ReactNode
  className?: string
  iconSize?: number
}) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <Icon size={iconSize} className="text-primary shrink-0" />
      <h2 className="text-xl sm:text-2xl font-semibold text-neutral-900 tracking-tight">
        {children}
      </h2>
    </div>
  )
}