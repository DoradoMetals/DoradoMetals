import { Button } from '@/components/ui/button'
import { useDownloadPackingList } from '@/lib/queries/usePDF'
import { useSpotPrices } from '@/lib/queries/useSpotPrices'
import { PurchaseOrderDrawerHeaderProps, statusConfig } from '@/types/purchase-order'
import { formatFullDate } from '@/utils/dateFormatting'
import { useFormatPurchaseOrderNumber } from '@/utils/formatPurchaseOrderNumber'
import { X } from 'lucide-react'

export default function PurchaseOrderDrawerHeader({
  order,
  username,
  setIsOrderActive,
}: PurchaseOrderDrawerHeaderProps) {
  const downloadPackingList = useDownloadPackingList()
  const { formatPurchaseOrderNumber } = useFormatPurchaseOrderNumber()
  const { data: spotPrices = [] } = useSpotPrices()

  const status = statusConfig[order.purchase_order_status]
  const Icon = status?.icon

  return (
    <div className="flex flex-col w-full border-b-1 gap-3 border-border">
      <div className="flex w-full justify-between items-center">
        <div className="text-base text-neutral-800">{formatFullDate(order.created_at)}</div>

        <div className="text-sm text-neutral-700">
          {formatPurchaseOrderNumber(order.order_number)}
        </div>
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
              onClick={() => downloadPackingList.mutate({ purchaseOrder: order, spotPrices })}
              disabled={downloadPackingList.isPending}
            >
              {downloadPackingList.isPending ? 'Loading...' : 'Download Packing List'}
            </Button>
          ) : (
            <Button
              variant="link"
              className={`font-normal text-sm bg-transparent hover:bg-transparent hover:underline-none ${status.text_color} px-0`}
            >
              Invoice
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
