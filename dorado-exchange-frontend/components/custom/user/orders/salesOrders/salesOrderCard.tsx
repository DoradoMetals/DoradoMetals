import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useDrawerStore } from '@/store/drawerStore'

import { formatFullDate } from '@/utils/dateFormatting'
import PriceNumberFlow from '@/components/custom/products/PriceNumberFlow'
import { SalesOrder, statusConfig } from '@/types/sales-orders'
import { useFormatSalesOrderNumber } from '@/utils/formatSalesOrderNumber'
import { AvatarCircles } from '@/components/ui/avatar-circles'
import { CaretRightIcon } from '@phosphor-icons/react'

export default function SalesOrderCard({
  order,
  setActiveOrder,
}: {
  order: SalesOrder
  setActiveOrder: (activeOrder: string) => void
}) {
  const { openDrawer } = useDrawerStore()
  const { formatSalesOrderNumber } = useFormatSalesOrderNumber()

  const status = statusConfig[order.sales_order_status]
  const Icon = status?.icon

  return (
    <div className="flex flex-col w-full bg-card h-auto rounded-lg p-4 raised-off-page">
      <div className="border-b border-border mb-3">
        <div className="flex items-center justify-between w-full pb-4">
          <div className="text-sm text-neutral-600">{formatFullDate(order.created_at)}</div>
          <div className="text-sm text-primary-gradient tracking-wide">
            {formatSalesOrderNumber(order.order_number)}
          </div>
        </div>
      </div>
      <div className="flex flex-col justify-between gap-6">
        <div className="flex items-center w-full justify-between">
          <div className="flex items-center gap-2 text-lg">
            {status && Icon && (
              <div className={`${status.text_color}`}>
                <Icon size={24} />
              </div>
            )}
            <span className="text-lg text-neutral-800">{order.sales_order_status}</span>
          </div>
          <div className="flex flex-col gap-1 items-end">
            <div className="text-lg text-neutral-800">
              <PriceNumberFlow value={order.order_total} />
            </div>
          </div>
        </div>

        <div className="flex items-end justify-between w-full">
          <div className="flex flex-col gap-1 items-start">
            <div className="text-sm text-neutral-700">
              {order.order_items.length === 0
                ? 'No Items Included'
                : `${order.order_items.length} ${
                    order.order_items.length === 1 ? 'Item' : 'Items'
                  }`}
            </div>
            <AvatarCircles
              num={order.order_items.length}
              className="bg-transparent border-none"
              avatarUrls={Object.values(order.order_items)
                .map((item) => item.product?.image_front)
                .filter((url): url is string => typeof url === 'string')
                .slice(0, 3)}
            />
          </div>

          <div className="pb-2">
            <Button
              variant="ghost"
              className={cn(
                'p-0 h-auto text-base font-normal flex items-end gap-0 min-h-4',
                statusConfig[order.sales_order_status]?.text_color
              )}
              onClick={() => {
                setActiveOrder(order.id)
                openDrawer('salesOrder')
              }}
            >
              View Order
              <CaretRightIcon size={16} className="pb-[2.5px]" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
