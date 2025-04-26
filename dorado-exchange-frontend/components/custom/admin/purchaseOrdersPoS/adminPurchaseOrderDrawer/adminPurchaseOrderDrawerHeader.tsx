import { Button } from '@/components/ui/button'
import { PurchaseOrderDrawerHeaderProps, statusConfig } from '@/types/purchase-order'
import { useFormatPurchaseOrderNumber } from '@/utils/formatPurchaseOrderNumber'
import { CheckCheck } from 'lucide-react'

export default function PurchaseOrderDrawerHeader({
  order,
  username,
}: PurchaseOrderDrawerHeaderProps) {
  const { formatPurchaseOrderNumber } = useFormatPurchaseOrderNumber()

  const status = statusConfig[order.purchase_order_status] ?? ''
  const Icon = status?.icon ?? CheckCheck

  return (
    <div className="flex flex-col w-full gap-6 border-b-1 border-border">
      <div className="flex w-full justify-between items-center">
        <div className="text-base text-neutral-800">
          {formatPurchaseOrderNumber(order.order_number)}
        </div>
        <div className="text-sm text-neutral-800">{username}</div>
      </div>
      <div className="flex w-full justify-between items-start">
        <div className="flex items-center gap-2">
          {status && Icon && (
            <div className={`${status.text_color}`}>
              <Icon size={24} />
            </div>
          )}
          <span className="text-2xl text-neutral-800">{order.purchase_order_status}</span>
        </div>
        <div className="flex ml-auto">
          <Button
            variant="link"
            className={`text-xs bg-transparent hover:bg-transparent hover:underline-none ${status.text_color} px-0`}
          >
            View Purchase Order PDF
          </Button>
        </div>
      </div>
    </div>
  )
}
