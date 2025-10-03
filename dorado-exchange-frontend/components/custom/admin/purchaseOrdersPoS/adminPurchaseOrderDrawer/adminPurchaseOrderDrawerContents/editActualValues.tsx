'use client'

import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { assignScrapItemNames, PurchaseOrder, PurchaseOrderItem } from '@/types/purchase-order'
import {
  useUpdateOrderScrapItem,
  useUpdateShippingActual,
} from '@/lib/queries/admin/useAdminPurchaseOrders'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export default function ActualsEditor({ order }: { order: PurchaseOrder }) {
  const updateOrderItem = useUpdateOrderScrapItem()
  const updateShippingFee = useUpdateShippingActual()

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

  const mutateActuals = (
    item: PurchaseOrderItem,
    fields: Partial<{
      purity_actual: number | null
      post_melt_actual: number | null
      content_actual: number | null
    }>
  ) => {
    const prev = item.scrap!
    let { purity_actual, post_melt_actual, content_actual } = fields

    const purityVal = purity_actual ?? prev.purity_actual ?? null
    const postVal = post_melt_actual ?? prev.post_melt_actual ?? null
    if (
      (content_actual == null || Number.isNaN(content_actual)) &&
      purityVal != null &&
      postVal != null
    ) {
      const calc = postVal * purityVal
      if (Number.isFinite(calc)) content_actual = calc
    }

    const updatedItem: PurchaseOrderItem = {
      ...item,
      scrap: {
        ...prev,
        purity_actual: purity_actual ?? prev.purity_actual ?? null,
        post_melt_actual: post_melt_actual ?? prev.post_melt_actual ?? null,
        content_actual: content_actual ?? prev.content_actual ?? null,
      },
    }

    updateOrderItem.mutate(updatedItem)
  }

  if (scrapItems.length === 0) return null

  return (
    <>
      {order && (
        <div className="flex flex-col gap-4 w-full">
          <div className="flex flex-col gap-4 w-full">
            <div className="w-full section-label">Update Scrap Actuals</div>
            <div className="rounded-xl border border-border bg-card raised-off-page overflow-hidden">
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
                              className={cn('input-floating-label-form no-spinner text-right h-8')}
                              defaultValue={
                                s.purity_actual != null ? (s.purity_actual * 100).toString() : ''
                              }
                              placeholder={`${(s.purity ?? 0) * 100}`}
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
                            className={cn('input-floating-label-form no-spinner text-right h-8')}
                            defaultValue={s.post_melt_actual ?? ''}
                            placeholder={`${s.post_melt ?? ''}`}
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

          <div className="separator-inset" />
          <div className="flex flex-col gap-4 w-full">
            <div className="w-full section-label">Update Shipping Actual</div>

            <div className="rounded-xl border border-border bg-card raised-off-page overflow-hidden">
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
                      className={cn('input-floating-label-form no-spinner text-right h-8')}
                      defaultValue={order.shipping_fee_actual ?? 0}
                      onBlur={(e) =>
                        updateShippingFee.mutate({
                          purchase_order_id: order.id,
                          shipping_fee_actual: Number(e.target.value),
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="separator-inset" />
        </div>
      )}
    </>
  )
}
