'use client'

import * as React from 'react'
import { Button, Card, Text, Textarea } from '@dorado/components'
import {
  useAdminProducts,
  useAdminUser,
  useEmployees,
  useFulfillmentMethods,
  useLinkedAccounts,
  useOnHandLots,
  usePaymentMethods,
  useRefiners,
  useRefinerFulfillmentMethods,
} from '@dorado/client'
import type { OrderPreview, OrderPreviewLine } from '@dorado/contracts'

import {
  directionOf,
  isRefiner,
  lotOf,
  percentOf,
  type DrawerState,
  type LotRow,
} from '../../_lib/createOrder'
import {
  HANDOFF_LABEL,
  KIND_LABEL,
  PAYOUT_LABEL,
  accountLabel,
  formatMoney,
  formatOz,
  lotsWord,
} from '../../_lib/createOrderView'
import { Row } from './parts'
import type { DrawerViewer } from './index'

const CATEGORY_TITLE: Record<string, string> = {
  SHIPMENT: 'Shipment',
  PICKUP: 'Dorado pickup',
  DIRECT: 'Appointment',
  DROPOFF: 'Drop-off',
}

function ReviewCard({
  title,
  edit,
  onEdit,
  children,
}: {
  title: string
  edit: string
  onEdit: () => void
  children: React.ReactNode
}) {
  return (
    <Card className="gap-sm">
      <div className="flex items-center justify-between gap-sm">
        <Text variant="micro-medium" className="text-muted-foreground">
          {title}
        </Text>
        <Button variant="tertiary" size="sm" onClick={onEdit}>
          {edit}
        </Button>
      </div>
      {children}
    </Card>
  )
}

export function ReviewStep({
  state,
  update,
  viewer,
  preview,
  onEdit,
  failure,
}: {
  state: DrawerState
  update: (patch: Partial<DrawerState>) => void
  viewer: DrawerViewer
  preview: OrderPreview | null
  onEdit: (step: number) => void
  failure: React.ReactNode
}) {
  return (
    <>
      <h3 className="text-h6 text-foreground">Review</h3>
      {failure}
      <OrderCard state={state} viewer={viewer} preview={preview} onEdit={() => onEdit(0)} />
      <FulfillmentCard state={state} onEdit={() => onEdit(1)} />
      <TransactionCard state={state} preview={preview} onEdit={() => onEdit(2)} />
      <Textarea
        label="Notes"
        placeholder="Anything the team should know"
        value={state.notes}
        onChange={(e) => update({ notes: e.target.value })}
      />
    </>
  )
}

function OrderCard({
  state,
  viewer,
  preview,
  onEdit,
}: {
  state: DrawerState
  viewer: DrawerViewer
  preview: OrderPreview | null
  onEdit: () => void
}) {
  const employees = useEmployees().data ?? []
  const customer = useAdminUser(isRefiner(state.kind) ? null : state.customer_id).data
  const refiner = (useRefiners({ enabled: isRefiner(state.kind) }).data ?? []).find(
    (row) => row.id === state.refiner_id
  )
  const assignee = state.assigned_to_id
    ? (employees.find((e) => e.user_id === state.assigned_to_id)?.name ??
      (state.assigned_to_id === viewer.id ? viewer.name : 'Assigned'))
    : 'Auto-assign'
  const count =
    state.kind === 'refiner_sale'
      ? state.lot_ids.length
      : isRefiner(state.kind)
        ? 0
        : state.lots.length
  const fine = (preview?.fine_oz ?? []).reduce((sum, row) => sum + row.oz, 0)
  const metals = (preview?.fine_oz ?? []).map((row) => row.metal_id).join(', ')
  const headline =
    state.kind === 'customer_purchase'
      ? { label: 'Payout total', value: formatMoney(preview?.total ?? 0) }
      : state.kind === 'customer_sale'
        ? { label: 'Charge total', value: formatMoney(preview?.total ?? 0) }
        : { label: 'Settlement', value: 'After assay' }

  return (
    <ReviewCard title="Order" edit="Edit order" onEdit={onEdit}>
      <div className="flex items-end justify-between gap-sm">
        <div className="flex flex-col gap-3xs">
          <Text variant="micro" className="text-muted-foreground">
            {headline.label}
          </Text>
          <Text variant="h5">{headline.value}</Text>
        </div>
        <div className="flex flex-col items-end gap-3xs">
          <Text variant="small-medium">{lotsWord(count)}</Text>
          {count > 0 && (
            <Text variant="micro" className="text-muted-foreground">
              {`Lots · ${formatOz(fine)}${metals ? ` · ${metals}` : ''}`}
            </Text>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-3xs">
        <Text variant="micro" className="text-muted-foreground">
          {`${KIND_LABEL[state.kind]} · ${assignee}`}
        </Text>
        <Text variant="small-medium">
          {isRefiner(state.kind) ? (refiner?.organization.name ?? '') : (customer?.name ?? '')}
        </Text>
      </div>
      {state.kind === 'refiner_sale' ? (
        <RefinerLots lot_ids={state.lot_ids} preview={preview} />
      ) : (
        !isRefiner(state.kind) && <CustomerLots rows={state.lots} preview={preview} />
      )}
    </ReviewCard>
  )
}

function LotLine({
  name,
  detail,
  total,
}: {
  name: string
  detail: string | null
  total: number | null
}) {
  return (
    <div className="flex items-center justify-between gap-sm border-t border-border pt-xs text-small">
      <span className="flex flex-col">
        <span className="text-foreground">{name}</span>
        {detail && <span className="text-micro text-muted-foreground">{detail}</span>}
      </span>
      {total !== null && <span className="font-medium">{formatMoney(total)}</span>}
    </div>
  )
}

function CustomerLots({ rows, preview }: { rows: LotRow[]; preview: OrderPreview | null }) {
  const products = useAdminProducts().data ?? []
  let position = 0
  return (
    <div className="flex flex-col gap-xs">
      {rows.map((row) => {
        const line: OrderPreviewLine | undefined =
          lotOf(row) === null ? undefined : preview?.lines.find((l) => l.position === position++)
        const premium = row.premium ?? (line ? percentOf(line.premium) : null)
        const name =
          row.form === 'bullion'
            ? (products.find((p) => p.id === row.bullion_id)?.name ?? 'Bullion')
            : `${row.metal_id ?? 'Metal'} scrap · ${row.pre_melt} ${row.unit}`
        return (
          <LotLine
            key={row.key}
            name={name}
            detail={premium === null ? null : `${premium}%`}
            total={line?.total ?? null}
          />
        )
      })}
    </div>
  )
}

function RefinerLots({ lot_ids, preview }: { lot_ids: string[]; preview: OrderPreview | null }) {
  const lots = useOnHandLots({ metal_id: null, q: '' }).data ?? []
  return (
    <div className="flex flex-col gap-xs">
      {lot_ids.map((id) => {
        const lot = lots.find((row) => row.id === id)
        const line = preview?.lines.find((l) => l.lot_id === id)
        return (
          <LotLine
            key={id}
            name={lot?.product_name ?? lot?.metal_id ?? 'Lot'}
            detail={lot?.reference ? `Lot ${lot.reference}` : null}
            total={line?.total ?? null}
          />
        )
      })}
    </div>
  )
}

function FulfillmentCard({ state, onEdit }: { state: DrawerState; onEdit: () => void }) {
  const refiner = isRefiner(state.kind)
  const customerMethods = useFulfillmentMethods(directionOf(state.kind), { enabled: !refiner }).data
  const refinerMethods = useRefinerFulfillmentMethods({ enabled: refiner }).data
  const methods = (refiner ? refinerMethods : customerMethods) ?? []
  const current =
    state.fulfillment === 'later' || state.fulfillment === null ? null : state.fulfillment
  const method = current ? methods.find((m) => m.id === current.method_id) : undefined

  return (
    <ReviewCard title="Fulfillment" edit="Edit fulfillment" onEdit={onEdit}>
      {method ? (
        <div className="flex flex-col gap-3xs">
          <Text variant="small-medium">{CATEGORY_TITLE[method.category] ?? method.label}</Text>
          {method.category === 'SHIPMENT' && (
            <Text variant="micro" className="text-muted-foreground">
              {HANDOFF_LABEL[method.type] ?? method.label}
            </Text>
          )}
        </div>
      ) : (
        <Text variant="small">Decide later</Text>
      )}
    </ReviewCard>
  )
}

function TransactionCard({
  state,
  preview,
  onEdit,
}: {
  state: DrawerState
  preview: OrderPreview | null
  onEdit: () => void
}) {
  const purchase = state.kind === 'customer_purchase'
  const accounts = useLinkedAccounts(purchase ? state.customer_id : null).data ?? []
  const customer = useAdminUser(purchase ? state.customer_id : null).data
  const saleMethods =
    usePaymentMethods('sale', { enabled: state.kind === 'customer_sale' }).data ?? []
  const payout = state.payout === 'later' || state.payout === null ? null : state.payout
  const account = payout?.bank_link_id
    ? accounts.find((link) => link.id === payout.bank_link_id)
    : undefined

  const spots = (preview?.spots ?? []).map((spot) => (
    <Text key={spot.metal_id} variant="micro" className="text-muted-foreground">
      {`Spot · ${spot.metal_id} ${formatMoney(spot.spot)} / t oz`}
    </Text>
  ))

  return (
    <ReviewCard title="Transaction" edit="Edit transaction" onEdit={onEdit}>
      {isRefiner(state.kind) && <Text variant="small">Settlement comes later</Text>}
      {purchase &&
        (payout ? (
          <div className="flex flex-col gap-3xs">
            <Text variant="small-medium">{PAYOUT_LABEL[payout.method] ?? payout.method}</Text>
            {account && (
              <Text variant="micro" className="text-muted-foreground">
                {accountLabel(account)}
              </Text>
            )}
            {payout.method === 'ECHECK' && (
              <Text variant="micro" className="text-muted-foreground">
                {`${customer?.email ?? ''} · email on file`}
              </Text>
            )}
            {spots}
          </div>
        ) : (
          <Text variant="small">Decide later</Text>
        ))}
      {state.kind === 'customer_sale' && (
        <div className="flex flex-col gap-xs">
          <Text variant="small-medium">
            {saleMethods.find((m) => m.id === state.payment_method_id)?.label ?? 'Decide later'}
          </Text>
          <Row label="Spot" value="Lock at placement" />
          <Row label="Credit applied" value={formatMoney(preview?.credit_applied ?? 0)} />
          <Row label="Due after credit" value={formatMoney(preview?.total_due ?? 0)} />
          {spots}
        </div>
      )}
    </ReviewCard>
  )
}
