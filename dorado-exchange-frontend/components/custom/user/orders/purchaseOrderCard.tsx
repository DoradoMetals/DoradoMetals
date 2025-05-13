import { Button } from '@/components/ui/button'
import { useDownloadPackingList } from '@/lib/queries/usePDF'
import { useSpotPrices } from '@/lib/queries/useSpotPrices'
import { cn } from '@/lib/utils'
import { useDrawerStore } from '@/store/drawerStore'
import { packageOptions } from '@/types/packaging'
import { payoutOptions } from '@/types/payout'
import { PurchaseOrder, statusConfig } from '@/types/purchase-order'
import { formatFullDate } from '@/utils/dateFormatting'
import { useFormatPurchaseOrderNumber } from '@/utils/formatPurchaseOrderNumber'
import getProductBidPrice from '@/utils/getProductBidPrice'
import getScrapPrice from '@/utils/getScrapPrice'
import { ChevronRight } from 'lucide-react'
import PriceNumberFlow from '../../products/PriceNumberFlow'

export default function PurchaseOrderCard({
  order,
  setActivePurchaseOrder,
}: {
  order: PurchaseOrder
  setActivePurchaseOrder: (activePurchaseOrder: string) => void
}) {
  const { openDrawer } = useDrawerStore()
  const downloadPackingList = useDownloadPackingList()
  const { formatPurchaseOrderNumber } = useFormatPurchaseOrderNumber()
  const { data: spotPrices = [] } = useSpotPrices()

  const status = statusConfig[order.purchase_order_status]
  const Icon = status?.icon
  const packageDetails =
    packageOptions.find((pkg) => pkg.label === order.shipment.package) ?? packageOptions[0]
  const payoutDetails =
    payoutOptions.find((payout) => payout.method === order.payout.method) ?? payoutOptions[0]

  const total =
    order.order_items?.reduce((acc, item) => {
      if (item.product && item.item_type === 'product') {
        const spot = spotPrices.find((s) => s.type === item.product?.metal_type)
        const price = getProductBidPrice(item.product, spot)
        const quantity = item?.product?.quantity ?? item.quantity ?? 1
        return acc + price * quantity
      }
      if (item.scrap && item.item_type === 'scrap') {
        const spot = spotPrices.find((s) => s.type === item.scrap?.metal)
        const price = getScrapPrice(item.scrap?.content ?? 0, spot)
        return acc + price
      }
      return acc
    }, 0) ?? 0

  return (
    <div className="flex flex-col w-full bg-card raised-off-page h-auto rounded-lg p-4">
      <div className="border-b border-border mb-3">
        <div className="flex items-center justify-between w-full pb-4">
          <div className="text-sm text-neutral-600">{formatFullDate(order.created_at)}</div>
          <div className="text-sm text-neutral-600">
            {formatPurchaseOrderNumber(order.order_number)}
          </div>
        </div>
      </div>
      <div className="flex flex-col justify-between gap-6">
        <div className="flex items-start w-full justify-between">
          <div className="flex items-center gap-2 text-lg">
            {status && Icon && (
              <div className={`${status.text_color}`}>
                <Icon size={24} />
              </div>
            )}
            <span className="text-lg text-neutral-800">{order.purchase_order_status}</span>
          </div>
          <div className="flex flex-col gap-1 items-start">
            <div className="text-lg text-neutral-800">
              <PriceNumberFlow value={total} />
            </div>
            <div className="text-sm text-neutral-700">
              {order.order_items.length === 0
                ? 'No Items Included'
                : `${order.order_items.length} ${
                    order.order_items.length === 1 ? 'Item' : 'Items'
                  }`}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between w-full">
          <div className="">
            {order.purchase_order_status === 'In Transit' ||
            order.purchase_order_status === 'Unsettled' ? (
              <Button
                variant="link"
                className={`font-normal text-base bg-transparent hover:bg-transparent hover:underline-none ${status.text_color} px-0`}
                onClick={() =>
                  downloadPackingList.mutate({
                    purchaseOrder: order,
                    spotPrices,
                    packageDetails,
                    payoutDetails,
                  })
                }
                disabled={downloadPackingList.isPending}
              >
                {downloadPackingList.isPending ? 'Loading...' : 'Download Packing List'}
              </Button>
            ) : (
              <Button
                variant="ghost"
                className={`font-normal text-sm bg-transparent hover:bg-transparent hover:underline-none ${status.text_color} p-0`}
              >
                Invoice
              </Button>
            )}
          </div>
          <div>
            <Button
              variant="ghost"
              className={cn(
                'p-0 h-auto text-base font-normal flex items-end gap-0 min-h-4',
                statusConfig[order.purchase_order_status]?.text_color
              )}
              onClick={() => {
                setActivePurchaseOrder(order.id)
                openDrawer('purchaseOrder')
              }}
            >
              View Order
              <ChevronRight size={16} className='pb-[2px]' />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
