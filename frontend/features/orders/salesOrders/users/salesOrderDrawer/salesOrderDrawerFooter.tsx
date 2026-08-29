'use client'

import { useState } from 'react'
import { Table, TableBody, TableCell, TableRow } from '@/shared/ui/base/table'
import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'
import formatPhoneNumber from '@/shared/utils/formatPhoneNumber'
import AccordionSection from '@/shared/ui/AccordionSection'
import { DetailRow } from '@/shared/ui/DetailRow'

import { SalesOrderDrawerFooterProps } from '@/features/orders/salesOrders/types'
import { useSalesOrderLines } from '@/features/orders/salesOrders/users/salesOrderDrawer/drawerContents/useSalesOrderLines'

export default function SalesOrderDrawerFooter({ order }: SalesOrderDrawerFooterProps) {
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
        <AccordionSection
          label="Item Prices"
          open={open.items}
          onToggle={() => setOpen((prev) => ({ ...prev, items: !prev.items }))}
          total={order.totals?.items ?? 0}
        >
          <Table>
            <TableBody>
              {lines.map((item, i) => (
                <TableRow key={i}>
                  <TableCell>{item.quantity}</TableCell>
                  <TableCell>{item.name}</TableCell>
                  <TableCell className="text-right p-0">
                    <PriceNumberFlow value={(item.quantity ?? 0) * (item.price ?? 0)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </AccordionSection>
      )}

      <AccordionSection
        label="Total Price"
        open={open.total}
        onToggle={() => setOpen((prev) => ({ ...prev, total: !prev.total }))}
        total={order.totals?.total ?? 0}
      >
        <div className="flex flex-col gap-2 pr-2">
          {order.totals?.used_funds && (
            <DetailRow label="Dorado Funds Applied:">
              <PriceNumberFlow value={order.totals?.funds ?? 0} />
            </DetailRow>
          )}

          {(order.totals?.subject_to_charges_amount ?? 0) > 0 && (
            <DetailRow label={order.totals?.used_funds ? 'Amount Remaining:' : 'Before Fees:'}>
              <PriceNumberFlow value={order.totals?.subject_to_charges_amount ?? 0} />
            </DetailRow>
          )}

          {(order.totals?.shipping ?? 0) > 0 && (
            <DetailRow label="Shipping Fee:">
              <PriceNumberFlow value={order.totals?.shipping ?? 0} />
            </DetailRow>
          )}

          {(order.totals?.subject_to_charges_amount ?? 0) > 0 && (
            <DetailRow label="Payment Fee:">
              <PriceNumberFlow value={order.totals?.surcharge ?? 0} />
            </DetailRow>
          )}
        </div>
      </AccordionSection>

      <div className="flex w-full justify-between items-center mt-3">
        <p>Questions? Give us a call.</p>
        <a href={`tel:+1${process.env.NEXT_PUBLIC_DORADO_PHONE_NUMBER}`}>
          {formatPhoneNumber(process.env.NEXT_PUBLIC_DORADO_PHONE_NUMBER ?? '')}
        </a>
      </div>
    </div>
  )
}
