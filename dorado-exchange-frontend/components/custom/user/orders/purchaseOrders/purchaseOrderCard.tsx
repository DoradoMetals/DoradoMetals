import { Button } from '@/components/ui/button'
import {
  useDownloadInvoice,
  useDownloadPackingList,
  useDownloadReturnPackingList,
} from '@/lib/queries/usePDF'
import { useSpotPrices } from '@/lib/queries/useSpotPrices'
import { cn } from '@/lib/utils'
import { useDrawerStore } from '@/store/drawerStore'
import { packageOptions } from '@/types/packaging'
import { payoutOptions } from '@/types/payout'
import { PurchaseOrder, statusConfig } from '@/types/purchase-order'
import { formatFullDate } from '@/utils/dateFormatting'
import { useFormatPurchaseOrderNumber } from '@/utils/formatPurchaseOrderNumber'
import { ChevronRight } from 'lucide-react'
import { usePurchaseOrderMetals } from '@/lib/queries/usePurchaseOrders'
import { useMemo } from 'react'
import getPurchaseOrderTotal from '@/utils/purchaseOrderTotal'
import PriceNumberFlow from '@/components/custom/products/PriceNumberFlow'

export default function PurchaseOrderCard({
  order,
  setActivePurchaseOrder,
}: {
  order: PurchaseOrder
  setActivePurchaseOrder: (activePurchaseOrder: string) => void
}) {
  const { openDrawer } = useDrawerStore()
  const downloadPackingList = useDownloadPackingList()
  const downloadReturnPackingList = useDownloadReturnPackingList()
  const downloadInvoice = useDownloadInvoice()

  const { formatPurchaseOrderNumber } = useFormatPurchaseOrderNumber()
  const { data: spotPrices = [] } = useSpotPrices()
  const { data: orderSpots = [] } = usePurchaseOrderMetals(order.id)

  const status = statusConfig[order.purchase_order_status]
  const Icon = status?.icon
  const packageDetails = packageOptions.find((pkg) => pkg.label === order.shipment.package) ?? packageOptions[0]
  const payoutDetails = payoutOptions.find((payout) => payout.method === order.payout.method) ?? payoutOptions[0]

  const total = useMemo(() => {
    return getPurchaseOrderTotal(order, spotPrices, orderSpots)
  }, [order, spotPrices, orderSpots])

  const downloadOptions = [
    {
      statuses: ['In Transit'],
      label: 'Download Label + Packing List',
      onClick: () => {
        downloadPackingList.mutate({
          purchaseOrder: order,
          spotPrices,
          packageDetails,
          payoutDetails,
        })
      },
      isPending: downloadPackingList.isPending,
    },
    {
      statuses: ['Cancelled'],
      label: 'Download Label + Packing List',
      onClick: () => {
        downloadReturnPackingList.mutate({
          purchaseOrder: order,
          spotPrices,
        })
      },
      isPending: downloadReturnPackingList.isPending,
    },
    {
      statuses: ['Received', 'Offer Sent', 'Rejected'],
      label: 'Download Invoice Preview',
      onClick: () =>
        downloadInvoice.mutate({
          purchaseOrder: order,
          spotPrices,
          orderSpots,
          fileName: 'invoice_preview',
        }),
      isPending: downloadInvoice.isPending,
    },
    {
      statuses: ['Accepted', 'Payment Processing', 'Completed'],
      label: 'Download Invoice',
      onClick: () =>
        downloadInvoice.mutate({
          purchaseOrder: order,
          spotPrices,
          orderSpots,
          fileName: 'invoice',
        }),
      isPending: downloadInvoice.isPending,
    },
  ]

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
            {downloadOptions.map(({ statuses, label, onClick, isPending }, index) =>
              statuses.includes(order.purchase_order_status) ? (
                <Button
                  key={index}
                  variant="link"
                  className={`font-normal text-sm bg-transparent hover:bg-transparent ${status.text_color} px-0`}
                  onClick={onClick}
                  disabled={isPending}
                >
                  {isPending ? 'Loading...' : label}
                </Button>
              ) : null
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
              <ChevronRight size={16} className="pb-[2px]" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
