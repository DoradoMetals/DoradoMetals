'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { payoutOptions, PayoutMethod } from '@/types/payout'
import type { IconProps } from '@phosphor-icons/react'

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

export default function PayoutMethodsPage() {
  return (
    <main className="relative w-full flex flex-col items-center">
      <section className="w-full px-4 sm:px-6 lg:px-8 pt-8 sm:pt-12 pb-4">
        <div className="max-w-4xl flex flex-col gap-3 items-start justify-start">
          <h1 className="text-neutral-900 text-2xl sm:text-3xl font-semibold tracking-tight">
            Payout Methods
          </h1>
          <p className="text-neutral-700 text-sm sm:text-base leading-relaxed">
            Choose how you'd like to get paid when you sell your metal. We offer several secure
            payout options designed to balance speed, convenience, and flexibility. Each method
            below explains how it works, typical timing, and when it might be the best fit.
          </p>
        </div>
      </section>

      <section className="w-full px-4 sm:px-6 lg:px-8 pb-12 sm:pb-16">
        <div className="flex flex-col gap-6 sm:gap-8">
          {payoutOptions.map((option) => (
            <PayoutCard key={option.method} method={option} />
          ))}
        </div>
      </section>
    </main>
  )
}

function PayoutCard({ method }: { method: PayoutMethod }) {
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
