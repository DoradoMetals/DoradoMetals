'use client'

import * as React from 'react'
import {
  useAdmins,
  useAssignRefiningLots,
  useCancelRefiningOrder,
  useCancelSchedule,
  useCreateFulfillment,
  useDeleteRefiningLot,
  useEmployees,
  useImportRefiningDocument,
  useLocations,
  useLotSearch,
  useOpenCharge,
  useOpenPayout,
  usePatchFulfillment,
  usePatchRefiningLot,
  usePatchRefiningOrder,
  usePayTo,
  useRefiners,
  useRefiningDocuments,
  useRefiningOrder,
  useRefiningPayment,
  useRefiningSpots,
  useSendPayout,
  useSendRefiningOrder,
  useSetFulfillmentStatus,
} from '@dorado/client'
import { Skeleton } from '@dorado/components'
import { Rail, type FulfillmentPatchBody, type RefiningLotPatch } from '@dorado/contracts'

import {
  ChargesCard,
  DocumentsCard,
  DropoffCard,
  FulfillmentCard,
  LinkedFulfillmentCard,
  OrderHeaderCard,
  PaymentCard,
  RefiningItemsCard,
  SettlementCard,
  SpotsCard,
  TotalsCard,
} from '@/app/admin/_src_/orders'

const RAILS = Rail.options

export function AdminRefiningScreen({ id }: { id: string }) {
  const order = useRefiningOrder(id)
  const refiners = useRefiners()
  const admins = useAdmins()
  const locations = useLocations()
  const employees = useEmployees()
  const spots = useRefiningSpots(id)
  const payment = useRefiningPayment(id)
  const documents = useRefiningDocuments(id)

  const patchOrder = usePatchRefiningOrder(id)
  const send = useSendRefiningOrder(id)
  const cancel = useCancelRefiningOrder(id)
  const patchLot = usePatchRefiningLot()
  const deleteLot = useDeleteRefiningLot()
  const assign = useAssignRefiningLots(id)
  const importDocument = useImportRefiningDocument(id)
  const createFulfillment = useCreateFulfillment(id)
  const patchFulfillment = usePatchFulfillment(id)
  const setStatus = useSetFulfillmentStatus(id)
  const cancelSchedule = useCancelSchedule(id)
  const openPayout = useOpenPayout(id)
  const sendPayout = useSendPayout(id)
  const openCharge = useOpenCharge(id)

  const [query, setQuery] = React.useState('')
  const [rail, setRail] = React.useState<Rail | null>(null)
  const [payToId, setPayToId] = React.useState<string | null>(null)
  const found = useLotSearch(query, true)
  const payTo = usePayTo(null)

  if (order.isPending || !order.data) return <ScreenSkeleton />

  const view = order.data
  const isSale = view.direction === 'sell'
  const draft = view.sent_at === null
  const cancelled = view.cancelled_at !== null
  const refinerName = view.refiner?.organization.name ?? 'Unknown refiner'

  const fulfilment =
    [createFulfillment, patchFulfillment, setStatus, cancelSchedule]
      .filter((one) => one.data != null)
      .sort((a, b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0))[0]?.data ?? null
  const scheduled = !!fulfilment?.scheduled_at
  const chosenRail = rail ?? payment.data?.rail ?? null

  return (
    <div className="flex flex-col gap-lg p-md lg:p-xl">
      <OrderHeaderCard
        eyebrow={isSale ? 'SALES ORDER' : 'PURCHASE ORDER'}
        reference={`${isSale ? 'SO' : 'PO'}-${view.number}`}
        cancelled={cancelled}
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
                ordersToDate: view.orders_to_date,
              }
            : {
                kind: 'customer',
                name: refinerName,
                place: '',
                ordersToDate: view.orders_to_date,
              }
        }
        office={{
          locations: locations.data ?? [],
          locationId: view.location_id,
          onChange: (location_id) => patchOrder.mutate({ location_id }),
          disabled: cancelled,
        }}
        assignedToId={view.assigned_to_id}
        admins={admins.data ?? []}
        onAssign={(assigned_to_id) => patchOrder.mutate({ assigned_to_id })}
        cancel={
          cancelled
            ? undefined
            : {
                label: 'Cancel Order',
                onClick: () => cancel.mutate(undefined),
                disabled: cancel.isPending,
              }
        }
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

      <div className="flex flex-col gap-lg lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-lg">
          {!isSale && fulfilment?.linked_order ? (
            <LinkedFulfillmentCard
              shipsFrom={refinerName}
              shipsTo={null}
              linked={fulfilment.linked_order}
              linkedState={null}
            />
          ) : scheduled && fulfilment ? (
            <DropoffCard
              fulfillment={fulfilment}
              locations={locations.data ?? []}
              employees={employees.data ?? []}
              refiners={refiners.data ?? []}
              onCancel={() => cancelSchedule.mutate({ fulfillment_id: fulfilment.fulfillment.id })}
              onReschedule={() =>
                cancelSchedule.mutate({ fulfillment_id: fulfilment.fulfillment.id })
              }
              onAdvance={(status) =>
                setStatus.mutate({ fulfillment_id: fulfilment.fulfillment.id, status })
              }
              pending={setStatus.isPending}
            />
          ) : (
            <FulfillmentCard
              fulfillment={fulfilment}
              methods={fulfilment ? [fulfilment.method] : []}
              services={[]}
              packages={[]}
              handoffs={[]}
              addresses={[]}
              locations={locations.data ?? []}
              employees={employees.data ?? []}
              refiners={refiners.data ?? []}
              onCreate={() => createFulfillment.mutate({ refining_order_id: id })}
              createDisabled={createFulfillment.isPending}
              createReason="A refiner order's handover is a drop-off."
              onSetMethod={() => undefined}
              onPatch={(choices: FulfillmentPatchBody) =>
                fulfilment &&
                patchFulfillment.mutate({ fulfillment_id: fulfilment.fulfillment.id, choices })
              }
              onSchedule={(dropoff) => {
                if (!fulfilment) return
                patchFulfillment.mutate({
                  fulfillment_id: fulfilment.fulfillment.id,
                  choices: {
                    dropoff: {
                      refiner_id: fulfilment.dropoff?.refiner_id ?? view.refiner_id,
                      location_id: fulfilment.dropoff?.location_id ?? null,
                      driver_employee_id: fulfilment.dropoff?.driver_employee_id ?? null,
                      start_time: fulfilment.dropoff?.start_time ?? null,
                      ...dropoff,
                    },
                  },
                })
              }}
              pending={patchFulfillment.isPending}
            />
          )}

          {!draft && (
            <SpotsCard
              spots={(spots.data ?? []).map((row) => ({ metal_id: row.metal_id, bid: row.spot }))}
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
            found={found.data ?? []}
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
              refining={view.totals}
            />
          )}

          {!draft && (
            <PaymentCard
              payment={payment.data ?? null}
              payout={null}
              payTo={payTo.data ?? []}
              rails={RAILS}
              rail={chosenRail}
              onRailChange={setRail}
              payToId={payToId ?? payment.data?.pay_to?.id ?? null}
              onPayToChange={setPayToId}
              candidates={[]}
              matching={false}
              onStartMatching={() => undefined}
              onConfirmMatch={() => undefined}
              onSend={() => {
                if (!chosenRail) return
                if (payment.data?.transfer_id) {
                  sendPayout.mutate(payment.data.transfer_id)
                  return
                }
                if (isSale) openCharge.mutate({ refining_order_id: id, rail: chosenRail })
                else openPayout.mutate({ refining_order_id: id, rail: chosenRail })
              }}
              pending={openPayout.isPending || sendPayout.isPending || openCharge.isPending}
            />
          )}
        </div>

        <div className="flex w-full flex-col gap-lg lg:w-[400px] lg:shrink-0">
          <TotalsCard totals={null} totalLabel="Total payment" refining={view.totals} />
          {isSale && !draft && <SettlementCard order={view} />}
          <DocumentsCard
            documents={documents.data ?? []}
            onImport={(kind, file) => importDocument.mutate({ kind, file })}
          />
        </div>
      </div>
    </div>
  )
}

function ScreenSkeleton() {
  return (
    <div className="flex flex-col gap-lg p-md lg:p-xl">
      <Skeleton className="h-[152px] w-full" />
      <div className="flex flex-col gap-lg lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-lg">
          <Skeleton className="h-[166px] w-full" />
          <Skeleton className="h-[338px] w-full" />
        </div>
        <div className="flex w-full flex-col gap-lg lg:w-[400px] lg:shrink-0">
          <Skeleton className="h-[264px] w-full" />
          <Skeleton className="h-[113px] w-full" />
        </div>
      </div>
    </div>
  )
}
