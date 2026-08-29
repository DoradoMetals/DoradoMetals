import * as React from 'react'
import { PayoutMethod } from '@/features/payouts/types'
import type { IconProps } from '@phosphor-icons/react'

export function PayoutCard({ method }: { method: PayoutMethod }) {
  const Icon = method.icon as React.ComponentType<IconProps>

  const hasFee = method.cost > 0
  const feeLabel = hasFee ? `$${method.cost.toFixed(2)} fee` : 'No additional fee'

  return (
    // The shadow is gone (ruling 27) and the separation it was doing is a
    // hairline (ruling 19): a card is a flat surface with a border.
    <article className="rounded-lg border border-border bg-card">
      <div className="px-4 sm:px-6 pt-4 sm:pt-6 pb-5 sm:pb-7">
        <div className="flex flex-col items-start gap-2 md:flex-row md:justify-between w-full">
          <div className="flex items-center gap-3">
            <Icon size={32} className="shrink-0" />
            <h2>{method.label}</h2>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-3">
            <small>{method.time_delay}</small>
            <span className="h-3 w-px bg-border self-center" />
            <small>{feeLabel}</small>
          </div>
        </div>

        <div className="mt-3 sm:mt-4 flex flex-col gap-3 sm:gap-4">
          <p>{method.longIntro}</p>

          <div className="mt-1 sm:mt-2">
            <h3 className="mb-1.5">{method.fitHeading}</h3>
            <ul className="space-y-1.5">
              {method.fitBullets.map((b) => (
                <li key={b} className="flex gap-2">
                  <span className="mt-[6px] h-1.5 w-1.5 rounded-full bg-neutral-900 shrink-0" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>

          {method.details.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
      </div>
    </article>
  )
}
