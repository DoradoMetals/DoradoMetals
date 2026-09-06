'use client'

import { Badge, Button, Link } from '@dorado/components'
import type { LinkedOrder } from '@dorado/contracts'

import { CardFact, OrderCard } from './OrderCard'
import { DASH } from './format'

export type LinkedFulfillmentCardProps = {
  shipsFrom: string | null
  shipsTo: string | null
  linked: LinkedOrder | null
  linkedState: string | null
}

// A drop-shipped order: the refiner ships straight to the customer, so this
// order has no parcel of its own. Tracking lives on the linked order and this
// card is the pointer to it.
export function LinkedFulfillmentCard({
  shipsFrom,
  shipsTo,
  linked,
  linkedState,
}: LinkedFulfillmentCardProps) {
  const linkedReference = linked?.reference ?? null
  const linkedHref = linked ? `/admin/orders/${linked.id}` : null
  return (
    <OrderCard
      title="Fulfillment · Drop ship"
      summary={linkedReference ?? DASH}
      right={
        <Badge intent="neutral" variant="outline">
          Drop ship
        </Badge>
      }
    >
      <div className="flex w-full items-start justify-between gap-md">
        <CardFact label="Ships from" value={shipsFrom ?? DASH} />
        <CardFact label="Ships to" value={shipsTo ?? DASH} />
        <CardFact label="Linked order" value={linkedReference ?? DASH} />
        <CardFact label="Shipment" value={linkedState ?? DASH} align="end" />
      </div>
      {linkedHref && linkedReference && (
        <div className="flex w-full justify-end">
          <Button variant="secondary" asChild>
            <Link href={linkedHref}>Open {linkedReference}</Link>
          </Button>
        </div>
      )}
    </OrderCard>
  )
}
