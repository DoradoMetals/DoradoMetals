'use client'

import * as React from 'react'
import { Input, cn, useMediaUp, type SelectItemShape } from '@dorado/components'
import type {
  Action,
  AdoptAssayLot,
  FulfillmentView,
  OrderLotPatch,
  OrderView,
  ShipmentView,
} from '@dorado/contracts'

import { formatDay } from '@/shared/utils/formatStamp'

import { formatTotal } from '../../_lib'

import { OrderChat } from '../../_components/OrderChat'
import { OrderDocuments } from '../../_components/OrderDocuments'
import { OrderHeader } from '../../_components/OrderHeader'
import {
  OPEN_TRANSFER,
  contentOf,
  useActorNames,
  useAdminSession,
  useAdoptCandidates,
  useCreateMethods,
  useCustomerAddresses,
  useDetailActivity,
  useDeclareMetals,
  useDetailClaims,
  useDetailDisputes,
  useDetailFulfillment,
  useDetailNotes,
  useDetailPayment,
  useDetailPricing,
  useDetailProfit,
  useDetailRefunds,
  useDetailShipments,
  useMatchesFor,
  useMethodsFor,
  useOffices,
  useOrderBook,
  useParcelOptions,
  useOrderDetail,
  usePayToFor,
  useOrderWrites,
  useStaff,
  useStepUpGate,
  useStockLots,
  type ActionInput,
  type OrderWrites,
} from '../_api'
import {
  ORDER_ACTIONS,
  findAction,
  formatFixed,
  fulfillmentChoices,
  methodFor,
  offers,
  parseDecimal,
} from '../_lib'
import { ActionConfirmDialog } from './ActionConfirmDialog'
import { Activity } from './Activity'
import { CardNotice } from '../../_components/CardNotice'
import { AddressChange } from './AddressChange'
import { AddressChangeDialog } from './AddressChangeDialog'
import { AdoptAssayDrawer } from './AdoptAssayDrawer'
import { AddingLot } from './AddingLot'
import { AdoptAssayBody } from './AdoptAssayBody'
import { AppointmentCard } from './AppointmentCard'
import { Charges } from './Charges'
import { Claim } from './Claim'
import {
  CreateFulfillment,
  purchaseCreateMethods,
  saleCreateMethods,
  type CreateFulfillmentDraft,
  type CreateMethod,
} from './CreateFulfillment'
import { DecimalField, DecimalResetContext } from './DecimalField'
import { DropoffCard } from './DropoffCard'
import { Fulfillment } from './Fulfillment'
import { LotPhotosCard } from './LotPhotosCard'
import { Lots } from './Lots'
import { Notes } from './Notes'
import { OrderSection, SectionError } from './OrderSection'
import { Payment } from './Payment'
import type { PayoutLine, PayoutLinePatch } from './PayoutLines'
import { PickupCard } from './PickupCard'
import { ProfitBreakdown } from './ProfitBreakdown'
import { PurityDispute } from './PurityDispute'
import { Refunds } from './Refunds'
import { ShipmentCard } from './ShipmentCard'
import { Spots } from './Spots'
import { Totals } from './Totals'
import { useActionFlow, type ActionCopy } from './useActionFlow'

type Layout = 'desktop' | 'mobile'

const PAYMENT_ACTIONS = ['add_funds', 'send_payment', 'request_payment', 'confirm_match']

const COPY: Record<string, ActionCopy> = {
  cancel: {
    title: 'Cancel this order?',
    confirmLabel: 'Cancel order',
    cancelLabel: 'Keep order',
    intent: 'danger',
  },
  reopen: { title: 'Reopen this order?', confirmLabel: 'Reopen' },
  finalize: { title: 'Finalize this order?', confirmLabel: 'Finalize' },
  add_funds: { title: 'Credit the customer balance?', confirmLabel: 'Credit balance' },
  send_payment: { title: 'Send the payout?', confirmLabel: 'Send payment' },
  refund: { title: 'Refund the customer?', confirmLabel: 'Refund', intent: 'danger' },
  change_address: {
    title: 'Change the ship-to address?',
    confirmLabel: 'Change and relabel',
    cancelLabel: 'Keep address',
  },
  lock_spots: { title: 'Lock spots?', confirmLabel: 'Lock spots' },
  unlock_spots: { title: 'Unlock spots?', confirmLabel: 'Unlock spots' },
  buy_label: { title: 'Buy the label?', confirmLabel: 'Buy label' },
  edit_spots: { title: 'Set the frozen bid?', confirmLabel: 'Set bid' },
  edit_charges: { title: 'Change the shipping charge?', confirmLabel: 'Change charge' },
  remove_lots: { title: 'Remove from this order?', confirmLabel: 'Remove', intent: 'danger' },
}

const words = (name: string) => name.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())

export const copyFor = (action: Action): ActionCopy =>
  COPY[action.name] ?? { title: `${words(action.name)}?`, confirmLabel: words(action.name) }

function Card({ name, children }: { name: string; children: React.ReactNode }) {
  return <div data-testid={`order-card-${name}`}>{children}</div>
}

function FulfillmentSlot({
  view,
  layout,
  shipments,
  fulfillment,
  writes,
  ask,
}: {
  view: OrderView
  layout: Layout
  shipments: { data?: ShipmentView[]; isPending: boolean; isError: boolean; refetch: () => unknown }
  fulfillment: { data?: FulfillmentView | null }
  writes: OrderWrites
  ask: (action: Action, input?: ActionInput) => void
}) {
  const [voiding, setVoiding] = React.useState<string | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [tab, setTab] = React.useState<CreateMethod>('shipment')
  const [draft, setDraft] = React.useState<CreateFulfillmentDraft>({})
  const sale = view.order.direction === 'sale'
  const book = useOrderBook(view.order.user_id)
  const offices = useOffices(true)
  const staff = useStaff(true)
  const methods = useCreateMethods(view.order.direction, creating)
  const parcel = useParcelOptions(creating && (tab === 'shipment' || tab === 'return'))
  const addressItems: SelectItemShape[] = (book.data ?? []).map((entry) => ({
    value: entry.address.id,
    label: addressLine(entry.address),
  }))
  const officeItems: SelectItemShape[] = (offices.data ?? []).map((office) => ({
    value: office.id,
    label: office.name ?? 'Office',
  }))
  const staffItems: SelectItemShape[] = (staff.data ?? []).map((person) => ({
    value: person.id,
    label: person.name,
  }))
  const officeOf = (id: string | null | undefined) =>
    (offices.data ?? []).find((office) => id != null && office.id === id)?.name ?? null
  const staffOf = (id: string | null | undefined) =>
    (staff.data ?? []).find((person) => id != null && person.id === id)?.name ?? null
  const placeOf = (id: string | null | undefined) => {
    const entry = (book.data ?? []).find((row) => id != null && row.address.id === id)
    if (entry) return addressLine(entry.address)
    return (
      (offices.data ?? []).find((office) => id != null && office.address_id === id)?.name ?? null
    )
  }
  const tracks = offers(view.actions, 'update_tracking')
  const rows = shipments.data ?? []
  const voidingTracking = rows.find((row) => row.shipment.id === voiding)?.shipment.tracking_number
  const flow = fulfillment.data ?? null
  const category = flow?.method.category ?? null
  const onAction = (action: Action) => flow && ask(action, { fulfillment_id: flow.fulfillment.id })

  if (rows.length > 0) {
    return (
      <>
        {rows.map((row) => (
          <Card
            key={row.shipment.id}
            name={row.shipment.direction === 'Return' ? 'return' : 'shipment'}
          >
            <ShipmentCard
              shipment={row}
              kind={row.shipment.direction === 'Return' ? 'return' : 'shipment'}
              signature={sale}
              layout={layout}
              pending={writes.pending != null}
              shipsFrom={placeOf(row.shipment.shipper_address_id)}
              shipsTo={placeOf(row.shipment.recipient_address_id)}
              onCancelLabel={() => setVoiding(row.shipment.id)}
              onSaveTracking={
                tracks
                  ? ({ tracking_number }) => writes.saveTracking(row.shipment.id, tracking_number)
                  : undefined
              }
            />
          </Card>
        ))}
        <ActionConfirmDialog
          open={voiding != null}
          layout={layout}
          title="Void the FedEx label?"
          body={`${voidingTracking ? `FedEx ${voidingTracking}` : 'The label'} stops working. Buy a new label before the parcel ships.`}
          confirmLabel="Void label"
          cancelLabel="Keep label"
          intent="danger"
          pending={writes.pending === 'cancel_label'}
          onCancel={() => setVoiding(null)}
          onConfirm={() => {
            if (voiding) writes.cancelLabel(voiding)
            setVoiding(null)
          }}
        />
      </>
    )
  }

  if (flow && category === 'PICKUP') {
    return (
      <Card name="pickup">
        <PickupCard
          view={flow}
          office={officeOf(flow.pickup?.location_id)}
          driver={staffOf(flow.pickup?.assigned_employee_id)}
          address={placeOf(flow.pickup?.pickup_address_id)}
          doneAt={flow.fulfillment.status === 'PICKED_UP' ? flow.fulfillment.updated_at : null}
          layout={layout}
          pending={writes.pending}
          onAction={onAction}
        />
      </Card>
    )
  }
  if (flow && category === 'DIRECT') {
    return (
      <Card name="appointment">
        <AppointmentCard
          view={flow}
          direction={view.order.direction ?? undefined}
          office={officeOf(flow.direct?.location_id)}
          person={staffOf(flow.direct?.assigned_employee_id)}
          doneAt={flow.fulfillment.status === 'IN_PROGRESS' ? flow.fulfillment.updated_at : null}
          layout={layout}
          pending={writes.pending}
          onAction={onAction}
        />
      </Card>
    )
  }
  if (flow && category === 'DROPOFF') {
    return (
      <Card name="dropoff">
        <DropoffCard view={flow} layout={layout} pending={writes.pending} onAction={onAction} />
      </Card>
    )
  }
  if (creating) {
    const tabs = sale ? saleCreateMethods : purchaseCreateMethods
    const chosen = methodFor(methods.data ?? [], tab)
    return (
      <Card name="fulfillment">
        <CreateFulfillment
          layout={layout}
          methods={tabs}
          method={tab}
          onMethodChange={setTab}
          options={{
            services: (parcel.services.data ?? []).map((service) => ({
              value: service.id,
              label: service.name,
            })),
            packages: (parcel.packages.data ?? []).map((box) => ({
              value: box.id,
              label: box.label,
            })),
            handoffs: (parcel.handoffs.data ?? []).map((handoff) => ({
              value: handoff.code,
              label: handoff.name,
            })),
            places: addressItems,
            addresses: addressItems,
            offices: officeItems,
            employees: staffItems,
            drivers: staffItems,
          }}
          draft={draft}
          onDraftChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
          pending={writes.pending === 'create_fulfillment' || chosen == null}
          onSubmit={(method) => {
            const method_id = methodFor(methods.data ?? [], method)
            if (!method_id) return
            writes
              .createFulfillment(method_id, fulfillmentChoices(method, draft))
              .then(() => shipments.refetch())
          }}
        />
      </Card>
    )
  }

  return (
    <Card name="fulfillment">
      <Fulfillment
        layout={layout}
        direction={view.order.direction ?? undefined}
        content={contentOf(shipments)}
        onRetry={() => shipments.refetch()}
        onCreate={flow ? undefined : () => setCreating(true)}
      />
    </Card>
  )
}

const addressLine = (address: {
  line_1: string | null
  city: string | null
  state: string | null
}) => [address.line_1, address.city, address.state].filter(Boolean).join(', ')

function useAdoptDialog(orderId: string, view: OrderView | undefined) {
  const [open, setOpen] = React.useState(false)
  const proposal = useAdoptCandidates(orderId, open)
  const [figures, setFigures] = React.useState<Record<string, OrderLotPatch>>({})
  const candidates = proposal.data?.lots ?? []
  const lots: AdoptAssayLot[] = candidates.map((candidate) => ({
    id: candidate.id,
    figures: figures[candidate.id] ?? candidate.proposed,
  }))
  return {
    open,
    candidates,
    lots,
    action: findAction(view?.actions, 'adopt_assay'),
    show: () => {
      setFigures({})
      setOpen(true)
    },
    hide: () => setOpen(false),
    change: (id: string, next: OrderLotPatch) => setFigures((all) => ({ ...all, [id]: next })),
  }
}

export function OrderScreen({ orderId }: { orderId: string }) {
  const layout: Layout = useMediaUp('lg') ? 'desktop' : 'mobile'
  const mobile = layout === 'mobile'
  const order = useOrderDetail(orderId)
  const view = order.data
  const [refundAmount, setRefundAmount] = React.useState<number | null>(null)
  const [adding, setAdding] = React.useState(false)
  const [stockQuery, setStockQuery] = React.useState('')
  const [resolving, setResolving] = React.useState<string | null>(null)
  const [resolution, setResolution] = React.useState('')
  const direction = view?.order.direction ?? null
  const userId = view?.order.user_id ?? null

  const pricing = useDetailPricing(orderId)
  const profit = useDetailProfit(orderId, direction)
  const activity = useDetailActivity(orderId)
  const notes = useDetailNotes(orderId)
  const disputes = useDetailDisputes(orderId, direction)
  const refunds = useDetailRefunds(orderId, direction)
  const claims = useDetailClaims(orderId, direction)
  const payment = useDetailPayment(orderId)
  const shipments = useDetailShipments(orderId)
  const fulfillment = useDetailFulfillment(orderId)
  const addresses = useCustomerAddresses(userId, direction)
  const stock = useStockLots(adding ? stockQuery : '', direction)
  const metals = useDeclareMetals(adding && direction === 'purchase')
  const methods = useMethodsFor(direction)
  const payTo = usePayToFor(userId, direction)
  const [matchQuery, setMatchQuery] = React.useState('')
  const [matchId, setMatchId] = React.useState<string | null>(null)
  const matchable =
    direction === 'sale' &&
    payment.data != null &&
    payment.data.rail !== 'CARD' &&
    payment.data.card_last4 == null &&
    payment.data.state === 'Due' &&
    !offers(view?.actions ?? [], 'request_payment')
  const matches = useMatchesFor(orderId, matchable)
  const session = useAdminSession()
  const names = useActorNames([
    ...(activity.data ?? []).map((row) => row.actor_id),
    ...(notes.data ?? []).map((row) => row.author_id),
    ...(refunds.data ?? []).map((row) => row.created_by_id),
  ])

  const writes = useOrderWrites(orderId, view, () => {
    order.refetch()
  })
  const gate = useStepUpGate(session.data)
  const input = React.useRef<ActionInput>({})
  const flow = useActionFlow({
    copy: copyFor,
    layout,
    pending: writes.pending != null,
    stepUp: {
      needed: gate.needed,
      destination: gate.destination,
      invalid: gate.invalid,
      pending: gate.pending,
      onVerify: gate.onVerify,
    },
    onRun: ({ action, reason }) => {
      writes.run(action, reason, {
        ...input.current,
        ...(action.name === 'refund' ? { refund_amount: refundAmount } : {}),
      })
    },
    extra: (action) =>
      action.name === 'refund' ? (
        <DecimalField
          label="Amount"
          value={refundAmount}
          format={formatFixed}
          unit="$"
          message={`Up to ${formatFixed(view?.payment.refundable ?? 0)}`}
          onCommit={setRefundAmount}
        />
      ) : null,
  })
  const adopt = useAdoptDialog(orderId, view)

  const requestStepUp = gate.request
  React.useEffect(() => {
    if (flow.step === 'step-up') requestStepUp()
  }, [flow.step, requestStepUp])

  const [selected, setSelected] = React.useState<string[]>([])
  const [draft, setDraft] = React.useState<PayoutLine[] | null>(null)
  const [payToId, setPayToId] = React.useState<string | null>(null)

  const [addressAsk, setAddressAsk] = React.useState<{ action: Action; extra: ActionInput } | null>(
    null
  )

  const ask = (action: Action, extra: ActionInput = {}) => {
    if (action.name === 'change_address' && !action.override && extra.address_id) {
      setAddressAsk({ action, extra })
      return
    }
    if (action.name === 'adopt_assay') {
      adopt.show()
      return
    }
    const inbound = (shipments.data ?? []).find((row) => row.shipment.direction === 'Inbound')
    input.current =
      action.name === 'buy_label' ? { ...extra, shipment_id: inbound?.shipment.id ?? null } : extra
    if (action.name === 'refund') setRefundAmount(view?.payment.refundable ?? null)
    flow.request(action)
  }

  if (order.isError && !view) {
    return (
      <div data-testid="order-screen" data-state="error" className="flex flex-col gap-md">
        <SectionError title="Couldn’t load this order" onRetry={() => order.refetch()} />
      </div>
    )
  }
  if (!view) {
    return (
      <div data-testid="order-screen" data-state="loading" className="flex flex-col gap-md">
        <OrderSection title="Order" content="loading" layout={layout} />
      </div>
    )
  }

  const sale = direction === 'sale'
  const actions = view.actions
  const banks = (payTo.data ?? []).map((bank) => ({
    value: bank.id,
    label: [
      bank.bank_name ?? 'Bank',
      bank.holder_name,
      bank.last_four ? `•••• ${bank.last_four}` : null,
    ]
      .filter(Boolean)
      .join(' · '),
  }))
  const chosenBank = (payTo.data ?? []).find((bank) => bank.id === (payToId ?? banks[0]?.value))
  const methodRows = (methods.data ?? []).filter((method) => method.enabled)
  const methodItems: SelectItemShape[] = methodRows.map((method) => ({
    value: method.type,
    label: method.label,
  }))
  const methodId = (type: string | null) =>
    methodRows.find((method) => method.type === type)?.id ?? null

  const serverLines: PayoutLine[] = (
    view.payout_methods.length > 0
      ? view.payout_methods.map((row) => ({ method: row.method, amount: row.amount }))
      : [{ method: view.payout?.method ?? null, amount: null }]
  ).map((row, index) => ({
    key: `line-${index}`,
    method: row.method,
    amount: row.amount != null ? String(row.amount) : '',
    payTo: banks,
    payToId: chosenBank?.id ?? null,
  }))
  const lines = draft ?? serverLines
  const split = lines.length > 1

  const amountOf = (text: string | undefined) => parseDecimal(text ?? '')
  const putLines = (next: PayoutLine[]) =>
    writes.setPayoutMethods(
      next.map((line) => ({
        method_id: methodId(line.method) ?? '',
        amount: amountOf(line.amount) ?? 0,
      }))
    )

  const onLineChange = (index: number, patch: PayoutLinePatch) => {
    if (patch.payToId) setPayToId(patch.payToId)
    const next = lines.map((line, at) =>
      at === index
        ? {
            ...line,
            ...(patch.method !== undefined ? { method: patch.method } : {}),
            ...(patch.amount !== undefined ? { amount: patch.amount } : {}),
          }
        : line
    )
    if (!split && patch.method !== undefined && offers(actions, ORDER_ACTIONS.editPayoutMethod)) {
      const chosen = methodId(patch.method)
      if (chosen) writes.choosePayoutMethod(chosen)
      return
    }
    if (patch.method !== undefined || patch.amount !== undefined) setDraft(next)
  }

  const transferOpen =
    payment.data?.transfer_id && OPEN_TRANSFER.includes(payment.data.state ?? 'Not sent')
  const onPaymentAction = async (action: Action) => {
    if (split && draft && draft.every((line) => line.method && amountOf(line.amount) != null)) {
      await putLines(draft)
      setDraft(null)
    }
    ask(action, {
      transfer_id: transferOpen ? payment.data?.transfer_id : null,
      bank_link_id: chosenBank?.id ?? null,
      rail: chosenBank?.rail ?? null,
      inbound_id: matchId,
    })
  }

  const matching = matchable
    ? {
        query: matchQuery,
        onQueryChange: setMatchQuery,
        selectedId: matchId,
        onSelect: setMatchId,
        candidates: (matches.data ?? [])
          .map((candidate) => ({
            id: candidate.id,
            label: [
              formatDay(candidate.occurred_at),
              candidate.source,
              formatTotal(candidate.amount),
              candidate.counterparty_name,
              candidate.memo,
            ]
              .filter(Boolean)
              .join(' · '),
            muted: candidate.amount_delta !== 0,
          }))
          .filter((candidate) =>
            candidate.label.toLowerCase().includes(matchQuery.trim().toLowerCase())
          ),
      }
    : undefined

  const onAddLine = offers(actions, 'add_payout_method')
    ? () =>
        setDraft([
          ...lines,
          { key: `line-${lines.length}`, method: null, amount: '', payTo: banks, payToId: null },
        ])
    : undefined

  const outbound = (shipments.data ?? []).find((row) => row.shipment.direction === 'Outbound')
  const carried = (shipments.data ?? []).find((row) => row.shipment.direction !== 'Return')
  const detailsId = view.totals?.payout_details_id ?? null
  const editCharges = findAction(actions, ORDER_ACTIONS.editCharges)
  const editSpots = findAction(actions, ORDER_ACTIONS.editSpots)
  const removeLots = findAction(actions, ORDER_ACTIONS.removeLots)
  const lotsPending = writes.pending === 'add_lot' || writes.pending === 'remove_lots'
  const currentAddress = view.address?.source_address_id ?? null
  const addressItems: SelectItemShape[] = (addresses.data ?? []).map((entry) => ({
    value: entry.address.id,
    label: [entry.address.line_1, entry.address.city, entry.address.state]
      .filter(Boolean)
      .join(', '),
  }))
  const openDisputes = (disputes.data ?? []).filter((dispute) => dispute.resolved_at == null)
  const lotReference = (lotId: string) =>
    view.lots.find((lot) => lot.lot_id === lotId)?.lot.reference ?? ''

  const fulfillmentSlot = (
    <FulfillmentSlot
      view={view}
      layout={layout}
      shipments={shipments}
      fulfillment={fulfillment}
      writes={writes}
      ask={ask}
    />
  )

  const spots = (
    <Card name="spots">
      <Spots
        direction={view.order.direction ?? 'purchase'}
        spots={pricing.data?.spots}
        locked={view.order.spots_locked}
        actions={actions}
        content={contentOf(pricing)}
        layout={layout}
        onLock={() => {
          const action = findAction(actions, 'lock_spots')
          if (action) ask(action)
        }}
        onUnlock={() => {
          const action = findAction(actions, 'unlock_spots')
          if (action) ask(action)
        }}
        onSpotChange={
          editSpots
            ? (metal_id, bid) => {
                if (bid != null) ask(editSpots, { spots: [{ metal_id, bid }] })
              }
            : undefined
        }
        onRetry={() => pricing.refetch()}
      />
    </Card>
  )

  const lots = (
    <Card name="lots">
      <Lots
        direction={view.order.direction ?? 'purchase'}
        lots={view.lots}
        actions={actions}
        layout={layout}
        selected={selected}
        onSelectedChange={setSelected}
        onEdit={(id, patch) => {
          const row = view.lots.find((lot) => lot.id === id)
          if (row) writes.editLot(row, patch)
        }}
        onAdd={() => setAdding(true)}
        onRemove={(ids, body) => {
          if (removeLots?.override) ask(removeLots, { lot_ids: ids, unlink_reason: body.reason })
          else writes.removeLots(ids, body)
          setSelected([])
        }}
        removePending={writes.pending === 'remove_lots'}
        askRemoveReason
        adding={
          adding ? (
            sale ? (
              <AddingLot
                mode="stock"
                enabled={offers(actions, ORDER_ACTIONS.addLot)}
                pending={lotsPending}
                query={stockQuery}
                onQueryChange={setStockQuery}
                results={stock.data ?? []}
                onCancel={() => setAdding(false)}
                onAdd={(lot_id) => {
                  writes.addLot({ lot_id })
                  setStockQuery('')
                  setAdding(false)
                }}
              />
            ) : (
              <AddingLot
                mode="declare"
                enabled={offers(actions, ORDER_ACTIONS.addLot)}
                pending={lotsPending}
                metals={(metals.data ?? []).map((spot) => ({ value: spot.id, label: spot.id }))}
                onCancel={() => setAdding(false)}
                onAdd={(lot) => {
                  writes.addLot(lot)
                  setAdding(false)
                }}
              />
            )
          ) : undefined
        }
      />
    </Card>
  )

  const charges = (
    <Card name="charges">
      <Charges
        direction={view.order.direction ?? 'purchase'}
        pricing={pricing.data}
        actions={actions}
        content={contentOf(pricing)}
        layout={layout}
        onRetry={() => pricing.refetch()}
        onShippingChargeChange={
          editCharges && carried
            ? (value) => {
                if (value != null) {
                  ask(editCharges, { shipment_id: carried.shipment.id, shipping_charge: value })
                }
              }
            : undefined
        }
        onPayoutFeeChange={
          editCharges && detailsId && !sale
            ? (value) => {
                if (value != null) writes.setPayoutFee(detailsId, value)
              }
            : undefined
        }
      />
    </Card>
  )

  const paymentCard = (
    <Card name="payment">
      <Payment
        layout={layout}
        content={contentOf(payment)}
        onRetry={() => payment.refetch()}
        payment={payment.data ?? null}
        paymentFacts={view.payment}
        payout={view.payout}
        methods={methodItems}
        lines={lines}
        onLineChange={onLineChange}
        onAddLine={onAddLine}
        actions={actions.filter((action) => PAYMENT_ACTIONS.includes(action.name))}
        onAction={onPaymentAction}
        pending={writes.pending}
        matching={matching}
      />
    </Card>
  )

  const totals = (
    <Card name="totals">
      <Totals
        direction={view.order.direction ?? 'purchase'}
        pricing={pricing.data}
        content={contentOf(pricing)}
        layout={layout}
        onRetry={() => pricing.refetch()}
      />
    </Card>
  )

  const profitCard = sale ? null : (
    <Card name="profit">
      <ProfitBreakdown
        breakdown={profit.data}
        content={contentOf(profit)}
        layout={layout}
        onRetry={() => profit.refetch()}
      />
    </Card>
  )

  const documents = (
    <Card name="documents">
      <OrderDocuments orderId={orderId} />
    </Card>
  )

  const chat = userId ? (
    <Card name="chat">
      <OrderChat userId={userId} />
    </Card>
  ) : null

  const activityCard = (
    <Card name="activity">
      <Activity
        activity={activity.data}
        names={names.data}
        content={contentOf(activity)}
        layout={layout}
        onRetry={() => activity.refetch()}
        defaultOpen={false}
      />
    </Card>
  )

  const notesCard = (
    <Card name="notes">
      <Notes
        notes={notes.data}
        names={names.data}
        content={contentOf(notes)}
        layout={layout}
        pending={writes.pending === 'add_note'}
        onAdd={(body) => writes.addNote(body)}
        onRetry={() => notes.refetch()}
      />
    </Card>
  )

  const disputeCards = openDisputes.map((dispute) => (
    <Card key={dispute.id} name="dispute">
      <PurityDispute
        dispute={dispute}
        lotReference={lotReference(dispute.lot_id)}
        actions={actions}
        layout={layout}
        pending={writes.pending === 'resolve_dispute'}
        onResolve={() => {
          setResolution('')
          setResolving(dispute.id)
        }}
      />
    </Card>
  ))

  const photos = (
    <Card name="lot-photos">
      <LotPhotosCard lots={view.lots} layout={layout} defaultOpen={false} />
    </Card>
  )

  const refundsCard = (
    <Card name="refunds">
      <Refunds
        refunds={refunds.data ?? []}
        names={names.data}
        layout={layout}
        content={contentOf(refunds)}
        onRetry={() => refunds.refetch()}
      />
    </Card>
  )

  const claim = (
    <Card name="claim">
      <Claim
        claim={claims.data?.[0] ?? null}
        trackingNumber={outbound?.shipment.tracking_number ?? null}
        carrier={outbound?.service?.name ?? null}
        layout={layout}
        content={contentOf(claims)}
        onRetry={() => claims.refetch()}
      />
    </Card>
  )

  const addressChange = (
    <Card name="address-change">
      <AddressChange
        addresses={addressItems}
        currentId={currentAddress}
        action={findAction(actions, 'change_address')}
        layout={layout}
        content={contentOf(addresses)}
        pending={writes.pending === 'change_address'}
        onRetry={() => addresses.refetch()}
        onChange={({ address_id, reason }) => {
          const action = findAction(actions, 'change_address')
          if (action) ask(action, { address_id, address_reason: reason })
        }}
      />
    </Card>
  )

  const main = sale
    ? [
        fulfillmentSlot,
        addressChange,
        spots,
        lots,
        charges,
        paymentCard,
        refundsCard,
        claim,
        activityCard,
      ]
    : [fulfillmentSlot, spots, lots, ...disputeCards, photos, charges, paymentCard, activityCard]
  const aside = sale
    ? [totals, documents, chat, notesCard]
    : [totals, profitCard, documents, chat, notesCard]

  const keyed = (nodes: React.ReactNode[], prefix: string) =>
    nodes
      .filter(Boolean)
      .map((node, index) => <React.Fragment key={`${prefix}-${index}`}>{node}</React.Fragment>)

  return (
    <DecimalResetContext.Provider value={writes.revision}>
      <div
        data-testid="order-screen"
        data-state="ready"
        data-direction={direction ?? undefined}
        data-layout={layout}
        className="flex flex-col gap-md lg:gap-lg"
      >
        <OrderHeader
          orderId={orderId}
          onAction={(action) => ask(action)}
          pending={writes.pending}
        />
        {writes.notice && (
          <div data-testid="order-notice" data-kind={writes.notice.kind}>
            <CardNotice
              kind={writes.notice.kind}
              message={writes.notice.message}
              layout={layout}
              onReload={writes.reload}
              onRetry={writes.retry}
            />
          </div>
        )}
        <div
          className={cn(
            'flex flex-col gap-md',
            !mobile && 'grid grid-cols-[minmax(0,1fr)_400px] items-start gap-lg'
          )}
        >
          <div data-testid="order-main" className="flex min-w-0 flex-col gap-md lg:gap-lg">
            {keyed(main, 'main')}
          </div>
          <div data-testid="order-aside" className="flex min-w-0 flex-col gap-md lg:gap-lg">
            {keyed(aside, 'aside')}
          </div>
        </div>
        {flow.dialogs}
        <AddressChangeDialog
          open={addressAsk != null}
          layout={layout}
          trackingLabel={
            outbound?.shipment.tracking_number
              ? `FedEx ${outbound.shipment.tracking_number}`
              : 'The label'
          }
          currentAddress={addressItems.find((item) => item.value === currentAddress)?.label}
          newAddress={String(
            addressItems.find((item) => item.value === addressAsk?.extra.address_id)?.label ?? ''
          )}
          reason={addressAsk?.extra.address_reason}
          pending={writes.pending === 'change_address'}
          onCancel={() => setAddressAsk(null)}
          onConfirm={(address_reason) => {
            if (addressAsk)
              writes.run(addressAsk.action, null, { ...addressAsk.extra, address_reason })
            setAddressAsk(null)
          }}
        />
        <ActionConfirmDialog
          open={resolving != null}
          layout={layout}
          title="Resolve this dispute?"
          body={
            <Input
              label="Resolution"
              placeholder="What was decided?"
              value={resolution}
              onChange={(event) => setResolution(event.target.value)}
            />
          }
          confirmLabel="Resolve"
          pending={writes.pending === 'resolve_dispute' || resolution.trim() === ''}
          onCancel={() => setResolving(null)}
          onConfirm={() => {
            if (resolving && resolution.trim() !== '')
              writes.resolveDispute(resolving, resolution.trim())
            setResolving(null)
          }}
        />
        <AdoptAssayDrawer
          open={adopt.open}
          layout={layout}
          confirm={adopt.action?.confirm}
          candidates={adopt.candidates}
          pending={writes.pending === 'adopt_assay'}
          onFiguresChange={adopt.change}
          onCancel={adopt.hide}
          onConfirm={() => {
            if (adopt.action && adopt.lots.length > 0) {
              writes.run(adopt.action, null, { adopt: adopt.lots })
            }
            adopt.hide()
          }}
        />
      </div>
    </DecimalResetContext.Provider>
  )
}
