'use client'

import {
  Divider,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@dorado/components'
import { cn } from '@/shared/utils/cn'
import { PurchaseOrderDrawerContentProps } from '@/shared/types/purchaseOrders'
import { useSpotPrices } from '@/shared/hooks/spots/queries'
import { usePatchShipment, outboundOf } from '../../../../shipping/queries'
import { useOrderShipments } from '@dorado/client'
import { usePatchOrderLot } from '@dorado/client'

export default function ActualsEditor({ view }: PurchaseOrderDrawerContentProps) {
  const { order, lots } = view
  // THE ASSAY ACTUALS ARE THE LOT'S OWN (docs/waves/lots-build.md). They used
  // to be `refiners.items` rows keyed by an order line - three columns of a
  // per-order engagement wearing customer-facing names. `refiners.*` is dead:
  // the lot IS the physical thing, it keeps its id from the basket to the
  // refiner, and `PATCH /api/orders/lots/:id` writes the weights straight
  // onto it. The shipping actual is still the SHIPMENT row's.
  const patchShipment = usePatchShipment()
  const patchLot = usePatchOrderLot()

  const { data: spotPrices = [] } = useSpotPrices()
  const { data: shipments = [] } = useOrderShipments(order.id)
  const shipment = outboundOf(shipments)

  const scrapItems = lots.filter((row) => row.lot.bullion_id === null)

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

  // ONE FIELD PER BLUR, and nothing is re-sent alongside it. `buildUpdate`
  // sets the keys present and leaves the rest alone, so the read-modify-write
  // this used to do (send both columns, filling the other from a cached row)
  // is the thing that could lose an edit made in between. `content` is not
  // sent: the database generates it from post_melt and purity.
  const mutateActuals = (
    row: { id: string },
    patch: Partial<{ purity: number | null; post_melt: number | null }>
  ) => patchLot.mutate({ lot_id: row.id, order_id: order.id, patch })

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
                  {scrapItems.map((row) => {
                    const label = row.lot.metal_id
                    const s = row.lot
                    return (
                      <TableRow key={row.id}>
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
                                mutateActuals(row, { purity: parsed })
                              }}
                            />
                            <small className="select-none whitespace-nowrap">%</small>
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
                              mutateActuals(row, { post_melt: n })
                            }}
                          />
                          <small className="whitespace-nowrap">{s.unit}</small>
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
                  <span>${shipment?.shipment.cost}</span>
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
                    defaultValue={shipment?.shipment.actual_cost ?? 0}
                    onBlur={(e) => {
                      if (!shipment?.shipment.id) return
                      patchShipment.mutate({
                        shipment_id: shipment.shipment.id,
                        patch: { shipping_actual: Number(e.target.value) },
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
