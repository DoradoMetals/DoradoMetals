'use client'

import { PurchaseOrderDrawerContentProps, statusConfig } from '@/types/purchase-order'
import { cn } from '@/lib/utils'

export default function ReceivedPurchaseOrder({ order }: PurchaseOrderDrawerContentProps) {
  const config = statusConfig[order.purchase_order_status]

  const totalItems = order.order_items.length
  const confirmedItems = order.order_items.filter((item) => item.confirmed).length
  const percent = totalItems > 0 ? Math.round((confirmedItems / totalItems) * 100) : 0

  return (
    <div className="flex flex-col items-center justify-center sm:px-6 w-full h-full raised-off-page bg-card p-4 rounded-lg">
      <h2 className="text-2xl text-neutral-800 mb-2">Your package has arrived!</h2>
      <config.icon className={cn(config.text_color, 'mb-6')} size={128} strokeWidth={1.5} />

      <p className="text-sm text-neutral-700 mb-6 lg:px-14 text-center">
        We have received your package and are now in the process of evaluating and assaying your
        items.
      </p>

      <div className="flex flex-col items-center w-full gap-1 mt-4">
        <div className="w-full text-sm text-neutral-800 flex justify-between">
          <span>
            {percent === 100 ? 'Evaluation Complete! Sending offer...' : 'Assaying metals...'}
          </span>
          <span>{percent}%</span>
        </div>

        <div className="w-full h-3 bg-card rounded-lg recessed-into-page">
          <div
            className={cn(
              'h-full transition-all duration-300',
              percent === 100 ? 'rounded-full' : 'rounded-l-full',
              config.gradient
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="w-full text-sm text-neutral-800 flex justify-between">
          <span>
            {confirmedItems} of {totalItems} {totalItems === 1 ? 'item' : 'items'} processed
          </span>
        </div>
      </div>
    </div>
  )
}
