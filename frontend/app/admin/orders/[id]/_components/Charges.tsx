'use client'

import * as React from 'react'
import { cn } from '@dorado/components'
import type { Direction, OrderPricing } from '@dorado/contracts'

import { ORDER_ACTIONS, formatFixed, offers, type OrderAction } from '../_lib'
import { DecimalField } from './DecimalField'
import { OrderSection, type SectionContent } from './OrderSection'

export type ChargesProps = {
  direction: Direction
  pricing: Pick<OrderPricing, 'payout_fee' | 'shipping_charge' | 'card_fee'> | null | undefined
  actions: readonly OrderAction[]
  content?: Exclude<SectionContent, 'empty'>
  layout?: 'desktop' | 'mobile'
  onPayoutFeeChange?: (value: number | null) => void
  onShippingChargeChange?: (value: number | null) => void
  onRetry?: () => void
  defaultOpen?: boolean
}

export function Charges({
  direction,
  pricing,
  actions,
  content = 'loaded',
  layout = 'desktop',
  onPayoutFeeChange,
  onShippingChargeChange,
  onRetry,
  defaultOpen = true,
}: ChargesProps) {
  const state: SectionContent = content === 'loaded' && pricing == null ? 'empty' : content
  const editable = offers(actions, ORDER_ACTIONS.editCharges)
  const purchase = direction === 'purchase'

  return (
    <OrderSection
      title="Charges"
      layout={layout}
      content={state}
      emptyTitle="No charges"
      emptyDescription="Shipping and fees on this order show here."
      errorTitle="Couldn’t load charges"
      onRetry={onRetry}
      defaultOpen={defaultOpen}
    >
      <div
        className={cn('flex gap-md', layout === 'mobile' ? 'flex-col' : 'flex-row [&>*]:flex-1')}
      >
        {purchase && (
          <DecimalField
            label="Payout Charge"
            value={pricing?.payout_fee}
            format={formatFixed}
            unit="$"
            onCommit={editable ? onPayoutFeeChange : undefined}
          />
        )}
        <DecimalField
          label="Shipping Charge"
          value={pricing?.shipping_charge}
          format={formatFixed}
          unit="$"
          onCommit={editable ? onShippingChargeChange : undefined}
        />
        {!purchase && (
          <DecimalField
            label="Payment Charge"
            value={pricing?.card_fee}
            format={formatFixed}
            unit="$"
            readOnly
          />
        )}
      </div>
    </OrderSection>
  )
}
