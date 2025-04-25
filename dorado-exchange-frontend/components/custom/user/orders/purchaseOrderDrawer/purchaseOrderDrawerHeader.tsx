import { Button } from '@/components/ui/button'
import { PurchaseOrderDrawerHeaderProps, statusConfig } from '@/types/purchase-order'
import { formatFullDate } from '@/utils/dateFormatting'
import { useFormatPurchaseOrderNumber } from '@/utils/formatPurchaseOrderNumber'

export default function PurchaseOrderDrawerHeader({
  order,
  username,
}: PurchaseOrderDrawerHeaderProps) {
  const { formatPurchaseOrderNumber } = useFormatPurchaseOrderNumber()

  const status = statusConfig[order.purchase_order_status]
  const Icon = status?.icon

  return (
    <div className="flex flex-col w-full gap-6 border-b-1 border-border">
      <div className="flex w-full justify-between items-center">
        <div className="text-base text-neutral-800">{formatFullDate(order.created_at)}</div>

        <div className="text-sm text-neutral-700">{formatPurchaseOrderNumber(order.order_number)}</div>
      </div>
      <div className="flex w-full justify-between items-center">
        <div className="flex items-center gap-2">
          {status && Icon && (
            <div className={`${status.text_color}`}>
              <Icon size={24} />
            </div>
          )}
          <span className="text-lg text-neutral-800">{order.purchase_order_status}</span>
        </div>
        <div className="flex ml-auto">
          {order.purchase_order_status === 'In Transit' ||
          order.purchase_order_status === 'Unsettled' ? (
            <Button
              variant="link"
              className={`font-normal text-sm bg-transparent hover:bg-transparent hover:underline-none ${status.text_color} px-0`}
            >
              View Packing List
            </Button>
          ) : (
            <Button
              variant="link"
              className={`font-normal text-sm bg-transparent hover:bg-transparent hover:underline-none ${status.text_color} px-0`}
            >
              View Invoice
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
