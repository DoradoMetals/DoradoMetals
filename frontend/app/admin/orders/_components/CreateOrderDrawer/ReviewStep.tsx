'use client'

import * as React from 'react'
import {
  Accordion,
  Button,
  Card,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
  Textarea,
  cn,
} from '@dorado/components'
import {
  useAddressBook,
  useAdminProducts,
  useAdminUser,
  useCarrierServices,
  useLocations,
  usePackages,
  useEmployees,
  useFulfillmentMethods,
  useFundingSources,
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
  PURITY_NAME,
  accountLabel,
  formatMoney,
  addressLabel,
  formatTime,
} from '../../_lib/createOrderView'
import { Row } from './parts'
import type { DrawerViewer } from './index'

const CATEGORY_TITLE: Record<string, string> = {
  SHIPMENT: 'Shipment',
  PICKUP: 'Dorado pickup',
  DIRECT: 'Appointment',
  DROPOFF: 'Drop-off',
}

const TOTAL_LABEL = {
  customer_purchase: 'Estimated payout',
  customer_sale: 'Estimated charge',
  refiner_purchase: 'Estimated settlement',
  refiner_sale: 'Estimated settlement',
} as const

const DASH = '—'

function ReviewCard({
  title,
  editLabel,
  onEdit,
  children,
}: {
  title: string
  editLabel: string
  onEdit: () => void
  children: React.ReactNode
}) {
  return (
    <Accordion
      label={title}
      defaultOpen
      flush
      className="w-full"
      actions={
        <Button variant="tertiary" size="sm" aria-label={editLabel} onClick={onEdit}>
          Edit
        </Button>
      }
    >
      <div className="flex flex-col gap-xs px-md pb-md pt-2xs">{children}</div>
    </Accordion>
  )
}

export function ReviewStep({
  state,
  update,
  viewer,
  preview,
  onEdit,
  mobile,
}: {
  state: DrawerState
  update: (patch: Partial<DrawerState>) => void
  viewer: DrawerViewer
  preview: OrderPreview | null
  onEdit: (step: number) => void
  mobile: boolean
}) {
  const lotted = state.kind === 'refiner_sale' || !isRefiner(state.kind)
  return (
    <>
      <h3 className="text-h6 text-foreground">Review</h3>
      <ReviewHeader state={state} viewer={viewer} preview={preview} mobile={mobile} />
      {lotted && (
        <ReviewCard title="Lots" editLabel="Edit lots" onEdit={() => onEdit(0)}>
          {state.kind === 'refiner_sale' ? (
            <RefinerLots lot_ids={state.lot_ids} preview={preview} />
          ) : (
            <CustomerLots rows={state.lots} preview={preview} />
          )}
        </ReviewCard>
      )}
      <div className={cn('grid gap-sm', mobile ? 'grid-cols-1' : 'grid-cols-2')}>
        <FulfillmentCard state={state} onEdit={() => onEdit(1)} />
        <TransactionCard state={state} preview={preview} onEdit={() => onEdit(2)} />
      </div>
      <Textarea
        label="Notes"
        placeholder="Internal note on the order (optional)"
        value={state.notes}
        onChange={(e) => update({ notes: e.target.value })}
      />
    </>
  )
}

function ReviewHeader({
  state,
  viewer,
  preview,
  mobile,
}: {
  state: DrawerState
  viewer: DrawerViewer
  preview: OrderPreview | null
  mobile: boolean
}) {
  const refiner = isRefiner(state.kind)
  const employees = useEmployees().data ?? []
  const customer = useAdminUser(refiner ? null : state.customer_id).data
  const refinerRow = (useRefiners({ enabled: refiner }).data ?? []).find(
    (row) => row.id === state.refiner_id
  )
  const assignee = state.assigned_to_id
    ? (employees.find((e) => e.user_id === state.assigned_to_id)?.name ??
      (state.assigned_to_id === viewer.id ? viewer.name : null))
    : null
  const party = refiner ? (refinerRow?.organization.name ?? '') : (customer?.name ?? '')
  const total = refiner ? 'After assay' : formatMoney(preview?.total ?? 0)

  return (
    <Card
      data-review-header
      className={cn(
        'gap-sm border-0',
        mobile ? 'flex-col items-start' : 'flex-row items-center justify-between'
      )}
    >
      <div className="flex min-w-0 flex-col gap-2xs">
        <Text variant="small" className="text-muted-foreground">
          {KIND_LABEL[state.kind]}
        </Text>
        <Text variant="stat-sm" className="text-foreground">
          {party}
        </Text>
        <Text variant="small" className="text-muted-foreground">
          {assignee ? `Assigned to ${assignee}` : 'Auto-assigned'}
        </Text>
      </div>
      <div className={cn('flex flex-col gap-2xs', mobile ? 'items-start' : 'items-end text-right')}>
        <Text variant="small" className="text-muted-foreground">
          {TOTAL_LABEL[state.kind]}
        </Text>
        <Text variant="stat" className="text-foreground">
          {total}
        </Text>
      </div>
    </Card>
  )
}

type LotTableRow = {
  key: string
  name: string
  lot: string
  qty: string
  preMelt: string
  postMelt: string
  purity: string
  premium: string
  estimate: string
}

function LotTable({ rows }: { rows: LotTableRow[] }) {
  return (
    <Table bare>
      <TableHeader>
        <TableRow>
          <TableHead fill>Item</TableHead>
          <TableHead numeric>Qty</TableHead>
          <TableHead numeric>Pre Melt</TableHead>
          <TableHead numeric>Post Melt</TableHead>
          <TableHead numeric>Purity</TableHead>
          <TableHead numeric>Premium</TableHead>
          <TableHead numeric>Estimate</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.key}>
            <TableCell fill>
              <span className="flex flex-col">
                <span className="font-medium text-foreground">{row.name}</span>
                <span className="text-micro text-muted-foreground">{row.lot}</span>
              </span>
            </TableCell>
            <TableCell numeric primary>
              {row.qty}
            </TableCell>
            <TableCell numeric primary>
              {row.preMelt}
            </TableCell>
            <TableCell numeric primary>
              {row.postMelt}
            </TableCell>
            <TableCell numeric primary>
              {row.purity}
            </TableCell>
            <TableCell numeric primary>
              {row.premium}
            </TableCell>
            <TableCell numeric primary>
              {row.estimate}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function linesByRow(rows: LotRow[], preview: OrderPreview | null) {
  let position = 0
  return rows.map((row) => {
    if (lotOf(row) === null) return undefined
    const at = position
    position += 1
    return preview?.lines.find((line) => line.position === at)
  })
}

function CustomerLots({ rows, preview }: { rows: LotRow[]; preview: OrderPreview | null }) {
  const products = useAdminProducts().data ?? []
  const lines = linesByRow(rows, preview)
  if (rows.length === 0) {
    return (
      <Text variant="small" className="text-muted-foreground">
        No lots. Add them on the order screen.
      </Text>
    )
  }
  return (
    <LotTable
      rows={rows.map((row, index) => {
        const line: OrderPreviewLine | undefined = lines[index]
        const premium = row.premium ?? (line ? percentOf(line.premium) : null)
        const bullion = row.form === 'bullion'
        return {
          key: row.key,
          name: bullion
            ? (products.find((p) => p.id === row.bullion_id)?.name ?? 'Bullion')
            : [PURITY_NAME[row.purity], row.metal_id].filter(Boolean).join(' ') || 'Scrap',
          lot: `Lot ${index + 1}`,
          qty: bullion ? row.quantity || DASH : DASH,
          preMelt: bullion ? DASH : `${row.pre_melt} ${row.unit}`,
          postMelt: DASH,
          purity: bullion || !row.purity ? DASH : `${percentOf(Number(row.purity))}%`,
          premium: premium === null ? DASH : `${premium}%`,
          estimate: line ? formatMoney(line.total) : DASH,
        }
      })}
    />
  )
}

function RefinerLots({ lot_ids, preview }: { lot_ids: string[]; preview: OrderPreview | null }) {
  const lots = useOnHandLots({ metal_id: null, q: '' }).data ?? []
  return (
    <LotTable
      rows={lot_ids.map((id) => {
        const lot = lots.find((row) => row.id === id)
        const line = preview?.lines.find((l) => l.lot_id === id)
        return {
          key: id,
          name: lot?.product_name ?? lot?.metal_id ?? 'Lot',
          lot: lot?.reference ? `Lot ${lot.reference}` : '',
          qty: lot?.quantity != null ? String(lot.quantity) : DASH,
          preMelt: DASH,
          postMelt: lot?.post_melt != null ? `${lot.post_melt} ${lot.unit ?? ''}`.trim() : DASH,
          purity: lot?.purity != null ? `${percentOf(lot.purity)}%` : DASH,
          premium: lot?.premium != null ? `${percentOf(lot.premium)}%` : DASH,
          estimate: line ? formatMoney(line.total) : DASH,
        }
      })}
    />
  )
}

type Choices = Record<string, string | null | undefined>

function choicesOf(state: DrawerState): { kind: string; choices: Choices } | null {
  if (state.fulfillment === 'later' || state.fulfillment === null) return null
  const entry = Object.entries(state.fulfillment.choices ?? {})[0]
  return entry ? { kind: entry[0], choices: (entry[1] ?? {}) as Choices } : null
}

function FulfillmentCard({ state, onEdit }: { state: DrawerState; onEdit: () => void }) {
  const refiner = isRefiner(state.kind)
  const customerMethods = useFulfillmentMethods(directionOf(state.kind), { enabled: !refiner }).data
  const refinerMethods = useRefinerFulfillmentMethods({ enabled: refiner }).data
  const services = useCarrierServices().data ?? []
  const packages = usePackages().data ?? []
  const locations = useLocations().data ?? []
  const book = useAddressBook(refiner ? null : state.customer_id).data ?? []
  const refiners = useRefiners({ enabled: refiner }).data ?? []
  const methods = (refiner ? refinerMethods : customerMethods) ?? []
  const current =
    state.fulfillment === 'later' || state.fulfillment === null ? null : state.fulfillment
  const method = current ? methods.find((m) => m.id === current.method_id) : undefined
  const picked = choicesOf(state)
  const choices = picked?.choices ?? {}

  const address = (id: string | null | undefined) => {
    const entry = id ? book.find((row) => row.address?.id === id) : undefined
    return entry ? addressLabel(entry) : null
  }
  const location = (id: string | null | undefined) =>
    (id ? locations.find((row) => row.id === id)?.name : null) ?? null
  const service = [
    services.find((row) => row.id === choices.carrier_service_id)?.name,
    packages.find((row) => row.id === choices.package_id)?.label,
  ]
    .filter(Boolean)
    .join(' · ')
  const sale = directionOf(state.kind) === 'sale'

  const from =
    picked?.kind === 'shipment'
      ? sale
        ? null
        : address(choices.shipper_address_id)
      : picked?.kind === 'pickup'
        ? address(choices.pickup_address_id)
        : picked?.kind === 'dropoff'
          ? location(choices.location_id)
          : null
  const to =
    picked?.kind === 'shipment'
      ? sale
        ? address(choices.recipient_address_id)
        : location(state.ship_to_location_id)
      : picked?.kind === 'pickup' || picked?.kind === 'direct'
        ? location(choices.location_id)
        : picked?.kind === 'dropoff'
          ? (refiners.find((row) => row.id === choices.refiner_id)?.organization.name ?? null)
          : null

  return (
    <ReviewCard title="Fulfillment" editLabel="Edit fulfillment" onEdit={onEdit}>
      <Row
        label="Type"
        value={method ? (CATEGORY_TITLE[method.category] ?? method.label) : 'Decide later'}
      />
      {method?.category === 'SHIPMENT' && (
        <Row label="Handoff" value={HANDOFF_LABEL[method.type] ?? method.label} />
      )}
      {service && <Row label="Service" value={service} />}
      {from && <Row label="From" value={from} />}
      {to && <Row label="To" value={to} />}
    </ReviewCard>
  )
}

function premiumsLine(rows: LotRow[], preview: OrderPreview | null): string | null {
  const lines = linesByRow(rows, preview)
  const byForm = new Map<string, string[]>()
  rows.forEach((row, index) => {
    const line = lines[index]
    const premium = row.premium ?? (line ? percentOf(line.premium) : null)
    if (premium === null) return
    const seen = byForm.get(row.form) ?? []
    if (!seen.includes(premium)) byForm.set(row.form, [...seen, premium])
  })
  const parts = (['scrap', 'bullion'] as const)
    .filter((form) => byForm.has(form))
    .map(
      (form) =>
        `${byForm
          .get(form)!
          .map((p) => `${p}%`)
          .join(' / ')} ${form}`
    )
  return parts.length > 0 ? parts.join(' · ') : null
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
  const sources = useFundingSources().data ?? []
  const saleMethods =
    usePaymentMethods('sale', { enabled: state.kind === 'customer_sale' }).data ?? []
  const payout = state.payout === 'later' || state.payout === null ? null : state.payout
  const account = payout?.bank_link_id
    ? accounts.find((link) => link.id === payout.bank_link_id)
    : undefined
  const source = payout?.funding_source_id
    ? sources.find((row) => row.id === payout.funding_source_id)
    : undefined
  const premium = isRefiner(state.kind) ? null : premiumsLine(state.lots, preview)
  const at = preview?.spots_at ? ` · ${formatTime(preview.spots_at)}` : ''
  const many = (preview?.spots ?? []).length > 1
  const spots = (preview?.spots ?? []).map((spot) => (
    <Row
      key={spot.metal_id}
      label="Spot locked"
      value={`${many ? `${spot.metal_id} ` : ''}${formatMoney(spot.spot)} / t oz${at}`}
    />
  ))

  return (
    <ReviewCard title="Transaction" editLabel="Edit transaction" onEdit={onEdit}>
      {isRefiner(state.kind) && <Row label="Settlement" value="Comes later, after assay" />}
      {purchase &&
        (payout ? (
          <>
            <Row label="Method" value={PAYOUT_LABEL[payout.method] ?? payout.method} />
            {account && <Row label="Payout to" value={accountLabel(account)} />}
            {payout.method === 'ECHECK' && (
              <Row label="Payout to" value={`${customer?.email ?? ''} · email on file`} />
            )}
            {source && (
              <Row
                label="Payout from"
                value={source.mask ? `${source.label} · ···· ${source.mask}` : source.label}
              />
            )}
            {spots}
            {premium && <Row label="Premium" value={premium} />}
          </>
        ) : (
          <Row label="Method" value="Decide later" />
        ))}
      {state.kind === 'customer_sale' && (
        <>
          <Row
            label="Method"
            value={
              saleMethods.find((m) => m.id === state.payment_method_id)?.label ?? 'Decide later'
            }
          />
          <Row label="Spot" value="Lock at placement" />
          <Row label="Credit applied" value={formatMoney(preview?.credit_applied ?? 0)} />
          <Row label="Due after credit" value={formatMoney(preview?.total_due ?? 0)} />
          {premium && <Row label="Premium" value={premium} />}
        </>
      )}
    </ReviewCard>
  )
}
