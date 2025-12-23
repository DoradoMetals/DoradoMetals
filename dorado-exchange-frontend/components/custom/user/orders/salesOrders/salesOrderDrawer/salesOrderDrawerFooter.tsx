'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { ChevronDown } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import PriceNumberFlow from '@/components/custom/products/PriceNumberFlow'
import formatPhoneNumber from '@/shared/utils/formatPhoneNumber'

import { SalesOrderDrawerFooterProps } from '@/types/sales-orders'

export default function SalesOrderDrawerFooter({ order }: SalesOrderDrawerFooterProps) {
  const [open, setOpen] = useState({
    items: false,
    total: false,
  })

  return (
    <div className="flex flex-col w-full gap-2">
      {order.order_items.length > 0 && (
        <Accordion
          label={`Item Prices`}
          open={open.items}
          toggle={() => setOpen((prev) => ({ ...prev, items: !prev.items }))}
          total={order.item_total}
        >
          <Table className="font-normal text-neutral-700 overflow-hidden">
            <TableBody>
              {order.order_items.map((item, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  <TableCell>{item.quantity}</TableCell>
                  <TableCell>{item.product?.product_name}</TableCell>
                  <TableCell className="text-right p-0">
                    <PriceNumberFlow value={item.quantity * (item.price ?? 0)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Accordion>
      )}

      <Accordion
        label={`Total Price`}
        open={open.total}
        toggle={() => setOpen((prev) => ({ ...prev, total: !prev.total }))}
        total={order.order_total}
      >
        <div className="flex flex-col gap-2 pr-2">
          {order.used_funds && (
            <div className="flex items-center justify-between w-full">
              <div className="text-sm text-neutral-700">Dorado Funds Applied:</div>
              <div className="text-right text-sm text-neutral-800">
                <PriceNumberFlow value={order.pre_charges_amount} />
              </div>
            </div>
          )}

          {order.subject_to_charges_amount > 0 && (
            <div className="flex items-center justify-between w-full">
              <div className="text-sm text-neutral-700">
                {order.used_funds ? 'Amount Remaining: ' : 'Before Fees: '}
              </div>
              <div className="text-right text-sm text-neutral-800">
                <PriceNumberFlow value={order.subject_to_charges_amount} />
              </div>
            </div>
          )}

          {order.shipping_cost > 0 && (
            <div className="flex items-center justify-between w-full">
              <div className="text-sm text-neutral-700">Shipping Fee:</div>
              <div className="text-right text-sm text-neutral-800">
                <PriceNumberFlow value={order.shipping_cost} />
              </div>
            </div>
          )}

          {order.subject_to_charges_amount > 0 && (
            <div className="flex items-center justify-between w-full">
              <div className="text-sm text-neutral-700">Payment Fee:</div>
              <div className="text-right text-sm text-neutral-800">
                <PriceNumberFlow value={order.charges_amount} />
              </div>
            </div>
          )}
        </div>
      </Accordion>

      <div className="flex w-full justify-between items-center mt-3">
        <div className="text-sm text-neutral-700">Questions? Give us a call.</div>
        <a
          href={`tel:+1${process.env.NEXT_PUBLIC_DORADO_PHONE_NUMBER}`}
          className="text-sm hover:underline text-primary"
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
          {label === 'Shipping Cost' || label === 'Payout Fee' ? (
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
