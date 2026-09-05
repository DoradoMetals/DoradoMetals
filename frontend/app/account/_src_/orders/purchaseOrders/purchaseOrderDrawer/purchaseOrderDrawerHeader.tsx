import { PurchaseOrderDrawerHeaderProps, statusConfig } from '@/shared/types/purchaseOrders'
import { usePurchaseOrderDownloads } from '@/shared/hooks/usePurchaseOrderDownloads'
import { formatFullDate } from '@/shared/utils/formatDates'
import { useFormatPurchaseOrderNumber } from '@/shared/utils/formatOrderNumbers'
import { useSpotPrices } from '@/shared/hooks/spots/queries'
import { OrderDrawerHeader } from '@/shared/ui/OrderDrawerHeader'
import { useOrderSpots } from '@dorado/client'

export default function PurchaseOrderDrawerHeader({ view }: PurchaseOrderDrawerHeaderProps) {
  const { order } = view

  const downloadOptions = usePurchaseOrderDownloads(order)

  const { formatPurchaseOrderNumber } = useFormatPurchaseOrderNumber()
  const { data: spotPrices = [] } = useSpotPrices()
  const { data: orderSpots = [] } = useOrderSpots(order.id)
  const namedOrderSpots = orderSpots

  const status = statusConfig[order.status ?? '']
  const Icon = status?.icon

  return (
    <OrderDrawerHeader
      primary={formatFullDate(order.created_at ?? undefined)}
      secondary={formatPurchaseOrderNumber(order.number)}
      status={order.status}
      icon={status ? Icon : undefined}
      downloads={downloadOptions}
    />
  )
}
