'use client'

import { useMemo, useState } from 'react'
import {
  assignScrapItemNames,
  PurchaseOrderDrawerFooterProps,
  statusConfig,
} from '@/types/purchase-order'
import { cn } from '@/shared/utils/cn'
import { ChevronDown } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/base/table'
import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'
import formatPhoneNumber from '@/shared/utils/formatPhoneNumber'
import { payoutOptions } from '@/features/payouts/types'
import getPurchaseOrderBullionPrice from '@/utils/purchaseOrders/getPurchaseOrderBullionPrice'
import { usePurchaseOrderMetals } from '@/features/orders/purchaseOrders/users/queries'
import getPurchaseOrderScrapPrice from '@/utils/purchaseOrders/getPurchaseOrderScrapPrice'
import getPurchaseOrderTotal from '@/utils/purchaseOrders/purchaseOrderTotal'
import getPurchaseOrderScrapTotal from '@/utils/purchaseOrders/purchaseOrderScrapTotal'
import getPurchaseOrderBullionTotal from '@/utils/purchaseOrders/purchaseOrderBullionTotal'
import { useSpotPrices } from '@/features/spots/queries'

export default function PurchaseOrderDrawerFooter({ order }: PurchaseOrderDrawerFooterProps) {
  const valueLabel = statusConfig[order.purchase_order_status]?.value_label ?? ''

  const { data: spotPrices = [] } = useSpotPrices()
  const { data: orderSpotPrices = [] } = usePurchaseOrderMetals(order.id)

  const [open, setOpen] = useState({
    scrap: false,
    bullion: false,
    shipment: false,
    payout: false,
    total: false,
  })
  const rawScrapItems = order.order_items.filter((item) => item.item_type === 'scrap' && item.scrap)
  const scrapItems = assignScrapItemNames(rawScrapItems)
  const bullionItems = order.order_items.filter((item) => item.item_type === 'product')
  const payoutMethod = payoutOptions.find((p) => p.method === order.payout?.method)
  const payoutFee = payoutMethod?.cost ?? 0

  const total = useMemo(() => {
    return getPurchaseOrderTotal(order, spotPrices, orderSpotPrices)
  }, [order, spotPrices, orderSpotPrices])

  const scrapTotal = useMemo(() => {
    return getPurchaseOrderScrapTotal(scrapItems, spotPrices, orderSpotPrices)
  }, [scrapItems, spotPrices, orderSpotPrices])

  const bullionTotal = useMemo(() => {
    return getPurchaseOrderBullionTotal(bullionItems, spotPrices, orderSpotPrices)
  }, [bullionItems, spotPrices, orderSpotPrices])

  return (
    <div className="flex flex-col w-full gap-2">
      {scrapItems.length > 0 && (
        <Accordion
          label={`Scrap ${valueLabel}`}
          open={open.scrap}
          toggle={() => setOpen((prev) => ({ ...prev, scrap: !prev.scrap }))}
          total={scrapTotal}
        >
          <Table className="font-normal text-neutral-700 overflow-hidden">
            <TableHeader className="text-xs text-neutral-700 hover:bg-transparent">
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-left">Line Item</TableHead>
                <TableHead className="text-center">Content</TableHead>
                <TableHead className="text-center">Payable</TableHead>
                <TableHead className="text-right">Estimate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scrapItems.map((item, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  <TableCell className="text-left">{item.scrap?.name}</TableCell>
                  <TableCell className="text-center">
                    {item.scrap?.content?.toFixed(3)} toz
                  </TableCell>
                  <TableCell className="text-center">
                    {(
                      (item.scrap?.content ?? 0) *
                      ( item?.premium ?? item?.scrap?.bid_premium ?? 1)
                    ).toFixed(3)}{' '}
                    toz
                  </TableCell>
                  <TableCell className="text-right">
                    <PriceNumberFlow
                      value={
                        item.price ??
                        getPurchaseOrderScrapPrice(item, spotPrices, orderSpotPrices)
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Accordion>
      )}

      {bullionItems.length > 0 && (
        <Accordion
          label={`Bullion ${valueLabel}`}
          open={open.bullion}
          toggle={() => setOpen((prev) => ({ ...prev, bullion: !prev.bullion }))}
          total={bullionTotal}
        >
          <Table className="font-normal text-neutral-700 overflow-hidden">
            <TableBody>
              {bullionItems.map((item, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  <TableCell>{item.quantity}</TableCell>
                  <TableCell>{item.product?.product_name}</TableCell>
                  <TableCell className="text-right p-0">
                    <PriceNumberFlow
                      value={
                        item.quantity *
                        (item.price ??
                          getPurchaseOrderBullionPrice(
                            item.product!,
                            spotPrices,
                            orderSpotPrices,
                            item.premium ?? null
                          ))
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Accordion>
      )}

      {order.shipment && (
        <Accordion
          label="Shipping Charges"
          open={open.shipment ?? false}
          toggle={() => setOpen((prev) => ({ ...prev, shipment: !prev.shipment }))}
          total={order.shipment.shipping_charge ?? 0}
        >
          <Table className="font-normal text-neutral-700 overflow-hidden">
            <TableBody>
              <TableRow className="hover:bg-transparent">
                <TableCell>{order.shipment.shipping_service}</TableCell>
                <TableCell>{order.shipment.insured ? 'Insured' : 'Uninsured'}</TableCell>
                <TableCell className="text-right p-0">
                  -<PriceNumberFlow value={order.shipment.shipping_charge} />
                </TableCell>
              </TableRow>
              {order.purchase_order_status === 'Cancelled' && (
                <TableRow className="hover:bg-transparent">
                  <TableCell>{order.return_shipment.shipping_service} (Return)</TableCell>
                  <TableCell>{order.return_shipment.insured ? 'Insured' : 'Uninsured'}</TableCell>
                  <TableCell className="text-right p-0">
                    -<PriceNumberFlow value={order.return_shipment.shipping_charge} />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Accordion>
      )}

      {payoutFee > 0 && (
        <Accordion
          label="Payout Fee"
          open={open.payout ?? false}
          toggle={() => setOpen((prev) => ({ ...prev, payout: !prev.payout }))}
          total={payoutFee}
        >
          <Table className="font-normal text-neutral-700 overflow-hidden">
            <TableBody>
              <TableRow className="hover:bg-transparent">
                <TableCell>{payoutMethod?.label ?? 'Unknown Method'}</TableCell>
                <TableCell className="text-right p-0">
                  -<PriceNumberFlow value={payoutFee} />
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Accordion>
      )}

      <Accordion
        label={`Total ${valueLabel}`}
        open={open.total}
        toggle={() => setOpen((prev) => ({ ...prev, total: !prev.total }))}
        total={total}
      >
        <div className="grid grid-cols-2 gap-2 text-sm text-neutral-700">
          {scrapItems.length > 0 && (
            <>
              <div>Scrap:</div>
              <div className="text-right">
                <PriceNumberFlow value={scrapTotal} />
              </div>
            </>
          )}

          {bullionItems.length > 0 && (
            <>
              <div>Bullion:</div>
              <div className="text-right">
                <PriceNumberFlow value={bullionTotal} />
              </div>
            </>
          )}

          {order.shipment?.shipping_charge > 0 && (
            <>
              <div>Shipping:</div>
              <div className="text-right">
                -<PriceNumberFlow value={order.shipment.shipping_charge} />
              </div>
            </>
          )}

          {payoutFee > 0 && (
            <>
              <div>Payout Fee:</div>
              <div className="text-right">
                -<PriceNumberFlow value={payoutFee} />
              </div>
            </>
          )}

          <div className="font-medium">Total:</div>
          <div className="font-medium text-right">
            <PriceNumberFlow value={total} />
          </div>
        </div>
      </Accordion>

      <div className="flex w-full justify-between items-center mt-3">
        <div className="text-sm text-neutral-700">Questions? Give us a call.</div>
        <a
          href={`tel:+${process.env.NEXT_PUBLIC_DORADO_PHONE_NUMBER}`}
          className={cn('text-sm hover:underline text-primary')}
        >
          {formatPhoneNumber(process.env.NEXT_PUBLIC_DORADO_PHONE_NUMBER ?? '')}
        </a>
      </div>
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
    <div className="rounded-md bg-card raised-off-page">
      <button
        type="button"
        onClick={toggle}
        className="w-full p-2 flex justify-between items-center text-sm font-normal cursor-pointer"
      >
        {label}
        <div className="flex items-center gap-2 text-base">
          {label === 'Shipping Charges' || label === 'Payout Fee' ? (
            <div className="flex items-center gap-0">
              -<PriceNumberFlow value={total} />
            </div>
          ) : (
            <PriceNumberFlow value={total} />
          )}
          <div className="text-base"></div>
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
