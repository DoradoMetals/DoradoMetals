'use client'

import { Divider, Input } from '@dorado/components'
import { cn } from '@/shared/utils/cn'
import { PurchaseOrderDrawerContentProps } from '@/features/orders/purchaseOrders/types'
import { assignScrapItemNames } from '@/features/orders/display'
import { useSpotPrices } from '@/features/spots/queries'
import { usePatchShipment, outboundOf } from '@/features/shipping/queries'
import {
  usePatchRefinerItem,
  usePatchRefinerOrder,
  useRefinerOrder,
  useRefinerItems,
} from '@/features/refiners/queries'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/base/table'
import { nameOf } from '@/features/orders/display'

export default function ActualsEditor({ view }: PurchaseOrderDrawerContentProps) {
  const { order, items } = view
  // Assay actuals are per-line refiner data; the pool figures are ENGAGEMENT
  // facts on refiners.orders; the shipping actual is the SHIPMENT row's.
  const patchShipment = usePatchShipment()
  const patchRefinerItem = usePatchRefinerItem()
  const patchRefinerOrder = usePatchRefinerOrder()
  // The engagement row, by the order id this component holds - its own id is
  // the PATCH's key.
  const { data: refinerOrder } = useRefinerOrder(order.id)
  const { data: refinerItems = [] } = useRefinerItems(order.id)

  const { data: spotPrices = [] } = useSpotPrices()
  const shipment = outboundOf(view.shipments)

  const scrapItems = assignScrapItemNames(
    items.filter((it) => it.bullion_id === null),
    (metal_id: string) => nameOf(spotPrices, metal_id)
  )
  const refinerOf = (item_id: string) =>
    refinerItems.find((r) => r.order_item_id === item_id) ?? null

  const parseNumber = (raw: string): number | null => {
    const s = raw.replace(/\s+/g, '')
    if (!s) return null
    const n = Number(s.replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }

  const parsePercentToDecimal = (raw: string): number | null => {
    const cleaned = raw.trim()
    if (!cleaned) return null
    const hasPercent = cleaned.includes('%')
    const n = parseNumber(cleaned.replace('%', ''))
    if (n == null) return null
    const decimal = hasPercent || n > 1 ? n / 100 : n
    if (!Number.isFinite(decimal)) return null
    return Math.max(0, Math.min(1, decimal))
  }

  // The assay actuals are REFINER data - what was actually recovered from the
  // parcel - so they write to the refiners feature's own item endpoint, keyed
  // by the order line, not to the customer-side scrap row. `content` is not
  // sent: the API derives it from post_melt and purity (and refuses a raw
  // value by name), which is the same arithmetic this component used to do.
  // THE ASSAY FIGURES ARE THE REFINER'S ROW, not the customer's line. They
  // rode on the composed order as scrap.purity_actual / post_melt_actual /
  // content_actual - three fields of refiners.items wearing customer-facing
  // names - and are their own read now, keyed by item_id.
  const mutateActuals = (
    item: { id: string },
    fields: Partial<{
      purity_actual: number | null
      post_melt_actual: number | null
    }>
  ) => {
    const prev = refinerOf(item.id)
    const { purity_actual, post_melt_actual } = fields

    patchRefinerItem.mutate({
      order_item_id: item.id,
      order_id: order.id,
      patch: {
        purity: purity_actual ?? prev?.purity ?? null,
        post_melt: post_melt_actual ?? prev?.post_melt ?? null,
      },
    })
  }

  return (
    <>
      <div className="flex flex-col gap-4 w-full mb-4">
        {scrapItems.length > 0 && (
          <div className="flex flex-col gap-4 w-full">
            <div className="w-full eyebrow">Scrap Actuals</div>
            <div className="rounded-xl border border-border overflow-hidden">
              <Table className="overflow-hidden">
                <TableHeader surface="card">
                  <TableRow>
                    <TableHead className="text-left">Scrap Item</TableHead>
                    <TableHead className="text-center">Actual Purity</TableHead>
                    <TableHead className="text-center">Actual Post Melt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scrapItems.map((item) => {
                    const label = item.name ?? item.metal ?? 'Scrap'
                    const s = refinerOf(item.id)
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="text-left">{label}</TableCell>

                        <TableCell className="text-right">
                          <div className="flex items-center gap-1 justify-end">
                            <Input
                              type="text"
                              inputMode="decimal"
                              inputClassName={cn('text-right h-8')}
                              defaultValue={
                                s?.purity != null ? (s.purity * 100).toFixed(1).toString() : ''
                              }
                               placeholder="Enter Actual Purity"
                              onBlur={(e) => {
                                const parsed = parsePercentToDecimal(e.target.value)
                                mutateActuals(item, { purity_actual: parsed })
                              }}
                            />
                            <small className="select-none whitespace-nowrap">
                              %
                            </small>
                          </div>
                        </TableCell>

                        <TableCell className="inline-flex items-center gap-1 whitespace-nowrap text-right">
                          <Input
                            type="number"
                            step="0.0001"
                            inputClassName={cn('text-right h-8')}
                            defaultValue={s?.post_melt ?? ''}
                            placeholder="Enter Actual Post-Melt"
                            onBlur={(e) => {
                              const n = parseNumber(e.target.value)
                              mutateActuals(item, { post_melt_actual: n })
                            }}
                          />
                          <small className="whitespace-nowrap">
                            {s?.unit ?? item.unit ?? 't oz'}
                          </small>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <Divider />
        <div className="flex flex-col gap-4 w-full">
          <div className="w-full eyebrow">Shipping Actual</div>

          <div className="rounded-xl border border-border overflow-hidden">
            <div className="flex items-center justify-between w-full px-3 py-2 eyebrow bg-muted/40">
              <div>Estimate</div>
              <div className="text-right">Actual</div>
            </div>

            <div className="divide-y">
              <div className="flex items-center justify-between w-full items-center px-3 py-2">
                <div className="truncate">
                  <span>${shipment?.cost}</span>
                </div>

                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    step="0.01"
                    min="-9999"
                    inputClassName={cn('text-right h-8')}
                    // THE PARCEL'S ACTUAL COST IS THE PARCEL'S. It rode on the
                    // order document as shipping_fee_actual, a column of
                    // orders.transactions; the row's own name is actual_cost.
                    defaultValue={shipment?.actual_cost ?? 0}
                    onBlur={(e) => {
                      if (!shipment?.id) return
                      patchShipment.mutate({
                        shipment_id: shipment.id,
                        order_id: order.id,
                        patch: { shipping_actual: Number(e.target.value) },
                      })
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
        <Divider />
        <div className="flex flex-col gap-4 w-full">
          <div className="w-full eyebrow">Pool</div>

          <div className="rounded-xl border border-border overflow-hidden">
            <div className="flex items-center justify-between w-full px-3 py-2 eyebrow bg-muted/40">
              <div>Pool Deduction (t oz)</div>
              <div className="text-right">Pool Remediation ($)</div>
            </div>

            <div className="divide-y">
              <div className="flex items-center justify-between w-full items-center px-3 py-2 gap-2">
                <div className="truncate">
                  <Input
                    type="number"
                    step="0.01"
                    min="-9999"
                    inputClassName={cn('text-right h-8')}
                    defaultValue={Number(refinerOrder?.pool_oz_deducted ?? 0).toFixed(3)}
                    onBlur={(e) => {
                      if (!refinerOrder?.id) return
                      patchRefinerOrder.mutate({
                        refiner_order_id: refinerOrder.id,
                        order_id: order.id,
                        patch: { pool_oz_deducted: Number(e.target.value) },
                      })
                    }}
                  />
                </div>

                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    step="0.01"
                    min="-9999"
                    inputClassName={cn('text-right h-8')}
                    defaultValue={Number(refinerOrder?.pool_remediation ?? 0).toFixed(2)}
                    onBlur={(e) => {
                      if (!refinerOrder?.id) return
                      patchRefinerOrder.mutate({
                        refiner_order_id: refinerOrder.id,
                        order_id: order.id,
                        patch: { pool_remediation: Number(e.target.value) },
                      })
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
