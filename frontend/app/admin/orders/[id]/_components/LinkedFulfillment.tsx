import * as React from 'react'
import type { LinkedOrder } from '@dorado/contracts'
import { Badge, cn } from '@dorado/components'

import { Facts } from './Facts'
import { OrderSection, type SectionContent } from './OrderSection'

export type LinkedSale = LinkedOrder & {
  customer_name?: string | null
  city?: string | null
  stage?: string | null
}

export type LinkedFulfillmentProps = {
  orders: LinkedSale[]
  shipsFrom?: string | null
  method?: string
  layout?: 'desktop' | 'mobile'
  content?: SectionContent
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onRetry?: () => void
  onOpenOrder?: (orderId: string) => void
}

export function LinkedFulfillment({
  orders,
  shipsFrom,
  method = 'Drop ship',
  layout = 'desktop',
  content = 'loaded',
  open,
  onOpenChange,
  onRetry,
  onOpenOrder,
}: LinkedFulfillmentProps) {
  const mobile = layout === 'mobile'
  const shown: SectionContent = content === 'loaded' && orders.length === 0 ? 'empty' : content
  return (
    <OrderSection
      title="Fulfillment"
      layout={layout}
      content={shown}
      open={open}
      onOpenChange={onOpenChange}
      onRetry={onRetry}
      badge={
        shown === 'loaded' ? (
          <Badge intent="neutral" variant="outline">
            {method}
          </Badge>
        ) : undefined
      }
      emptyTitle="No linked orders"
      emptyDescription="Customer orders that ship through this one show here."
      errorTitle="Couldn’t load linked orders"
    >
      <Facts layout="desktop" facts={[{ label: 'Ships from', value: shipsFrom }]} />
      <div className="flex flex-col">
        <span className="pb-2xs text-micro text-muted-foreground">Sales orders</span>
        <ul className="flex flex-col">
          {orders.map((order) => {
            const who = [order.customer_name, order.city].filter(Boolean).join(' · ')
            return (
              <li key={order.id} className="border-t border-border">
                <button
                  type="button"
                  onClick={() => onOpenOrder?.(order.id)}
                  className={cn(
                    'flex w-full gap-x-lg py-sm text-left',
                    mobile ? 'flex-wrap items-start justify-between gap-y-3xs' : 'items-center'
                  )}
                >
                  <span className="text-small font-medium text-foreground">{order.reference}</span>
                  <span
                    className={cn(
                      'text-small font-medium text-foreground',
                      mobile ? 'order-3 basis-full' : 'flex-1'
                    )}
                  >
                    {who}
                  </span>
                  <span className="text-small text-muted-foreground">{order.stage}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
      <p className="text-micro text-muted-foreground">
        Ships from the refiner to each customer. Tracking lives on each sales order.
      </p>
    </OrderSection>
  )
}
