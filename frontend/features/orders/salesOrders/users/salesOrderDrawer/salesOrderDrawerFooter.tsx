'use client'
import { Accordion } from '@dorado/components'

import { useState } from 'react'
import { Table, TableBody, TableCell, TableRow } from '@/shared/ui/base/table'
import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'
import formatPhoneNumber from '@/shared/utils/formatPhoneNumber'
import { DetailRow } from '@/shared/ui/DetailRow'

import { SalesOrderDrawerFooterProps } from '@/features/orders/salesOrders/types'
import { useSalesOrderLines } from '@/features/orders/salesOrders/users/salesOrderDrawer/drawerContents/useSalesOrderLines'

export default function SalesOrderDrawerFooter({ view }: SalesOrderDrawerFooterProps) {
  const { order } = view

  // A CONTAINER (ruling 14): the lines are their own read, named against the
  // cached catalogue - the order document carries neither.
  const lines = useSalesOrderLines(view)

  const [open, setOpen] = useState({
    items: false,
    total: false,
  })

  return (
    <div className="flex flex-col w-full gap-2">
      {lines.length > 0 && (
        <Accordion
          surface="bare"
          label="Item Prices"
          open={open.items}
          onToggle={() => setOpen((prev) => ({ ...prev, items: !prev.items }))}
          trailing={<PriceNumberFlow value={view.totals?.items ?? 0} />}
        >
          <Table>
            <TableBody>
              {lines.map((item, i) => (
                <TableRow key={i}>
                  <TableCell>{item.quantity}</TableCell>
                  <TableCell>{item.name}</TableCell>
                  <TableCell className="text-right p-0">
                    <PriceNumberFlow value={item.line_total ?? 0} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Accordion>
      )}

      <Accordion
        surface="bare"
        label="Total Price"
        open={open.total}
        onToggle={() => setOpen((prev) => ({ ...prev, total: !prev.total }))}
        trailing={<PriceNumberFlow value={view.totals?.total ?? 0} />}
      >
        <div className="flex flex-col gap-2 pr-2">
          {view.totals?.used_funds && (
            <DetailRow label="Dorado Funds Applied:">
              <PriceNumberFlow value={view.totals?.funds ?? 0} />
            </DetailRow>
          )}

          {(view.totals?.subject_to_charges_amount ?? 0) > 0 && (
            <DetailRow label={view.totals?.used_funds ? 'Amount Remaining:' : 'Before Fees:'}>
              <PriceNumberFlow value={view.totals?.subject_to_charges_amount ?? 0} />
            </DetailRow>
          )}

          {(view.totals?.shipping ?? 0) > 0 && (
            <DetailRow label="Shipping Fee:">
              <PriceNumberFlow value={view.totals?.shipping ?? 0} />
            </DetailRow>
          )}

          {(view.totals?.subject_to_charges_amount ?? 0) > 0 && (
            <DetailRow label="Payment Fee:">
              <PriceNumberFlow value={view.totals?.surcharge ?? 0} />
            </DetailRow>
          )}
        </div>
      </Accordion>

      <div className="flex w-full justify-between items-center mt-3">
        <p>Questions? Give us a call.</p>
        <a href={`tel:+1${process.env.NEXT_PUBLIC_DORADO_PHONE_NUMBER}`}>
          {formatPhoneNumber(process.env.NEXT_PUBLIC_DORADO_PHONE_NUMBER ?? '')}
        </a>
      </div>
    </div>
  )
}
