'use client'

import * as React from 'react'

import { Badge } from '../badge/Badge'
import { Button } from '../button/Button'

export type HeroAction = {
  href: string
  label: React.ReactNode
}

export type HeroProps = {
  sellerCount: number
  primaryAction: HeroAction
  secondaryAction?: HeroAction
}

export function Hero({ sellerCount, primaryAction, secondaryAction }: HeroProps) {
  return (
    <section className="flex flex-col items-center gap-md bg-background px-lg py-3xl text-center sm:p-3xl">
      <Badge>Live spot pricing, locked at checkout</Badge>

      <h1 className="max-w-2xl text-balance">Sell your precious metals without the guesswork</h1>

      <p className="max-w-xl text-balance text-h5 text-muted-foreground">
        Insured shipping, transparent assay, and payout the day your metal arrives.
      </p>

      <div className="flex w-full flex-col items-stretch gap-xs pt-xs sm:w-auto sm:flex-row sm:items-start">
        <Button asChild size="lg" variant="primary" className="w-full sm:w-auto">
          <a href={primaryAction.href}>{primaryAction.label}</a>
        </Button>
        {secondaryAction != null && (
          <Button asChild size="lg" variant="secondary" className="w-full sm:w-auto">
            <a href={secondaryAction.href}>{secondaryAction.label}</a>
          </Button>
        )}
      </div>

      <p className="text-micro text-placeholder">
        Trusted by {sellerCount.toLocaleString('en-US')}+ sellers · A+ BBB · Fully insured
      </p>
    </section>
  )
}
