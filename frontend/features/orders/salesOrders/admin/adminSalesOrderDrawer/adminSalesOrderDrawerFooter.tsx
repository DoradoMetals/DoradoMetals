'use client'

import { useState } from 'react'

import { cn } from '@/shared/utils/cn'
import { ChevronDown } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'

import { Table, TableBody, TableCell, TableRow } from '@/shared/ui/base/table'
import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'
import formatPhoneNumber from '@/shared/utils/formatPhoneNumber'

import { SalesOrderDrawerFooterProps, statusConfig } from '@/features/orders/salesOrders/types'
import { useSalesOrderLines } from '@/features/orders/salesOrders/users/salesOrderDrawer/drawerContents/useSalesOrderLines'
import { useOrderAddress } from '@/features/orders/reads'
import { SalesOrderActionButtons } from '@/features/orders/salesOrders/admin/adminSalesOrderDrawer/adminSalesOrderDrawerContents/adminSalesOrderActionButtons'

export default function AdminSalesOrderDrawerFooter({ order }: SalesOrderDrawerFooterProps) {
  const statusColor = 'text-primary'
  // The address SNAPSHOT is its own read - a places.addresses row the server
  // resolves through orders.addresses. Only the phone number is shown here.
  const { data: address } = useOrderAddress(order.id)

  // A CONTAINER (ruling 14): the lines are their own read, named against the
  // cached catalogue - the order document carries neither.
  const lines = useSalesOrderLines(order.id)

  const [open, setOpen] = useState({
    items: false,
    total: false,
  })

  return (
    <div className="flex flex-col w-full gap-2">
      {lines.length > 0 && (
        <Accordion
          label={`Item Prices`}
          open={open.items}
          toggle={() => setOpen((prev) => ({ ...prev, items: !prev.items }))}
          total={order.totals?.items ?? 0}
        >
          <Table className="font-normal text-neutral-700 overflow-hidden">
            <TableBody>
              {lines.map((item, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  <TableCell>{item.quantity}</TableCell>
                  <TableCell>{item.name}</TableCell>
                  <TableCell className="text-right p-0">
                    <PriceNumberFlow value={(item.quantity ?? 0) * (item.price ?? 0)} />
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
        total={order.totals?.total ?? 0}
      >
        <div className="flex flex-col gap-2 pr-2">
          {order.totals?.used_funds && (
            <div className="flex items-center justify-between w-full">
              <div className="text-sm text-neutral-700">Dorado Funds Applied:</div>
              <div className="text-right text-sm text-neutral-800">
                <PriceNumberFlow value={order.totals?.funds ?? 0} />
              </div>
            </div>
          )}

          {(order.totals?.subject_to_charges_amount ?? 0) > 0 && (
            <div className="flex items-center justify-between w-full">
              <div className="text-sm text-neutral-700">
                {order.totals?.used_funds ? 'Amount Remaining: ' : 'Before Fees: '}
              </div>
              <div className="text-right text-sm text-neutral-800">
                <PriceNumberFlow value={order.totals?.subject_to_charges_amount ?? 0} />
              </div>
            </div>
          )}

          {(order.totals?.shipping ?? 0) > 0 && (
            <div className="flex items-center justify-between w-full">
              <div className="text-sm text-neutral-700">Shipping Fee:</div>
              <div className="text-right text-sm text-neutral-800">
                <PriceNumberFlow value={order.totals?.shipping ?? 0} />
              </div>
            </div>
          )}

          {(order.totals?.subject_to_charges_amount ?? 0) > 0 && (
            <div className="flex items-center justify-between w-full">
              <div className="text-sm text-neutral-700">Payment Fee:</div>
              <div className="text-right text-sm text-neutral-800">
                <PriceNumberFlow value={order.totals?.surcharge ?? 0} />
              </div>
            </div>
          )}
        </div>
      </Accordion>

      <SalesOrderActionButtons order={order} />
      <div className="flex w-full justify-between items-center mt-3">
        <div className="text-sm text-neutral-700">Call Customer:</div>

        {address?.phone_number ? (
          <a
            href={`tel:+${address.phone_number}`}
            className={cn('text-sm hover:underline', statusColor)}
          >
            {formatPhoneNumber(address.phone_number ?? '')}
          </a>
        ) : (
          <div className="text-sm">No Phone Number </div>
        )}
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
    <div className="rounded-md on-glass">
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
