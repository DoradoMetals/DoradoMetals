import { Button } from '@/components/ui/button'
import {
  useDownloadInvoice,
  useDownloadPackingList,
  useDownloadReturnPackingList,
} from '@/lib/queries/usePDF'
import { usePurchaseOrderMetals } from '@/lib/queries/usePurchaseOrders'
import { useSpotPrices } from '@/lib/queries/useSpotPrices'
import { packageOptions } from '@/types/packaging'
import { payoutOptions } from '@/types/payout'
import { PurchaseOrderDrawerHeaderProps, statusConfig } from '@/types/purchase-order'
import { useFormatPurchaseOrderNumber } from '@/utils/formatPurchaseOrderNumber'
import { CheckCheck } from 'lucide-react'

export default function PurchaseOrderDrawerHeader({
  order,
  username,
}: PurchaseOrderDrawerHeaderProps) {
  const downloadPackingList = useDownloadPackingList()
  const downloadReturnPackingList = useDownloadReturnPackingList()
  const downloadInvoice = useDownloadInvoice()
  const { formatPurchaseOrderNumber } = useFormatPurchaseOrderNumber()
  const { data: spotPrices = [] } = useSpotPrices()
  const { data: orderSpots = [] } = usePurchaseOrderMetals(order.id)

  const status = statusConfig[order.purchase_order_status] ?? ''
  const Icon = status?.icon ?? CheckCheck
  const packageDetails =
    packageOptions.find((pkg) => pkg.label === order.shipment.package) ?? packageOptions[0]
  const payoutDetails =
    payoutOptions.find((payout) => payout.method === order.payout.method) ?? payoutOptions[0]

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
    <div className="flex flex-col w-full gap-6 border-b-1 border-border">
      <div className="flex w-full justify-between items-center">
        <div className="text-base text-neutral-800">
          {formatPurchaseOrderNumber(order.order_number)}
        </div>
        <div className="text-sm text-neutral-800">{username}</div>
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
      </div>
    </div>
  )
}
