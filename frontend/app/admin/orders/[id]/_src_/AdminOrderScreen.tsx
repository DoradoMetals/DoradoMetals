'use client'

import * as React from 'react'
import {
  useAdmins,
  useCancelLabel,
  useCarrierServices,
  useConfirmMatch,
  useConversation,
  useCustomerTimeline,
  useDeleteOrderLot,
  useFinalizeOrder,
  useFulfillmentMethods,
  useHandoffs,
  useLiveSpots,
  useMatchCandidates,
  useOpenCharge,
  useOpenPayout,
  useOrder,
  useOrderDocuments,
  useOrderFulfillment,
  useOrderShipments,
  useOrderSpots,
  usePackages,
  usePatchFulfillment,
  usePatchOrder,
  usePatchOrderLot,
  usePatchShipment,
  usePayTo,
  usePaymentView,
  useProfitBreakdown,
  usePutOrderSpots,
  useReopenOrder,
  useSchedulePickup,
  useScheduleDirect,
  useSendPayout,
  useSetFulfillmentMethod,
  useSetFulfillmentStatus,
  useCancelSchedule,
  useCreateOrderLot,
  useAdminUser,
} from '@dorado/client'
import { Rail, type FulfillmentPatchBody, type OrderLotPatch } from '@dorado/contracts'
import { Skeleton } from '@dorado/components'

import {
  AppointmentCard,
  ChargesCard,
  ChatCard,
  DocumentsCard,
  DropoffCard,
  FulfillmentCard,
  LotsCard,
  OrderHeaderCard,
  PaymentCard,
  PickupCard,
  ProfitBreakdownCard,
  ShipmentCard,
  SpotsCard,
  TotalsCard,
  place,
} from '@/app/admin/_src_/orders'

const RAILS = Rail.options

export function AdminOrderScreen({ id }: { id: string }) {
  const order = useOrder(id)
  const spots = useOrderSpots(id)
  const live = useLiveSpots()
  const documents = useOrderDocuments(id)
  const fulfillment = useOrderFulfillment(id)
  const shipments = useOrderShipments(id)
  const payment = usePaymentView(id)
  const admins = useAdmins()

  const direction = order.data?.order.direction ?? 'purchase'
  const userId = order.data?.order.user_id ?? null

  const customer = useAdminUser(userId)
  const timeline = useCustomerTimeline(userId)
  const conversation = useConversation(userId)
  const payTo = usePayTo(userId)
  const candidates = useMatchCandidates(id)
  const profit = useProfitBreakdown(id, { enabled: direction === 'purchase' })
  const methods = useFulfillmentMethods(direction)
  const services = useCarrierServices()
  const packages = usePackages()
  const handoffs = useHandoffs()

  const patchOrder = usePatchOrder(id)
  const finalize = useFinalizeOrder(id)
  const reopen = useReopenOrder(id)
  const putSpots = usePutOrderSpots(id)
  const createLot = useCreateOrderLot(id)
  const patchLot = usePatchOrderLot(id)
  const deleteLot = useDeleteOrderLot(id)
  const openPayout = useOpenPayout(id)
  const sendPayout = useSendPayout(id)
  const openCharge = useOpenCharge(id)
  const confirmMatch = useConfirmMatch(id)
  const setMethod = useSetFulfillmentMethod(id)
  const patchFulfillment = usePatchFulfillment(id)
  const schedulePickup = useSchedulePickup(id)
  const scheduleDirect = useScheduleDirect(id)
  const setStatus = useSetFulfillmentStatus(id)
  const cancelSchedule = useCancelSchedule(id)
  const patchShipment = usePatchShipment(id)
  const cancelLabel = useCancelLabel(id)

  const [rail, setRail] = React.useState<Rail | null>(null)
  const [payToId, setPayToId] = React.useState<string | null>(null)
  const [matching, setMatching] = React.useState(false)

  if (order.isPending || !order.data) return <ScreenSkeleton />

  const view = order.data
  const actions = view.actions
  const cancelled = (view.order.status ?? '').toLowerCase() === 'cancelled'
  const isSale = direction === 'sale'
  const reference = `${isSale ? 'SO' : 'PO'}-${view.order.number}`
  const fulfilment = fulfillment.data ?? null
  const category = fulfilment?.method.category ?? null
  const scheduled = !!fulfilment?.scheduled_at
  const parcel = shipments.data?.find((one) => one.shipment.direction !== 'Return') ?? null
  const returned = shipments.data?.find((one) => one.shipment.direction === 'Return') ?? null

  const chosenRail = rail ?? payment.data?.rail ?? null
  const chosenPayTo = payToId ?? payment.data?.pay_to?.id ?? null

  return (
    <div className="flex flex-col gap-lg p-xl">
      <OrderHeaderCard
        eyebrow={isSale ? 'SALES ORDER' : 'PURCHASE ORDER'}
        reference={reference}
        cancelled={cancelled}
        party={{
          kind: 'customer',
          name: view.user?.name ?? view.user?.email ?? 'Unknown customer',
          place: place(view.address?.city ?? null, view.address?.state ?? null),
          ordersToDate: null,
        }}
        assignedToId={view.order.assigned_to_id}
        admins={admins.data ?? []}
        assignDisabled={cancelled}
        onAssign={(assigned_to_id) => patchOrder.mutate({ assigned_to_id })}
        cancel={
          actions.cancel
            ? { label: 'Cancel Order', onClick: () => undefined, disabled: true, reason: 'Cancelling needs a return service and package' }
            : undefined
        }
        primary={{
          label: actions.finalize ? 'Finalize' : 'Finalized',
          onClick: () => finalize.mutate(undefined),
          disabled: !actions.finalize,
          reason: actions.finalize_blocked_by.join(' · ') || undefined,
        }}
        reopen={
          actions.reopen ? { label: 'Reopen Order', onClick: () => reopen.mutate(undefined) } : undefined
        }
      />

      <div className="flex items-start gap-lg">
        <div className="flex min-w-0 flex-1 flex-col gap-lg">
          {cancelled && returned ? (
            <ShipmentCard
              shipment={returned}
              onSaveTracking={(tracking_number) =>
                patchShipment.mutate({ shipment_id: returned.shipment.id, patch: { tracking_number } })
              }
              onCancelLabel={() => cancelLabel.mutate({ shipment_id: returned.shipment.id })}
              pending={patchShipment.isPending}
            />
          ) : scheduled && category === 'SHIPMENT' && parcel ? (
            <ShipmentCard
              shipment={parcel}
              onSaveTracking={(tracking_number) =>
                patchShipment.mutate({ shipment_id: parcel.shipment.id, patch: { tracking_number } })
              }
              onCancelLabel={() => cancelLabel.mutate({ shipment_id: parcel.shipment.id })}
              services={(services.data ?? []).map((one) => ({ id: one.id, name: one.name }))}
              pending={patchShipment.isPending}
            />
          ) : scheduled && category === 'PICKUP' && fulfilment ? (
            <PickupCard
              fulfillment={fulfilment}
              onCancel={() => cancelSchedule.mutate({ fulfillment_id: fulfilment.fulfillment.id })}
              onReschedule={() => cancelSchedule.mutate({ fulfillment_id: fulfilment.fulfillment.id })}
              onAdvance={(status) =>
                setStatus.mutate({ fulfillment_id: fulfilment.fulfillment.id, status })
              }
              pending={setStatus.isPending}
            />
          ) : scheduled && category === 'DIRECT' && fulfilment ? (
            <AppointmentCard
              fulfillment={fulfilment}
              onCancel={() => cancelSchedule.mutate({ fulfillment_id: fulfilment.fulfillment.id })}
              onReschedule={() => cancelSchedule.mutate({ fulfillment_id: fulfilment.fulfillment.id })}
              onAdvance={(status) =>
                setStatus.mutate({ fulfillment_id: fulfilment.fulfillment.id, status })
              }
              pending={setStatus.isPending}
            />
          ) : scheduled && category === 'DROPOFF' && fulfilment ? (
            <DropoffCard
              fulfillment={fulfilment}
              onCancel={() => cancelSchedule.mutate({ fulfillment_id: fulfilment.fulfillment.id })}
              onReschedule={() => cancelSchedule.mutate({ fulfillment_id: fulfilment.fulfillment.id })}
              onAdvance={(status) =>
                setStatus.mutate({ fulfillment_id: fulfilment.fulfillment.id, status })
              }
              pending={setStatus.isPending}
            />
          ) : (
            <FulfillmentCard
              fulfillment={fulfilment}
              methods={methods.data ?? []}
              services={services.data ?? []}
              packages={packages.data ?? []}
              handoffs={handoffs.data ?? []}
              addresses={view.address ? [view.address] : []}
              createReason="An order gets its fulfillment at placement; there is no route to add one later."
              createDisabled
              onSetMethod={(method_id) =>
                fulfilment &&
                setMethod.mutate({ fulfillment_id: fulfilment.fulfillment.id, method_id })
              }
              onPatch={(choices: FulfillmentPatchBody) =>
                fulfilment &&
                patchFulfillment.mutate({ fulfillment_id: fulfilment.fulfillment.id, choices })
              }
              onSchedule={() => {
                if (!fulfilment) return
                const fulfillment_id = fulfilment.fulfillment.id
                if (fulfilment.method.category === 'PICKUP') {
                  schedulePickup.mutate({
                    fulfillment_id,
                    pickup: {
                      pickup_address_id: fulfilment.pickup?.pickup_address_id ?? null,
                      start_time: fulfilment.pickup?.start_time ?? null,
                    },
                  })
                  return
                }
                scheduleDirect.mutate({
                  fulfillment_id,
                  direct: {
                    location_id: fulfilment.direct?.location_id ?? null,
                    start_time: fulfilment.direct?.start_time ?? null,
                  },
                })
              }}
              pending={patchFulfillment.isPending || setMethod.isPending}
            />
          )}

          <SpotsCard
            spots={spots.data ?? []}
            live={live.data ?? []}
            locked={view.order.spots_locked}
            canToggle
            toggleDisabled={!actions.finalize && view.order.spots_locked}
            onToggleLock={(lock) => putSpots.mutate({ lock })}
            onSetBid={(metal_id, bid) => putSpots.mutate({ set: [{ metal_id, bid }] })}
            pending={putSpots.isPending}
          />

          <LotsCard
            kind={isSale ? 'bullion' : 'scrap'}
            lots={view.lots}
            onEdit={(lot_id, patch: OrderLotPatch) => patchLot.mutate({ lot_id, patch })}
            onNew={() => createLot.mutate({})}
            onDelete={(ids) => ids.forEach((lot_id) => deleteLot.mutate(lot_id))}
            onBatch={() => undefined}
            pending={patchLot.isPending || deleteLot.isPending || createLot.isPending}
          />

          <ChargesCard
            totals={view.totals}
            showShipping={category === 'SHIPMENT'}
            showPoolOz={false}
            chargeLabel={isSale ? 'Payment Charge' : 'Payout Charge'}
          />

          <PaymentCard
            payment={payment.data ?? null}
            payout={view.payout}
            payTo={payTo.data ?? []}
            rails={RAILS}
            rail={chosenRail}
            onRailChange={setRail}
            payToId={chosenPayTo}
            onPayToChange={setPayToId}
            candidates={candidates.data ?? []}
            matching={matching}
            onStartMatching={() => setMatching(true)}
            onConfirmMatch={(inbound_id) => {
              confirmMatch.mutate({ inbound_id, order_id: id })
              setMatching(false)
            }}
            onSend={() => {
              if (!chosenRail) return
              if (payment.data?.transfer_id) {
                sendPayout.mutate(payment.data.transfer_id)
                return
              }
              if (isSale) openCharge.mutate({ order_id: id, rail: chosenRail })
              else openPayout.mutate({ order_id: id, rail: chosenRail })
            }}
            sendDisabled={actions.finalize}
            sendReason={
              actions.finalize ? 'Finalize the order before the money moves.' : null
            }
            pending={openPayout.isPending || sendPayout.isPending || openCharge.isPending}
          />
        </div>

        <div className="flex w-[400px] shrink-0 flex-col gap-lg">
          <TotalsCard totals={view.totals} totalLabel={isSale ? 'Total due' : 'Total payout'} />
          {direction === 'purchase' && (
            <ProfitBreakdownCard breakdown={profit.data ?? null} loading={profit.isPending} />
          )}
          <DocumentsCard documents={documents.data ?? []} />
          <ChatCard
            phone={customer.data?.phone_number ?? null}
            messages={conversation.data ?? []}
            timeline={timeline.data ?? []}
          />
        </div>
      </div>
    </div>
  )
}

function ScreenSkeleton() {
  return (
    <div className="flex flex-col gap-lg p-xl">
      <Skeleton className="h-[150px] w-full" />
      <div className="flex gap-lg">
        <div className="flex flex-1 flex-col gap-lg">
          <Skeleton className="h-[212px] w-full" />
          <Skeleton className="h-[138px] w-full" />
          <Skeleton className="h-[415px] w-full" />
        </div>
        <div className="flex w-[400px] shrink-0 flex-col gap-lg">
          <Skeleton className="h-[264px] w-full" />
          <Skeleton className="h-[213px] w-full" />
        </div>
      </div>
    </div>
  )
}
