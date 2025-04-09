import { useAdminPurchaseOrders } from '@/lib/queries/admin/useAdminPurchaseOrders'
import { statusConfig } from '@/types/admin'
import { Fragment } from 'react'

export default function PurchaseOrderCards() {
  const { data: purchaseOrders = [] } = useAdminPurchaseOrders()

  const statusCounts = purchaseOrders.reduce<Record<string, number>>((acc, order) => {
    const status = order.order_status
    acc[status] = (acc[status] || 0) + 1
    return acc
  }, {})

  const orderedStatuses = [
    'In Transit',
    'Unsettled',
    'Filled',
    'Accepted',
    'Rejected',
    'Settled',
    'Cancelled',
    'Completed',
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {orderedStatuses.map((status) => {
        const config = statusConfig[status]
        if (!config) return <Fragment key={status} />

        const Icon = config.icon
        const count = statusCounts[status] ?? 0

        return (
          <div
            key={status}
            className="hidden sm:flex items-center justify-between rounded-lg p-4  bg-card shadow-lg"
          >
            <div className="flex w-full items-center gap-2 justify-between">
              <Icon size={42} className={config.text_color} />
              <div className="flex flex-col ml-auto items-end">
                <div className="text-2xl text-neutral-900">{count}</div>
                <h2 className="text-base text-neutral-600">{status}</h2>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
