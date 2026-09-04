import * as React from 'react'
import { payoutMethodIcon, PayoutMethodType } from '@/features/payouts/types'
import type { PaymentMethod } from '@dorado/contracts'
import type { IconProps } from '@dorado/components'

// The card renders a payments.methods row verbatim (D207); the icon is the
// client's, keyed by the row's type.
export function PayoutCard({ method }: { method: PaymentMethod }) {
  const Icon = payoutMethodIcon[method.type as PayoutMethodType] as React.ComponentType<IconProps>

  const fee = Number(method.flat_fee ?? 0)
  const feeLabel = fee > 0 ? `$${fee.toFixed(2)} fee` : 'No additional fee'

  return (
    // The shadow is gone (ruling 27) and the separation it was doing is a
    // hairline (ruling 19): a card is a flat surface with a border.
    <article className="rounded-lg border border-border bg-card">
      <div className="px-4 sm:px-6 pt-4 sm:pt-6 pb-5 sm:pb-7">
        <div className="flex flex-col items-start gap-2 md:flex-row md:justify-between w-full">
          <div className="flex items-center gap-3">
            {Icon && <Icon size={32} className="shrink-0" />}
            <h2>{method.label}</h2>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-3">
            <small>{method.time_delay}</small>
            <span className="h-3 w-px bg-border self-center" />
            <small>{feeLabel}</small>
          </div>
        </div>

        <div className="mt-3 sm:mt-4 flex flex-col gap-3 sm:gap-4">
          <p>{method.fit_description}</p>

          <div className="mt-1 sm:mt-2">
            <h3 className="mb-1.5">{method.fit_header}</h3>
            <ul className="space-y-1.5">
              {(method.fit_bullets ?? []).map((b) => (
                <li key={b} className="flex gap-2">
                  <span className="mt-[6px] h-1.5 w-1.5 rounded-full bg-foreground shrink-0" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>

          {(method.details ?? []).map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
      </div>
    </article>
  )
}
