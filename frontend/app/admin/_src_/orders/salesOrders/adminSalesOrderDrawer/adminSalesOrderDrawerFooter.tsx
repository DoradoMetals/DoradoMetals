'use client'
import { Accordion, Amount, Table, TableBody, TableCell, TableRow } from '@dorado/components'

import { useState } from 'react'

import formatPhoneNumber from '@/shared/utils/formatPhoneNumber'

import { SalesOrderDrawerFooterProps } from '@/shared/types/salesOrders'
import { useSalesOrderLines } from '@/shared/hooks/useSalesOrderLines'
import { SalesOrderActionButtons } from './adminSalesOrderDrawerContents/adminSalesOrderActionButtons'

export default function AdminSalesOrderDrawerFooter({ view }: SalesOrderDrawerFooterProps) {
  const { order } = view

  // The address SNAPSHOT is its own read - a places.addresses row the server
  // resolves through orders.addresses. Only the phone number is shown here.
  const address = view.address

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
          trailing={<Amount value={view.totals?.items ?? 0} />}
        >
          <Table>
            <TableBody>
              {lines.map((item, i) => (
                <TableRow key={i}>
                  <TableCell>{item.quantity}</TableCell>
                  <TableCell>{item.name}</TableCell>
                  <TableCell className="text-right p-0">
                    <Amount value={item.line_total ?? 0} />
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
        trailing={<Amount value={view.totals?.total ?? 0} />}
      >
        <div className="flex flex-col gap-2 pr-2">
          {view.totals?.used_funds && (
            <div className="flex w-full items-center justify-between gap-2">
              <p>Dorado Funds Applied:</p>
              <strong>
                <Amount value={view.totals?.funds ?? 0} />
              </strong>
            </div>
          )}

          {(view.totals?.subject_to_charges_amount ?? 0) > 0 && (
            <div className="flex w-full items-center justify-between gap-2">
              <p>{view.totals?.used_funds ? 'Amount Remaining:' : 'Before Fees:'}</p>
              <strong>
                <Amount value={view.totals?.subject_to_charges_amount ?? 0} />
              </strong>
            </div>
          )}

          {(view.totals?.shipping ?? 0) > 0 && (
            <div className="flex w-full items-center justify-between gap-2">
              <p>Shipping Fee:</p>
              <strong>
                <Amount value={view.totals?.shipping ?? 0} />
              </strong>
            </div>
          )}

          {(view.totals?.subject_to_charges_amount ?? 0) > 0 && (
            <div className="flex w-full items-center justify-between gap-2">
              <p>Payment Fee:</p>
              <strong>
                <Amount value={view.totals?.surcharge ?? 0} />
              </strong>
            </div>
          )}
        </div>
      </Accordion>

      <SalesOrderActionButtons view={view} />
      <div className="flex w-full justify-between items-center mt-3">
        <p>Call Customer:</p>

        {address?.phone_number ? (
          <a href={`tel:+${address.phone_number}`}>
            {formatPhoneNumber(address.phone_number ?? '')}
          </a>
        ) : (
          <p>No Phone Number</p>
        )}
      </div>
    </div>
  )
}
