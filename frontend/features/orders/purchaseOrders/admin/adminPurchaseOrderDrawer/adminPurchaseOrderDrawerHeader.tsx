import { PurchaseOrderDrawerHeaderProps, statusConfig } from '@/features/orders/purchaseOrders/types'
import { usePurchaseOrderDownloads } from '@/features/orders/purchaseOrders/useDownloads'
import { useFormatPurchaseOrderNumber } from '@/features/orders/utils/formatOrderNumbers'
import { CheckCheck } from '@dorado/icons'
import { useSpotPrices } from '@/features/spots/queries'
import { OrderDrawerHeader } from '@/features/orders/ui/OrderDrawerHeader'
import { useOrderSpots } from '@dorado/client'
import { nameSpots } from '@/features/orders/display'

export default function PurchaseOrderDrawerHeader({ view, username }: PurchaseOrderDrawerHeaderProps) {
  const { order } = view

  const downloadOptions = usePurchaseOrderDownloads(order, 'admin')
  const { formatPurchaseOrderNumber } = useFormatPurchaseOrderNumber()
  const { data: spotPrices = [] } = useSpotPrices()
  const { data: orderSpots = [] } = useOrderSpots(order.id)
  const namedOrderSpots = nameSpots(orderSpots, spotPrices)

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
