'use client'

import { Input } from '@/shared/ui/base/input'
import { cn } from '@/shared/utils/cn'
import { assignScrapItemNames, PurchaseOrder, PurchaseOrderItem } from '@/features/orders/purchaseOrders/types'
import { usePatchShipment } from '@/features/shipping/queries'
import { usePatchRefinerItem, usePatchRefinerOrder, useRefinerOrder } from '@/features/refiners/queries'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/base/table'

export default function ActualsEditor({ order }: { order: PurchaseOrder }) {
  // Assay actuals are per-line refiner data; the pool figures are ENGAGEMENT
  // facts on refiners.orders; the shipping actual is the SHIPMENT row's.
  const patchShipment = usePatchShipment()
  const patchRefinerItem = usePatchRefinerItem()
  const patchRefinerOrder = usePatchRefinerOrder()
  // The engagement row, by the order id this component holds - its own id is
  // the PATCH's key.
  const { data: refinerOrder } = useRefinerOrder(order.id)

  const rawScrap = order.order_items.filter((it) => it.item_type === 'scrap' && it.scrap)
  const scrapItems = assignScrapItemNames(rawScrap)

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
  const mutateActuals = (
    item: PurchaseOrderItem,
    fields: Partial<{
      purity_actual: number | null
      post_melt_actual: number | null
    }>
  ) => {
    const prev = item.scrap!
    const { purity_actual, post_melt_actual } = fields

    patchRefinerItem.mutate({
      order_item_id: item.id,
      order_id: order.id,
      patch: {
        purity: purity_actual ?? prev.purity_actual ?? null,
        post_melt: post_melt_actual ?? prev.post_melt_actual ?? null,
      },
    })
  }

  return (
    <>
      <div className="flex flex-col gap-4 w-full mb-4">
        {scrapItems.length > 0 && (
          <div className="flex flex-col gap-4 w-full">
            <div className="w-full section-label">Scrap Actuals</div>
            <div className="rounded-xl on-glass overflow-hidden">
              <Table className="font-normal text-neutral-700 overflow-hidden">
                <TableHeader className="text-xs text-neutral-700 bg-muted/40">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-left">Scrap Item</TableHead>
                    <TableHead className="text-center">Actual Purity</TableHead>
                    <TableHead className="text-center">Actual Post Melt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scrapItems.map((item) => {
                    const s = item.scrap!
                    const label = s.name ?? s.metal ?? 'Scrap'
                    return (
                      <TableRow key={item.id} className="hover:bg-transparent">
                        <TableCell className="text-left">{label}</TableCell>

                        <TableCell className="text-right">
                          <div className="flex items-center gap-1 justify-end">
                            <Input
                              type="text"
                              inputMode="decimal"
                              className={cn('on-glass no-spinner text-right h-8')}
                              defaultValue={
                                s.purity_actual != null ? (s.purity_actual * 100).toFixed(1).toString() : ''
                              }
                               placeholder="Enter Actual Purity"
                              onBlur={(e) => {
                                const parsed = parsePercentToDecimal(e.target.value)
                                mutateActuals(item, { purity_actual: parsed })
                              }}
                            />
                            <span className="text-sm text-neutral-700 select-none whitespace-nowrap">
                              %
                            </span>
                          </div>
                        </TableCell>

                        <TableCell className="inline-flex items-center gap-1 whitespace-nowrap text-right">
                          <Input
                            type="number"
                            inputMode="decimal"
                            step="0.0001"
                            className={cn('on-glass no-spinner text-right h-8')}
                            defaultValue={s.post_melt_actual ?? ''}
                            placeholder="Enter Actual Post-Melt"
                            onBlur={(e) => {
                              const n = parseNumber(e.target.value)
                              mutateActuals(item, { post_melt_actual: n })
                            }}
                          />
                          <span className="text-sm text-neutral-700 whitespace-nowrap">
                            {s.gross_unit ?? 't oz'}
                          </span>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <div className="glass-divider" />
        <div className="flex flex-col gap-4 w-full">
          <div className="w-full section-label">Shipping Actual</div>

          <div className="rounded-xl on-glass overflow-hidden">
            <div className="flex items-center justify-between w-full px-3 py-2 text-xs tracking-widest text-neutral-600 bg-muted/40">
              <div>Estimate</div>
              <div className="text-right">Actual</div>
            </div>

            <div className="divide-y">
              <div className="flex items-center justify-between w-full items-center px-3 py-2 text-sm">
                <div className="truncate">
                  <span className="text-neutral-800">${order.shipment.shipping_charge}</span>
                </div>

                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="-9999"
                    className={cn('on-glass no-spinner text-right h-8')}
                    defaultValue={order.shipping_fee_actual ?? 0}
                    onBlur={(e) => {
                      if (!order.shipment.id) return
                      patchShipment.mutate({
                        shipment_id: order.shipment.id,
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
        <div className="glass-divider" />
        <div className="flex flex-col gap-4 w-full">
          <div className="w-full section-label">Pool</div>

          <div className="rounded-xl on-glass overflow-hidden">
            <div className="flex items-center justify-between w-full px-3 py-2 text-xs tracking-widest text-neutral-600 bg-muted/40">
              <div>Pool Deduction (t oz)</div>
              <div className="text-right">Pool Remediation ($)</div>
            </div>

            <div className="divide-y">
              <div className="flex items-center justify-between w-full items-center px-3 py-2 text-sm gap-2">
                <div className="truncate">
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="-9999"
                    className={cn('on-glass no-spinner text-right h-8')}
                    defaultValue={Number(order.pool_oz_deducted ?? 0).toFixed(3)}
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
                    inputMode="decimal"
                    step="0.01"
                    min="-9999"
                    className={cn('on-glass no-spinner text-right h-8')}
                    defaultValue={Number(order.pool_remediation ?? 0).toFixed(2)}
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
