import { PurchaseOrderDrawerHeaderProps, statusConfig } from '@/shared/types/purchaseOrders'
import { usePurchaseOrderDownloads } from '@/shared/hooks/usePurchaseOrderDownloads'
import { useFormatPurchaseOrderNumber } from '@/shared/utils/formatOrderNumbers'
import { CheckCheck } from '@dorado/icons'
import { useSpotPrices } from '@/shared/hooks/spots/queries'
import { OrderDrawerHeader } from '@/shared/ui/OrderDrawerHeader'
import { useOrderSpots } from '@dorado/client'

export default function PurchaseOrderDrawerHeader({ view, username }: PurchaseOrderDrawerHeaderProps) {
  const { order } = view

  const downloadOptions = usePurchaseOrderDownloads(order, 'admin')
  const { formatPurchaseOrderNumber } = useFormatPurchaseOrderNumber()
  const { data: spotPrices = [] } = useSpotPrices()
  const { data: orderSpots = [] } = useOrderSpots(order.id)
  const namedOrderSpots = orderSpots

  const status = statusConfig[order.status ?? ''] ?? ''
  const Icon = status?.icon ?? CheckCheck

  return (
    <OrderDrawerHeader
      primary={formatPurchaseOrderNumber(order.number)}
      secondary={username}
      status={order.status}
      icon={status ? Icon : undefined}
      downloads={downloadOptions}
    />
  )
}
