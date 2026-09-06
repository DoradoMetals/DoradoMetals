'use client'

import * as React from 'react'
import {
  useAdmins,
  useAssignRefiningLots,
  useDeleteRefiningLot,
  usePatchRefiningLot,
  usePatchRefiningOrder,
  useRefiners,
  useRefiningOrder,
  useSendRefiningOrder,
} from '@dorado/client'
import { Skeleton } from '@dorado/components'
import type { RefiningLotPatch } from '@dorado/contracts'

import {
  ChargesCard,
  DocumentsCard,
  LinkedFulfillmentCard,
  OrderHeaderCard,
  RefiningItemsCard,
  SettlementCard,
  SpotsCard,
  TotalsCard,
} from '@/app/admin/_src_/orders'

// We SELL lots to a refiner (`direction: 'sell'`) or we BUY bullion from one
// (`direction: 'buy'`). A draft is an order that has not been sent; sending it
// is what the refiner sees, and it replaces Finalize - refiner orders have none.
export function AdminRefiningScreen({ id }: { id: string }) {
  const order = useRefiningOrder(id)
  const refiners = useRefiners()
  const admins = useAdmins()

  const patchOrder = usePatchRefiningOrder(id)
  const send = useSendRefiningOrder(id)
  const patchLot = usePatchRefiningLot()
  const deleteLot = useDeleteRefiningLot()
  const assign = useAssignRefiningLots(id)

  const [query, setQuery] = React.useState('')

  if (order.isPending || !order.data) return <ScreenSkeleton />

  const view = order.data
  const isSale = view.direction === 'sell'
  const draft = view.sent_at === null
  const reference = `${isSale ? 'SO' : 'PO'}-${view.number}`
  const refinerName = view.refiner?.organization.name ?? 'Unknown refiner'


  return (
    <div className="flex flex-col gap-lg p-xl">
      <OrderHeaderCard
        eyebrow={isSale ? 'SALES ORDER' : 'PURCHASE ORDER'}
        reference={reference}
        party={
          draft
            ? {
                kind: 'refiner',
                refinerId: view.refiner_id,
                refiners: (refiners.data ?? []).map((one) => ({
                  id: one.id,
                  name: one.organization.name ?? 'Unnamed refiner',
                })),
                onRefinerChange: (refiner_id) => patchOrder.mutate({ refiner_id }),
                locked: false,
                place: '',
              }
            : {
                kind: 'customer',
                name: refinerName,
                place: '',
                ordersToDate: null,
              }
        }
        assignedToId={view.assigned_to_id}
        admins={admins.data ?? []}
        onAssign={(assigned_to_id) => patchOrder.mutate({ assigned_to_id })}
        cancel={{
          label: 'Cancel Order',
          onClick: () => undefined,
          disabled: true,
          reason: 'A refiner order has no cancel route yet',
        }}
        primary={
          draft
            ? {
                label: 'Send to Refiner',
                onClick: () => send.mutate(undefined),
                disabled: !view.refiner_id || view.lots.length === 0 || send.isPending,
                reason: view.refiner_id ? undefined : 'Choose a refiner first',
              }
            : { label: 'Sent', onClick: () => undefined, disabled: true }
        }
      />

      <div className="flex items-start gap-lg">
        <div className="flex min-w-0 flex-1 flex-col gap-lg">
          {isSale ? (
            <DropoffPlaceholder />
          ) : (
            <LinkedFulfillmentCard
              shipsFrom={refinerName}
              shipsTo={null}
              linkedReference={view.lots[0]?.order_number ? `SO-${view.lots[0].order_number}` : null}
              linkedHref={view.lots[0]?.order_id ? `/admin/orders/${view.lots[0].order_id}` : null}
              linkedState={null}
            />
          )}

          {!draft && (
            <SpotsCard
              spots={[]}
              live={[]}
              locked
              canToggle={false}
              onToggleLock={() => undefined}
              onSetBid={() => undefined}
            />
          )}

          <RefiningItemsCard
            lots={view.lots}
            kindLabel={isSale ? 'Lots' : 'Items'}
            query={query}
            onQueryChange={setQuery}
            onEdit={(lot_id, patch: RefiningLotPatch) => patchLot.mutate({ lot_id, patch })}
            onDelete={(lot_id) => deleteLot.mutate(lot_id)}
            onAdd={(lot_ids) => assign.mutate({ lot_ids })}
            pending={patchLot.isPending || deleteLot.isPending || assign.isPending}
          />

          {!draft && (
            <ChargesCard
              totals={null}
              showShipping={false}
              showPoolOz={isSale}
              chargeLabel="Payment Charge"
              poolOz={view.pool_oz}
              refinerFee={view.fee}
            />
          )}
        </div>

        <div className="flex w-[400px] shrink-0 flex-col gap-lg">
          <TotalsCard totals={null} totalLabel="Total payment" />
          {isSale && !draft && <SettlementCard order={view} />}
          <DocumentsCard documents={[]} />
        </div>
      </div>
    </div>
  )
}

// Drop-off is the refiner sales order's handover - we drive sealed lots to the
// refinery. The table, the contract and the card exist; the read, the patch arm
// and the schedule route do not, so nothing can be shown from the API yet.
function DropoffPlaceholder() {
  return (
    <section className="rounded-lg border border-border bg-card p-md">
      <p className="text-body font-medium text-foreground">Fulfillment · Drop-off</p>
      <p className="pt-2xs text-small text-muted-foreground">
        Drop-offs have no read on the API yet, so nothing about this handover can be shown here.
      </p>
    </section>
  )
}

function ScreenSkeleton() {
  return (
    <div className="flex flex-col gap-lg p-xl">
      <Skeleton className="h-[152px] w-full" />
      <div className="flex gap-lg">
        <div className="flex flex-1 flex-col gap-lg">
          <Skeleton className="h-[166px] w-full" />
          <Skeleton className="h-[338px] w-full" />
        </div>
        <div className="flex w-[400px] shrink-0 flex-col gap-lg">
          <Skeleton className="h-[264px] w-full" />
          <Skeleton className="h-[113px] w-full" />
        </div>
      </div>
    </div>
  )
}
