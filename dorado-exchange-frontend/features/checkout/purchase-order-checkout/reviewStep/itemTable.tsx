'use client'

import { Table, TableBody, TableCell, TableRow } from '@/shared/ui/base/table'
import { ChevronDown } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { useReactTable, getCoreRowModel, flexRender, ColumnDef } from '@tanstack/react-table'
import { sellCartStore } from '@/store/sellCartStore'
import { cn } from '@/shared/utils/cn'
import { SellCartItem } from '@/features/cart/types'
import getScrapPrice from '@/utils/purchaseOrders/getScrapPrice'
import getProductBidPrice from '@/features/products/utils/getProductBidPrice'
import { usePurchaseOrderCheckoutStore } from '@/store/purchaseOrderCheckoutStore'
import { payoutOptions } from '@/features/payouts/types'
import { useSpotPrices } from '@/features/spots/queries'
import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'

export default function ReviewItemTables() {
  const { data: spotPrices = [] } = useSpotPrices()

  const shippingCost = usePurchaseOrderCheckoutStore((state) => state.data.service?.netCharge)
  const payout = usePurchaseOrderCheckoutStore((state) => state.data.payout)
  const paymentCost = payoutOptions.find((p) => p.method === payout?.method)?.cost ?? 0

  const items = sellCartStore((state) => state.items)
  const bullionItems = items.filter((item) => item.type === 'product')
  const scrapItems = items.filter((item) => item.type === 'scrap')

  const total = useMemo(() => {
    const baseTotal = items.reduce((acc, item) => {
      if (item.type === 'product') {
        const spot = spotPrices.find((s) => s.type === item.data.metal_type)
        const price = getProductBidPrice(item.data, spot)
        const quantity = item.data.quantity ?? 1
        return acc + price * quantity
      }

      if (item.type === 'scrap') {
        const spot = spotPrices.find((s) => s.type === item.data.metal)
        const price = getScrapPrice(item.data.content ?? 0, item.data.bid_premium ?? 0, spot)
        return acc + price
      }

      return acc
    }, 0)

    return baseTotal - (shippingCost ?? 0 + paymentCost)
  }, [items, spotPrices, shippingCost, paymentCost])

  const scrapTotal = useMemo(() => {
    return scrapItems.reduce((acc, item) => {
      const spot = spotPrices.find((s) => s.type === item.data.metal)
      return acc + getScrapPrice(item.data.content ?? 0, item.data.bid_premium ?? 0, spot)
    }, 0)
  }, [scrapItems, spotPrices])

  const bullionTotal = useMemo(() => {
    return bullionItems.reduce((acc, item) => {
      const spot = spotPrices.find((s) => s.type === item.data.metal_type)
      return acc + getProductBidPrice(item.data, spot) * (item.data.quantity ?? 1)
    }, 0)
  }, [bullionItems, spotPrices])

  const shippingRow = useMemo(() => {
    const label =
      usePurchaseOrderCheckoutStore.getState().data.service?.serviceDescription ?? 'Unknown Service'
    return [{ label, cost: shippingCost ?? 0 }]
  }, [shippingCost])

  const payoutRow = useMemo(() => {
    const method = payoutOptions.find((p) => p.method === payout?.method)
    if (!method) return []
    return [{ label: method.label, cost: method.cost }]
  }, [payout])

  const [open, setOpen] = useState({
    scrap: false,
    bullion: false,
    shipping: false,
    payout: false,
  })

  return (
    <div className="rounded-lg border border-border overflow-hidden bg-card raised-off-page">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h2 className="text-xl text-neutral-800">Estimated Payout</h2>
        <span className="text-lg font-normal text-neutral-900">
          <PriceNumberFlow value={total ?? 0} />
        </span>
      </div>

      {scrapItems.length > 0 && (
        <ItemAccordion
          label="Scrap"
          total={scrapTotal}
          open={open.scrap}
          toggle={() => setOpen((prev) => ({ ...prev, scrap: !prev.scrap }))}
          rows={scrapItems}
          columns={scrapColumns}
        />
      )}

      {bullionItems.length > 0 && (
        <ItemAccordion
          label="Bullion"
          total={bullionTotal}
          open={open.bullion}
          toggle={() => setOpen((prev) => ({ ...prev, bullion: !prev.bullion }))}
          rows={bullionItems}
          columns={bullionColumns}
        />
      )}
      {shippingRow.length > 0 && (
        <ItemAccordion
          label="Shipping"
          total={shippingCost ?? 0}
          open={open.shipping}
          toggle={() => setOpen((prev) => ({ ...prev, shipping: !prev.shipping }))}
          rows={shippingRow}
          columns={costSummaryColumns}
        />
      )}

      {payoutRow.length > 0 && payoutRow[0].cost > 0 && (
        <ItemAccordion
          label="Payout Method Fee"
          total={payoutRow[0].cost}
          open={open.payout}
          toggle={() => setOpen((prev) => ({ ...prev, payout: !prev.payout }))}
          rows={payoutRow}
          columns={costSummaryColumns}
        />
      )}
    </div>
  )
}

function ItemAccordion<T>({
  label,
  total,
  open,
  toggle,
  rows,
  columns,
}: {
  label: string
  total: number
  open: boolean
  toggle: () => void
  rows: T[]
  columns: ColumnDef<T>[]
}) {
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        className={cn(
          'cursor-pointer w-full p-4 flex items-center justify-between',
          label === 'Bullion' && 'border-t-1 border-border'
        )}
      >
        <div className="flex items-center gap-2">
          <ChevronDown
            size={20}
            className={cn('transition-transform text-neutral-500', open && 'rotate-180')}
          />
          <span className="text-sm font-normal">{label}</span>
        </div>
        <span className="text-base text-neutral-800 font-normal">
          {label === 'Shipping' || label === 'Payout Method Fee' ? (
            <>
              -<PriceNumberFlow value={total} />
            </>
          ) : (
            <PriceNumberFlow value={total} />
          )}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key={label}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden will-change-transform"
          >
            <div className="px-2">
              <Table className="w-full">
                <TableBody>
                  {table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id} className="border-none">
                      {row.getVisibleCells().map((cell) => (
                        <TableCell className="text-left px-2 py-2 text-neutral-600" key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const scrapColumns: ColumnDef<Extract<SellCartItem, { type: 'scrap' }>>[] = [
  {
    header: 'Name',
    cell: ({ row }) => row.original.data.name || 'Unnamed',
  },
  {
    header: 'Weight',
    cell: ({ row }) => (
      <div>
        {row.original.data.pre_melt} {row.original.data.gross_unit}
      </div>
    ),
  },
  {
    header: 'Purity',
    cell: ({ row }) => <span>{(row.original.data.purity * 100).toFixed(2)}%</span>,
  },
  {
    header: 'Est. Value',
    cell: ({ row }) => {
      const { data: spotPrices = [] } = useSpotPrices()
      const spot = spotPrices.find((s) => s.type === row.original.data.metal)

      return (
        <span className="font-normal text-right block w-full">
          <PriceNumberFlow value={getScrapPrice(row.original.data.content ?? 0, row.original.data.bid_premium ?? 0, spot)} />
        </span>
      )
    },
  },
]

const bullionColumns: ColumnDef<Extract<SellCartItem, { type: 'product' }>>[] = [
  {
    header: 'Qty',
    cell: ({ row }) => row.original.data.quantity ?? 1,
  },
  {
    header: 'Name',
    cell: ({ row }) => row.original.data.product_name,
  },
  {
    header: 'Est. Value',
    cell: ({ row }) => {
      const { data: spotPrices = [] } = useSpotPrices()
      const spot = spotPrices.find((s) => s.type === row.original.data.metal_type)

      return (
        <span className="font-normal text-right block w-full">
          <PriceNumberFlow
            value={getProductBidPrice(row.original.data, spot) * (row.original.data.quantity ?? 1)}
          />
        </span>
      )
    },
  },
]

const costSummaryColumns: ColumnDef<{ label: string; cost: number }>[] = [
  {
    header: 'Type',
    accessorKey: 'label',
    cell: (info) => info.getValue(),
  },
  {
    header: 'Cost',
    accessorKey: 'cost',
    cell: ({ getValue }) => {
      const value = getValue<number>()
      return (
        <span className="font-normal text-right block w-full">
          -<PriceNumberFlow value={value} />
        </span>
      )
    },
  },
]
