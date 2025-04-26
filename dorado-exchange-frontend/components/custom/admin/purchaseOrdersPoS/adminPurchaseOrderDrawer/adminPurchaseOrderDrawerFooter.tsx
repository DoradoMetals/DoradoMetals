'use client'

import { useMemo, useState } from 'react'
import { PurchaseOrderDrawerFooterProps, statusConfig } from '@/types/purchase-order'
import { cn } from '@/lib/utils'
import { ChevronDown } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'

import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import PriceNumberFlow from '@/components/custom/products/PriceNumberFlow'
import getScrapPrice from '@/utils/getScrapPrice'
import { useSpotPrices } from '@/lib/queries/useSpotPrices'
import getProductBidPrice from '@/utils/getProductBidPrice'
import { assignScrapItemNames } from '@/types/scrap'
import formatPhoneNumber from '@/utils/formatPhoneNumber'
import { PurchaseOrderActionButtons } from './adminPurchaseOrderDrawerContents/adminPurchaseOrderActionButtons'

export default function AdminPurchaseOrderDrawerFooter({ order }: PurchaseOrderDrawerFooterProps) {
  const valueLabel = statusConfig[order.purchase_order_status]?.value_label ?? ''
  const statusColor = statusConfig[order.purchase_order_status]?.text_color ?? ''

  const { data: spotPrices = [] } = useSpotPrices()

  const [open, setOpen] = useState({
    scrap: false,
    bullion: false,
    total: false,
  })
  const rawScrapItems = order.order_items.filter((item) => item.item_type === 'scrap' && item.scrap)
  const scrapItems = assignScrapItemNames(rawScrapItems.map((item) => item.scrap!))
  const bullionItems = order.order_items.filter((item) => item.item_type === 'product')

  const total = order.order_items.reduce((acc, item) => {
    if (item.item_type === 'product') {
      const price =
        item.price ??
        getProductBidPrice(
          item.product,
          spotPrices.find((s) => s.type === item?.product?.metal_type)
        )

      const quantity = item.quantity ?? 1
      return acc + price * quantity
    }

    if (item.item_type === 'scrap') {
      const price =
        item.price ??
        getScrapPrice(
          item?.scrap?.content ?? 0,
          spotPrices.find((s) => s.type === item?.scrap?.metal)
        )

      return acc + price
    }

    return acc
  }, 0)

  const scrapTotal = useMemo(() => {
    return scrapItems.reduce((acc, item) => {
      const price =
        item.price ??
        getScrapPrice(
          item?.content ?? 0,
          spotPrices.find((s) => s.type === item.metal)
        )

      return acc + price
    }, 0)
  }, [scrapItems, spotPrices])

  const bullionTotal = useMemo(() => {
    return bullionItems.reduce((acc, item) => {
      const price =
        item.price ??
        getProductBidPrice(
          item.product,
          spotPrices.find((s) => s.type === item?.product?.metal_type)
        )

      const quantity = item.quantity ?? 1
      return acc + price * quantity
    }, 0)
  }, [bullionItems, spotPrices])

  return (
    <div className="flex flex-col w-full gap-2">
      <Accordion
        label={`Scrap ${valueLabel}`}
        open={open.scrap}
        toggle={() => setOpen((prev) => ({ ...prev, scrap: !prev.scrap }))}
        total={scrapTotal}
      >
        <Table className="font-normal text-neutral-700 overflow-hidden">
          <TableBody>
            {scrapItems.map((item, i) => (
              <TableRow key={i} className='hover:bg-transparent'>
                <TableCell>{item.name}</TableCell>
                <TableCell>
                  {item.gross} {item.gross_unit}
                </TableCell>
                <TableCell>{((item.purity ?? 0) * 100).toFixed(1)}%</TableCell>
                <TableCell className="text-right p-0">
                  <PriceNumberFlow
                    value={
                      item.price ??
                      getScrapPrice(
                        item.content ?? 0,
                        spotPrices.find((s) => s.type === item?.metal)
                      )
                    }
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Accordion>

      <Accordion
        label={`Bullion ${valueLabel}`}
        open={open.bullion}
        toggle={() => setOpen((prev) => ({ ...prev, bullion: !prev.bullion }))}
        total={bullionTotal}
      >
        <Table className="font-normal text-neutral-700 overflow-hidden">
          <TableBody>
            {bullionItems.map((item, i) => (
              <TableRow key={i} className='hover:bg-transparent'>
                <TableCell>{item.product?.metal_type}</TableCell>
                <TableCell>{item.product?.product_name}</TableCell>
                <TableCell>{item.quantity}</TableCell>
                <TableCell className="text-right p-0">
                  <PriceNumberFlow
                    value={
                      item.price ??
                      getProductBidPrice(
                        item.product,
                        spotPrices.find((s) => s.type === item?.product?.metal_type)
                      )
                    }
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Accordion>

      <Accordion
        label={`Total ${valueLabel}`}
        open={open.total}
        toggle={() => setOpen((prev) => ({ ...prev, total: !prev.total }))}
        total={total}
      >
        <div className="grid grid-cols-2 gap-2 text-sm text-neutral-700">
          <div>Scrap:</div>
          <div className="text-right">
            <PriceNumberFlow value={scrapTotal} />
          </div>
          <div>Bullion:</div>
          <div className="text-right">
            <PriceNumberFlow value={bullionTotal} />
          </div>
          <div className="font-medium">Total:</div>
          <div className="font-medium text-right">
            <PriceNumberFlow value={total} />
          </div>
        </div>
      </Accordion>
      <PurchaseOrderActionButtons order={order} />
    </div>
  )
}

function Accordion({
  label,
  open,
  toggle,
  children,
  total,
}: {
  label: string
  open: boolean
  toggle: () => void
  children: React.ReactNode
  total: number
}) {
  return (
    <div className="border border-border rounded-md">
      <button
        type="button"
        onClick={toggle}
        className="w-full p-2 flex justify-between items-center text-sm font-normal cursor-pointer"
      >
        {label}
        <div className="flex items-center gap-2">
          <div className="text-base">
            <PriceNumberFlow value={total} />
          </div>
          <ChevronDown
            className={cn('h-4 w-4 transition-transform text-neutral-600', open && 'rotate-180')}
            size={20}
          />
        </div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden will-change-transform"
          >
            <div className="p-2 pr-9">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
