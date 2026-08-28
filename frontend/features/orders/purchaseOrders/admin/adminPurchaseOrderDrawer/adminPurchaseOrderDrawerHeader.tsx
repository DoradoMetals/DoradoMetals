import { Button } from '@/shared/ui/base/button'
import {
  useDownloadInvoice,
  useDownloadPackingList,
  useDownloadReturnPackingList,
} from '@/features/pdfs/queries'
import { packageOptions } from '@/features/packaging/types'
import { payoutOptions } from '@/features/payouts/types'
import { PurchaseOrderDrawerHeaderProps, statusConfig } from '@/features/orders/purchaseOrders/types'
import { useFormatPurchaseOrderNumber } from '@/features/orders/utils/formatOrderNumbers'
import { CheckCheck } from 'lucide-react'
import { useSpotPrices } from '@/features/spots/queries'
import { useOrderSpots, nameSpots } from '@/features/orders/spots'

export default function PurchaseOrderDrawerHeader({
  order,
  username,
}: PurchaseOrderDrawerHeaderProps) {
  const downloadPackingList = useDownloadPackingList()
  const downloadReturnPackingList = useDownloadReturnPackingList()
  const downloadInvoice = useDownloadInvoice()
  const { formatPurchaseOrderNumber } = useFormatPurchaseOrderNumber()
  const { data: spotPrices = [] } = useSpotPrices()
  const { data: orderSpots = [] } = useOrderSpots(order.id)
  // Display composition, client-side: the rows carry metal_id, the reference
  // read supplies the names the PDF templates print.
  const namedOrderSpots = nameSpots(orderSpots, spotPrices)

  const status = statusConfig[order.status ?? ''] ?? ''
  const Icon = status?.icon ?? CheckCheck
  // The package and the payout method are the SERVER's to resolve now: the
  // download body is { order_id }, and the packing list prints the box the
  // parcel was actually booked with rather than the first entry of a
  // hard-coded list when the label failed to match (ruling 10).

  const downloadOptions = [
    {
      statuses: ['In Transit'],
      label: 'Download Label + Packing List',
      onClick: () => {
        downloadPackingList.mutate({ order_id: order.id, order_number: order.number })
      },
      isPending: downloadPackingList.isPending,
    },
    {
      statuses: ['Cancelled'],
      label: 'Download Label + Packing List',
      onClick: () => {
        downloadReturnPackingList.mutate({ order_id: order.id, order_number: order.number })
      },
      isPending: downloadReturnPackingList.isPending,
    },
    {
      statuses: ['Received'],
      label: 'Download Invoice Preview',
      onClick: () =>
        downloadInvoice.mutate({
          order_id: order.id,
          order_number: order.number,
          fileName: 'invoice_preview',
        }),
      isPending: downloadInvoice.isPending,
    },
    {
      statuses: ['Payment Processing', 'Completed'],
      label: 'Download Invoice',
      onClick: () =>
        downloadInvoice.mutate({
          order_id: order.id,
          order_number: order.number,
          fileName: 'invoice',
        }),
      isPending: downloadInvoice.isPending,
    },
  ]

  return (
    <div className="flex flex-col w-full gap-6 border-b-1 border-border">
      <div className="flex w-full justify-between items-center">
        <div className="text-base text-neutral-800">
          {formatPurchaseOrderNumber(order.number)}
        </div>
        <div className="text-sm text-neutral-800">{username}</div>
      </div>
      <div className="flex w-full justify-between items-center">
        <div className="flex items-center gap-2">
          {status && Icon && (
            <div className={`${'text-primary'}`}>
              <Icon size={24} />
            </div>
          )}
          <span className="text-lg text-neutral-800">{order.status}</span>
        </div>
        <div className="flex ml-auto">
          {downloadOptions.map(({ statuses, label, onClick, isPending }, index) =>
            statuses.includes(order.status ?? '') ? (
              <Button
                key={index}
                variant="link"
                className={`font-normal text-sm bg-transparent hover:bg-transparent ${'text-primary'} px-0`}
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
