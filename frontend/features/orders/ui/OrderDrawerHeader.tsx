'use client'

import type { ComponentType, ReactNode } from 'react'
import { Button, Download } from '@dorado/components'

/* ============================================================================
   ORDER DRAWER HEADER — the same 34 lines, four times.
   ----------------------------------------------------------------------------
   Every order drawer opens with it: a two-leaf identity row, then the status
   with its icon on the left and whatever PDFs this status offers on the right.
   `purchaseOrderDrawerHeader`, `salesOrderDrawerHeader`,
   `adminPurchaseOrderDrawerHeader` and `adminSalesOrderDrawerHeader` each
   spelled it out, and — as ever — the four copies had drifted apart in ways
   nobody chose:

     * TWO drew a `<DownloadIcon>` beside the button label and two did not,
       so the same action looked like two different actions depending on which
       drawer you had open.
     * The button's className was `flex items-center justify-start gap-2 px-0`
       at two and `px-0` at the other two.
     * The status icon's wrapper was `<div className="text-primary">` at three
       and, at two of those, the genuinely strange `className={`${'text-primary'}`}`
       — a template literal interpolating a constant string.
     * The admin purchase header put `<strong>` on BOTH leaves of the identity
       row while the other three used `<strong>` and `<small>`.

   The download list is filtered HERE by status, because
   `statuses.includes(status)` is a pure function of props — this component
   takes no hooks and reads no context, which is what ruling 14 means by
   presentational, and is why it renders under jsdom with nothing stood up.
   ============================================================================ */

export type OrderDownload = {
  /** The order statuses at which this download is offered. */
  statuses: readonly string[]
  label: string
  onClick: () => void
  isPending: boolean
}

export type OrderDrawerHeaderProps = {
  /** The identity row's left leaf — a date, or the order number. */
  primary: ReactNode
  /** Its right leaf — the order number, or the customer. */
  secondary: ReactNode
  status: string | null | undefined
  icon?: ComponentType<{ size?: number }>
  downloads?: readonly OrderDownload[]
}

export function OrderDrawerHeader({
  primary,
  secondary,
  status,
  icon: Icon,
  downloads = [],
}: OrderDrawerHeaderProps) {
  const offered = downloads.filter((d) => d.statuses.includes(status ?? ''))

  return (
    <header className="flex w-full flex-col gap-3 border-b-1 border-border">
      <div className="flex w-full items-center justify-between">
        <strong>{primary}</strong>
        <small>{secondary}</small>
      </div>

      <div className="flex w-full items-center justify-between">
        <div className="flex items-center gap-2 text-primary">
          {Icon ? <Icon size={24} /> : null}
          <strong className="stat-sm">{status}</strong>
        </div>

        <div className="ml-auto flex">
          {offered.map(({ label, onClick, isPending }) => (
            <Button
              key={label}
              variant="tertiary"
              className="flex items-center gap-2 px-0"
              onClick={onClick}
              disabled={isPending}
            >
              <Download size={20} />
              {isPending ? 'Loading...' : label}
            </Button>
          ))}
        </div>
      </div>
    </header>
  )
}

export default OrderDrawerHeader
