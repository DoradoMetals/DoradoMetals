'use client'

import * as React from 'react'
import NextLink from 'next/link'
import { Badge, Divider, Link, cn } from '@dorado/components'
import type { RefiningLinkedOrder } from '@dorado/contracts'

import { protectedRoutes } from '@/shared/types/routes'
import { RefinerCardShell, type RefinerCardContent } from './RefinerCardShell'

export type LinkedFulfillmentProps = {
  orders: RefiningLinkedOrder[]
  content?: Exclude<RefinerCardContent, 'empty'>
  layout?: 'desktop' | 'mobile'
  method?: string | null
  shipsFrom?: string | null
  onRetry?: () => void
  className?: string
}

export function LinkedFulfillment({
  orders,
  content = 'loaded',
  layout = 'desktop',
  method,
  shipsFrom,
  onRetry,
  className,
}: LinkedFulfillmentProps) {
  const mobile = layout === 'mobile'
  const shown: RefinerCardContent = content === 'loaded' && orders.length === 0 ? 'empty' : content
  return (
    <section data-layout={layout} aria-label="Fulfillment" className={className}>
      <RefinerCardShell
        label="Fulfillment"
        content={shown}
        actions={
          method ? (
            <Badge intent="neutral" variant="outline">
              {method}
            </Badge>
          ) : undefined
        }
        emptyTitle="No linked orders"
        emptyDescription="Customer orders that ship through this one show here."
        errorTitle="Couldn’t load linked orders"
        onRetry={onRetry}
      >
        {shipsFrom ? (
          <div className="flex gap-md">
            <div className="flex flex-col gap-3xs">
              <span className="text-micro text-muted-foreground">Ships from</span>
              <span className="text-small font-medium text-foreground">{shipsFrom}</span>
            </div>
          </div>
        ) : null}
        <div className="flex flex-col">
          <span className="text-micro text-muted-foreground">Sales orders</span>
          <ul className="flex flex-col">
            {orders.map((order) => (
              <li key={order.id} className="flex flex-col">
                <Divider />
                <div
                  className={cn(
                    'flex py-xs-plus',
                    mobile ? 'flex-col gap-2xs' : 'flex-row items-center gap-md'
                  )}
                >
                  <Link asChild intent="neutral">
                    <NextLink href={`${protectedRoutes.adminOrders.path}/${order.id}`}>
                      {order.reference}
                    </NextLink>
                  </Link>
                  <span className="min-w-0 flex-1 text-small font-medium text-foreground">
                    {[order.customer_name, order.city].filter(Boolean).join(' · ')}
                  </span>
                  {order.stage ? (
                    <span className="text-small font-medium text-muted-foreground">
                      {order.stage}
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-micro text-muted-foreground">
          Ships from the refiner to each customer. Tracking lives on each sales order.
        </p>
      </RefinerCardShell>
    </section>
  )
}
