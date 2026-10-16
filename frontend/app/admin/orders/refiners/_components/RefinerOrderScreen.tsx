'use client'

import * as React from 'react'
import { ApiError } from '@dorado/client'
import { ConfirmDialog, useMediaUp } from '@dorado/components'
import type {
  Action,
  RefiningLotPatch,
  RefiningLotView,
  RefiningOrderRead,
} from '@dorado/contracts'

import {
  useAddLots,
  useCancelOrder,
  usePatchLot,
  usePatchOrder,
  useRefinerOrder,
  useRefinerPricing,
  useRefinerSpots,
  useRemoveLot,
  useSendOrder,
  useSettleOrder,
  useStatementLines,
} from '../_api'
import { offered } from '../_lib'
import { AddLotDialog } from './AddLotDialog'
import { LinkedFulfillment } from './LinkedFulfillment'
import { MatchLinesDrawer } from './MatchLinesDrawer'
import { RefinerCharges } from './RefinerCharges'
import {
  RefinerConfirm,
  refinerConfirmCopy,
  type PartialSettle,
  type RefinerConfirmActionName,
} from './RefinerConfirm'
import { RefinerDocuments } from './RefinerDocuments'
import { RefinerHeader } from './RefinerHeader'
import { RefinerLots } from './RefinerLots'
import { RefinerPayment } from './RefinerPayment'
import { RefinerOrderFailed, RefinerOrderSkeleton, RefinerSaveFailed } from './RefinerScreenStates'
import { RefinerSettlement } from './RefinerSettlement'
import { RefinerSpots } from './RefinerSpots'
import { RefinerTotals } from './RefinerTotals'

type Pending = { action: Action; run: () => void; body?: string; partial?: PartialSettle }

const ALWAYS_CONFIRM = new Set(['cancel', 'send_payment'])

const confirmable = (name: string): name is RefinerConfirmActionName => name in refinerConfirmCopy

export function RefinerOrderScreen({ orderId }: { orderId: string }) {
  const mobile = !useMediaUp('lg')
  const layout = mobile ? 'mobile' : 'desktop'
  const order = useRefinerOrder(orderId)
  const view = order.data

  if (order.isError) return <RefinerOrderFailed onRetry={() => order.refetch()} />
  if (!view) return <RefinerOrderSkeleton />

  return <RefinerOrderBody view={view} layout={layout} onReload={() => order.refetch()} />
}

function RefinerOrderBody({
  view,
  layout,
  onReload,
}: {
  view: RefiningOrderRead
  layout: 'desktop' | 'mobile'
  onReload: () => void
}) {
  const mobile = layout === 'mobile'
  const sell = view.direction === 'sell'
  const pricing = useRefinerPricing(view.id)
  const spots = useRefinerSpots(view.id, !sell)
  const patchOrder = usePatchOrder(view.id)
  const sendOrder = useSendOrder(view.id)
  const cancelOrder = useCancelOrder(view.id)
  const settleOrder = useSettleOrder(view.id)
  const patchLot = usePatchLot()
  const removeLot = useRemoveLot()
  const addLots = useAddLots(view.id)

  const [pending, setPending] = React.useState<Pending | null>(null)
  const [failure, setFailure] = React.useState<unknown>(null)
  const [adding, setAdding] = React.useState(false)
  const [matching, setMatching] = React.useState(false)
  const [chosen, setChosen] = React.useState<Set<string>>(new Set())
  const lines = useStatementLines(view.id, matching)

  const fail = { onError: (error: unknown) => setFailure(error) }

  const onAction = (action: Action, run: () => void, body?: string, partial?: PartialSettle) =>
    action.confirm !== null || action.override !== null || ALWAYS_CONFIRM.has(action.name)
      ? setPending({ action, run, body, partial })
      : run()

  const editLots = offered(view.actions, 'edit_lots')
  const settle = offered(view.actions, 'settle')
  const resolve = offered(view.actions, 'resolve_dispute')
  const open = view.lots.filter(
    (row) => row.settled_at === null && row.returned_at === null && row.released_at === null
  )
  const picked = open.filter((row) => chosen.has(row.id))
  const toSettle = picked.length > 0 ? picked : open
  const place = view.location
    ? [view.location.city, view.location.state].filter(Boolean).join(', ')
    : null

  const patchRow = (row: RefiningLotView, patch: RefiningLotPatch) =>
    patchLot.mutate(
      { lot_id: row.id, patch: { ...patch, expected_updated_at: row.lot.updated_at } },
      fail
    )

  const header = (
    <RefinerHeader
      view={view}
      layout={layout}
      place={place}
      onAction={onAction}
      onCancel={() => cancelOrder.mutate(undefined, fail)}
      onSend={() => sendOrder.mutate(undefined, fail)}
      onError={setFailure}
    />
  )

  const fulfillment = sell ? null : (
    <LinkedFulfillment
      orders={view.linked_orders}
      layout={layout}
      shipsFrom={[view.refiner?.organization.name, place].filter(Boolean).join(' · ') || null}
    />
  )

  const settlement = sell ? (
    <RefinerSettlement
      order={view}
      pricing={pricing.data}
      content={pricing.isError ? 'error' : 'loaded'}
      layout={layout}
      pending={settleOrder.isPending || patchOrder.isPending}
      onRecordSettlement={() =>
        settle &&
        onAction(
          settle,
          () =>
            settleOrder.mutate(
              { lots: toSettle.map((row) => ({ lot_id: row.lot_id })) },
              { ...fail, onSuccess: () => setChosen(new Set()) }
            ),
          undefined,
          picked.length > 0 && picked.length < open.length
            ? {
                references: picked.map((row) => row.lot.reference ?? row.lot.product_name ?? ''),
                total: open.length,
                refiner: view.refiner?.organization.name ?? null,
                order: view.number,
              }
            : undefined
        )
      }
      onResolveDispute={() =>
        resolve &&
        onAction(resolve, () =>
          patchOrder.mutate({ disputed_at: null, expected_updated_at: view.updated_at }, fail)
        )
      }
      onSettlementTypeChange={(settlement_type) =>
        patchOrder.mutate({ settlement_type, expected_updated_at: view.updated_at }, fail)
      }
      onRetry={() => pricing.refetch()}
    />
  ) : null

  const lots = (
    <RefinerLots
      direction={view.direction}
      lots={view.lots}
      prices={pricing.data?.lots ?? []}
      layout={layout}
      editLots={editLots}
      editable={editLots !== undefined && view.sent_at !== null}
      selectable={editLots !== undefined || settle !== undefined}
      selected={chosen}
      onSelectedChange={setChosen}
      onAction={onAction}
      onPatch={patchRow}
      onRemove={(rows) => rows.forEach((row) => removeLot.mutate(row.id, fail))}
      onAdd={() => setAdding(true)}
    />
  )

  const spotsCard = sell ? null : (
    <RefinerSpots
      spots={spots.data ?? []}
      content={spots.isError ? 'error' : spots.isPending ? 'loading' : 'loaded'}
      onRetry={() => spots.refetch()}
    />
  )

  const charges = <RefinerCharges view={view} />
  const payment = (
    <RefinerPayment
      payment={view.payment}
      settlementType={view.settlement_type}
      direction={view.direction}
      layout={layout}
    />
  )
  const totals = <RefinerTotals view={view} />
  const documents = (
    <RefinerDocuments
      orderId={view.id}
      onImported={(kind) => kind === 'settlement' && setMatching(true)}
      onError={setFailure}
    />
  )

  return (
    <div className="flex flex-col gap-md lg:gap-lg">
      {header}
      {failure !== null && (
        <RefinerSaveFailed
          stale={failure instanceof ApiError && failure.status === 409}
          onReload={() => {
            setFailure(null)
            onReload()
          }}
          onRetry={() => setFailure(null)}
        />
      )}
      {mobile ? (
        <div className="flex flex-col gap-md">
          {settlement}
          {fulfillment}
          {spotsCard}
          {lots}
          {totals}
          {charges}
          {payment}
          {documents}
        </div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)_388px] items-start gap-lg">
          <div className="flex min-w-0 flex-col gap-lg">
            {fulfillment}
            {spotsCard}
            {lots}
            {charges}
            {payment}
          </div>
          <div className="flex flex-col gap-lg">
            {totals}
            {settlement}
            {documents}
          </div>
        </div>
      )}
      <AddLotDialog
        open={adding}
        pending={addLots.isPending}
        onClose={() => setAdding(false)}
        onAdd={(lotId) =>
          addLots.mutate({ lot_ids: [lotId] }, { ...fail, onSuccess: () => setAdding(false) })
        }
      />
      <MatchLinesDrawer
        open={matching}
        setOpen={setMatching}
        parse={lines.data}
        lots={view.lots}
        layout={layout}
        content={lines.isError ? 'error' : lines.isPending ? 'loading' : 'loaded'}
        onRetry={() => lines.refetch()}
        onApply={(picks) => {
          picks.forEach((pick) => {
            const row = view.lots.find((lot) => lot.lot_id === pick.lot_id)
            if (row) patchRow(row, { line_reference: pick.line_reference })
          })
          setMatching(false)
        }}
      />
      {pending && confirmable(pending.action.name) ? (
        <RefinerConfirm
          open
          action={{ ...pending.action, name: pending.action.name }}
          reference={view.number}
          body={pending.body}
          partial={pending.partial}
          layout={layout}
          onCancel={() => setPending(null)}
          onConfirm={() => {
            pending.run()
            setPending(null)
          }}
        />
      ) : pending ? (
        <ConfirmDialog
          open
          title="Are you sure?"
          body={pending.action.confirm ?? pending.action.override}
          confirmLabel="Continue"
          onCancel={() => setPending(null)}
          onConfirm={() => {
            pending.run()
            setPending(null)
          }}
        />
      ) : null}
    </div>
  )
}
