'use client'

import * as React from 'react'
import { Badge, Button, Select, type SelectItemShape } from '@dorado/components'

import { OrderSection, type SectionContent } from './OrderSection'

export type FulfillmentChoice = {
  methods: SelectItemShape[]
  methodId: string | null
  onMethodChange: (methodId: string) => void
  shipTo: SelectItemShape[]
  shipToId: string | null
  onShipToChange: (shipToId: string) => void
  note?: React.ReactNode
}

export type FulfillmentProps = {
  layout?: 'desktop' | 'mobile'
  content?: SectionContent
  direction?: 'purchase' | 'sale' | string
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onRetry?: () => void
  onCreate?: () => void
  choice?: FulfillmentChoice
}

export function Fulfillment({
  layout = 'desktop',
  content = 'loaded',
  direction = 'purchase',
  open,
  onOpenChange,
  onRetry,
  onCreate,
  choice,
}: FulfillmentProps) {
  const mobile = layout === 'mobile'
  const sale = direction === 'sale'
  const shown: SectionContent = content === 'loaded' && !choice ? 'empty' : content
  return (
    <OrderSection
      title="Fulfillment"
      layout={layout}
      content={shown}
      open={open}
      onOpenChange={onOpenChange}
      onRetry={onRetry}
      badge={
        <Badge intent="neutral" variant="outline">
          Not set
        </Badge>
      }
      emptyTitle="No fulfillment yet"
      emptyDescription={
        sale
          ? 'Create a shipment or appointment to get the items to the customer.'
          : 'Create a shipment, pickup, or appointment to get the items to the office.'
      }
      emptyAction={onCreate ? <Button onClick={onCreate}>Create fulfillment</Button> : undefined}
    >
      {choice && (
        <>
          <div className={mobile ? 'flex flex-col gap-sm' : 'flex gap-sm [&>*]:flex-1'}>
            <Select
              label="Fulfillment method"
              placeholder="Fulfillment method"
              items={choice.methods}
              value={choice.methodId ?? undefined}
              onValueChange={choice.onMethodChange}
            />
            <Select
              label="Ship to"
              placeholder="Ship to"
              items={choice.shipTo}
              value={choice.shipToId ?? undefined}
              onValueChange={choice.onShipToChange}
            />
          </div>
          {choice.note != null && <p className="text-micro text-muted-foreground">{choice.note}</p>}
        </>
      )}
    </OrderSection>
  )
}
