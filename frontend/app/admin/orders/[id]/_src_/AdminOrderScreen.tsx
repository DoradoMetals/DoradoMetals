'use client'

import * as React from 'react'
import {
  useAddFunds,
  useAdmins,
  useAdminUser,
  useCancelLabel,
  useCancelOrder,
  useCancelSchedule,
  useCarrierServices,
  useConfirmMatch,
  useConversation,
  useCreateFulfillment,
  useCreateOrderLot,
  useCreateRefiningOrder,
  useCreateRefiningSale,
  useCustomerTimeline,
  useDeleteOrderLot,
  useEmployees,
  useFinalizeOrder,
  useFulfillmentMethods,
  useHandoffs,
  useImportOrderDocument,
  useLiveSpots,
  useLocations,
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
  useRecordShipmentTracking,
  useRefiners,
  useScheduleDirect,
  useSchedulePickup,
  useSendOrderDocument,
  useSendPayout,
  useSendSms,
  useSetFulfillmentMethod,
  useSetFulfillmentStatus,
  useSupplyOrder,
} from '@dorado/client'
import {
  Rail,
  type Action,
  type FulfillmentPatchBody,
  type OrderLotPatch,
  type SmsMedia,
} from '@dorado/contracts'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Skeleton,
} from '@dorado/components'

import { findAction, hasAction } from '@/shared/utils/actions'

import {
  AppointmentCard,
  ChargesCard,
  ChatCard,
  DocumentsCard,
  DropoffCard,
  FulfillmentCard,
  LinkedFulfillmentCard,
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
  const locations = useLocations()
  const employees = useEmployees()
  const refiners = useRefiners()

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
  const cancel = useCancelOrder(id)
  const putSpots = usePutOrderSpots(id)
  const createLot = useCreateOrderLot(id)
  const patchLot = usePatchOrderLot(id)
  const deleteLot = useDeleteOrderLot(id)
  const batch = useCreateRefiningOrder()
  const createSale = useCreateRefiningSale(id)
  const supply = useSupplyOrder(id)
  const addFunds = useAddFunds(id)
  const openPayout = useOpenPayout(id)
  const sendPayout = useSendPayout(id)
  const openCharge = useOpenCharge(id)
  const confirmMatch = useConfirmMatch(id)
  const createFulfillment = useCreateFulfillment(id)
  const setMethod = useSetFulfillmentMethod(id)
  const patchFulfillment = usePatchFulfillment(id)
  const schedulePickup = useSchedulePickup(id)
  const scheduleDirect = useScheduleDirect(id)
  const setStatus = useSetFulfillmentStatus(id)
  const cancelSchedule = useCancelSchedule(id)
  const patchShipment = usePatchShipment(id)
  const recordTracking = useRecordShipmentTracking(id)
  const cancelLabel = useCancelLabel(id)
  const sendDocument = useSendOrderDocument(id)
  const importDocument = useImportOrderDocument(id)
  const sendSms = useSendSms(userId)

  const [rail, setRail] = React.useState<Rail | null>(null)
  const [payToId, setPayToId] = React.useState<string | null>(null)
  const [matching, setMatching] = React.useState(false)
  const [batchRefiner, setBatchRefiner] = React.useState<string | null>(null)
  const [confirming, setConfirming] = React.useState<{ reason: string; run: () => void } | null>(
    null
  )

  const runAction = (action: Action | undefined, run: () => void) => {
    if (action?.confirm) {
      setConfirming({ reason: action.confirm, run })
      return
    }
    run()
  }

  if (order.isPending || !order.data) return <ScreenSkeleton />

  const view = order.data
  const actions = view.actions
  const cancelled = view.order.cancelled_at !== null
  const isSale = direction === 'sale'
  const fulfilment = fulfillment.data ?? null
  const category = fulfilment?.method.category ?? null
  const scheduled = !!fulfilment?.scheduled_at
  const parcel = shipments.data?.find((one) => one.shipment.direction !== 'Return') ?? null
  const returned = shipments.data?.find((one) => one.shipment.direction === 'Return') ?? null

  const chosenRail = rail ?? payment.data?.rail ?? null
  const chosenPayTo = payToId ?? payment.data?.pay_to?.id ?? null
  const refinerItems = (refiners.data ?? []).map((one) => ({
    id: one.id,
    name: one.organization.name ?? 'Unnamed refiner',
  }))

  const finalizeAction = findAction(actions, 'finalize')
  const sendPaymentAction = findAction(actions, 'send_payment')
  const supplyAction = findAction(actions, 'supply')
  const refiningSaleAction = findAction(actions, 'refining_sale')
  const addFundsAction = findAction(actions, 'add_funds')
  const notFinalized = hasAction(actions, 'finalize')

  return (
    <div className="flex flex-col gap-lg p-md lg:p-xl">
      <OrderHeaderCard
        eyebrow={isSale ? 'SALES ORDER' : 'PURCHASE ORDER'}
        reference={view.reference}
        state={view.state}
        cancelled={cancelled}
        party={{
          kind: 'customer',
          name: view.user?.name ?? 'Unknown customer',
          place: place(view.address?.city ?? null, view.address?.state ?? null),
          ordersToDate: view.user?.orders_to_date ?? null,
        }}
        assignedToId={view.order.assigned_to_id}
        admins={admins.data ?? []}
        assignDisabled={cancelled}
        onAssign={(assigned_to_id) => patchOrder.mutate({ assigned_to_id })}
        cancel={
          hasAction(actions, 'cancel')
            ? {
                label: 'Cancel Order',
                onClick: () => cancel.mutate({}),
                disabled: cancel.isPending,
              }
            : undefined
        }
        primary={{
          label: finalizeAction ? 'Finalize' : 'Finalized',
          onClick: () => runAction(finalizeAction, () => finalize.mutate(undefined)),
          disabled: !finalizeAction,
        }}
        reopen={
          hasAction(actions, 'reopen')
            ? { label: 'Reopen Order', onClick: () => patchOrder.mutate({ cancelled_at: null }) }
            : undefined
        }
      />

      <div className="flex flex-col gap-lg lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-lg">
          {fulfilment?.linked_order ? (
            <LinkedFulfillmentCard
              shipsFrom={parcel?.shipment.shipper_address_id ?? null}
              shipsTo={parcel?.shipment.recipient_address_id ?? null}
              linked={fulfilment.linked_order}
              linkedState={parcel?.tracking_status ?? null}
            />
          ) : cancelled && returned ? (
            <ShipmentCard
              shipment={returned}
              onSaveTracking={(tracking_number) =>
                recordTracking.mutate({ shipment_id: returned.shipment.id, tracking_number })
              }
              onSetCarrier={(carrier_service_id) =>
                patchShipment.mutate({
                  shipment_id: returned.shipment.id,
                  patch: { carrier_service_id },
                })
              }
              onCancelLabel={() => cancelLabel.mutate({ shipment_id: returned.shipment.id })}
              services={(services.data ?? []).map((one) => ({ id: one.id, name: one.name }))}
              pending={patchShipment.isPending || recordTracking.isPending}
            />
          ) : scheduled && category === 'SHIPMENT' && parcel ? (
            <ShipmentCard
              shipment={parcel}
              onSaveTracking={(tracking_number) =>
                recordTracking.mutate({ shipment_id: parcel.shipment.id, tracking_number })
              }
              onSetCarrier={(carrier_service_id) =>
                patchShipment.mutate({
                  shipment_id: parcel.shipment.id,
                  patch: { carrier_service_id },
                })
              }
              onCancelLabel={() => cancelLabel.mutate({ shipment_id: parcel.shipment.id })}
              services={(services.data ?? []).map((one) => ({ id: one.id, name: one.name }))}
              pending={patchShipment.isPending || recordTracking.isPending}
            />
          ) : scheduled && category === 'PICKUP' && fulfilment ? (
            <PickupCard
              fulfillment={fulfilment}
              locations={locations.data ?? []}
              employees={employees.data ?? []}
              onCancel={() => cancelSchedule.mutate({ fulfillment_id: fulfilment.fulfillment.id })}
              onReschedule={() =>
                cancelSchedule.mutate({ fulfillment_id: fulfilment.fulfillment.id })
              }
              onAdvance={(status) =>
                setStatus.mutate({ fulfillment_id: fulfilment.fulfillment.id, status })
              }
              pending={setStatus.isPending}
            />
          ) : scheduled && category === 'DIRECT' && fulfilment ? (
            <AppointmentCard
              fulfillment={fulfilment}
              locations={locations.data ?? []}
              employees={employees.data ?? []}
              onCancel={() => cancelSchedule.mutate({ fulfillment_id: fulfilment.fulfillment.id })}
              onReschedule={() =>
                cancelSchedule.mutate({ fulfillment_id: fulfilment.fulfillment.id })
              }
              onAdvance={(status) =>
                setStatus.mutate({ fulfillment_id: fulfilment.fulfillment.id, status })
              }
              pending={setStatus.isPending}
            />
          ) : scheduled && category === 'DROPOFF' && fulfilment ? (
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
              methods={methods.data ?? []}
              services={services.data ?? []}
              packages={packages.data ?? []}
              handoffs={handoffs.data ?? []}
              addresses={view.address ? [view.address] : []}
              cover={parcel?.shipment ?? null}
              locations={locations.data ?? []}
              employees={employees.data ?? []}
              refiners={refiners.data ?? []}
              onCreate={() => createFulfillment.mutate({ order_id: id })}
              createDisabled={createFulfillment.isPending}
              onSetMethod={(method_id) =>
                fulfilment &&
                setMethod.mutate({ fulfillment_id: fulfilment.fulfillment.id, method_id })
              }
              onPatch={(choices: FulfillmentPatchBody) =>
                fulfilment &&
                patchFulfillment.mutate({ fulfillment_id: fulfilment.fulfillment.id, choices })
              }
              onSchedule={(dropoff) => {
                if (!fulfilment) return
                const fulfillment_id = fulfilment.fulfillment.id
                if (fulfilment.method.category === 'PICKUP') {
                  schedulePickup.mutate({
                    fulfillment_id,
                    pickup: {
                      pickup_address_id: fulfilment.pickup?.pickup_address_id ?? null,
                      location_id: fulfilment.pickup?.location_id ?? null,
                      assigned_employee_id: fulfilment.pickup?.assigned_employee_id ?? null,
                      start_time: fulfilment.pickup?.start_time ?? null,
                    },
                  })
                  return
                }
                if (fulfilment.method.category === 'DROPOFF') {
                  patchFulfillment.mutate({
                    fulfillment_id,
                    choices: {
                      dropoff: {
                        refiner_id: fulfilment.dropoff?.refiner_id ?? null,
                        location_id: fulfilment.dropoff?.location_id ?? null,
                        driver_employee_id: fulfilment.dropoff?.driver_employee_id ?? null,
                        start_time: fulfilment.dropoff?.start_time ?? null,
                        ...dropoff,
                      },
                    },
                  })
                  return
                }
                scheduleDirect.mutate({
                  fulfillment_id,
                  direct: {
                    location_id: fulfilment.direct?.location_id ?? null,
                    assigned_employee_id: fulfilment.direct?.assigned_employee_id ?? null,
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
            canToggle={hasAction(actions, 'lock_spots') || hasAction(actions, 'unlock_spots')}
            toggleDisabled={
              view.order.spots_locked
                ? !hasAction(actions, 'unlock_spots')
                : !hasAction(actions, 'lock_spots')
            }
            onToggleLock={(lock) => putSpots.mutate({ lock })}
            onSetBid={(metal_id, bid) => putSpots.mutate({ set: [{ metal_id, bid }] })}
            pending={putSpots.isPending}
          />

          <LotsCard
            kind={isSale ? 'bullion' : 'scrap'}
            lots={view.lots}
            readOnly={!hasAction(actions, 'edit_lots')}
            refiners={refinerItems}
            refinerId={batchRefiner}
            onRefinerChange={setBatchRefiner}
            onEdit={(lot_id, patch: OrderLotPatch) => patchLot.mutate({ lot_id, patch })}
            onNew={() => createLot.mutate({})}
            onDelete={(ids) => ids.forEach((lot_id) => deleteLot.mutate(lot_id))}
            onBatch={(lot_ids) => {
              if (!batchRefiner) return
              batch.mutate({ refiner_id: batchRefiner, direction: 'sell', lot_ids })
            }}
            onCreateSale={
              isSale
                ? supplyAction
                  ? () =>
                      batchRefiner &&
                      runAction(supplyAction, () => supply.mutate({ refiner_id: batchRefiner }))
                  : undefined
                : refiningSaleAction
                  ? () =>
                      batchRefiner &&
                      runAction(refiningSaleAction, () =>
                        createSale.mutate({ refiner_id: batchRefiner })
                      )
                  : undefined
            }
            createSaleDisabled={isSale ? supply.isPending : createSale.isPending}
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
              const run = () => {
                if (payment.data?.transfer_id) {
                  sendPayout.mutate(payment.data.transfer_id)
                  return
                }
                if (isSale) openCharge.mutate({ order_id: id, rail: chosenRail })
                else openPayout.mutate({ order_id: id, rail: chosenRail })
              }
              runAction(sendPaymentAction, run)
            }}
            sendDisabled={notFinalized}
            sendReason={
              notFinalized
                ? 'Finalize the order before the money moves.'
                : (sendPaymentAction?.confirm ?? null)
            }
            pending={openPayout.isPending || sendPayout.isPending || openCharge.isPending}
          />

          {addFundsAction && (
            <div className="flex items-center gap-sm">
              <Button
                variant="secondary"
                disabled={!!addFundsAction.override || addFunds.isPending}
                onClick={() => addFunds.mutate(undefined)}
              >
                Add Funds
              </Button>
              {addFundsAction.override && (
                <p className="text-micro text-muted-foreground">{addFundsAction.override}</p>
              )}
            </div>
          )}
        </div>

        <div className="flex w-full flex-col gap-lg lg:w-[400px] lg:shrink-0">
          <TotalsCard totals={view.totals} totalLabel={isSale ? 'Total due' : 'Total payout'} />
          {direction === 'purchase' && (
            <ProfitBreakdownCard breakdown={profit.data ?? null} loading={profit.isPending} />
          )}
          <DocumentsCard
            documents={documents.data ?? []}
            onSend={(kind) => sendDocument.mutate(kind)}
            onImport={(kind, file) => importDocument.mutate({ kind, file })}
          />
          <ChatCard
            phone={customer.data?.phone_number ?? null}
            messages={conversation.data ?? []}
            timeline={timeline.data ?? []}
            onSend={
              userId
                ? (body: string, media?: SmsMedia[]) =>
                    sendSms.mutate({ user_id: userId, body, ...(media ? { media } : {}) })
                : undefined
            }
          />
        </div>
      </div>

      <Dialog open={confirming != null} onOpenChange={(open) => !open && setConfirming(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Are you sure?</DialogTitle>
          </DialogHeader>
          <DialogDescription>{confirming?.reason}</DialogDescription>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                confirming?.run()
                setConfirming(null)
              }}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ScreenSkeleton() {
  return (
    <div className="flex flex-col gap-lg p-md lg:p-xl">
      <Skeleton className="h-[150px] w-full" />
      <div className="flex flex-col gap-lg lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-lg">
          <Skeleton className="h-[212px] w-full" />
          <Skeleton className="h-[138px] w-full" />
          <Skeleton className="h-[415px] w-full" />
        </div>
        <div className="flex w-full flex-col gap-lg lg:w-[400px] lg:shrink-0">
          <Skeleton className="h-[264px] w-full" />
          <Skeleton className="h-[213px] w-full" />
        </div>
      </div>
    </div>
  )
}
