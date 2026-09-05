import { SalesOrderDrawerHeaderProps, statusConfig } from '@/features/orders/salesOrders/types'
import { useSalesOrderDownloads } from '@/features/orders/salesOrders/useDownloads'
import { formatFullDate } from '@/shared/utils/formatDates'
import { useFormatSalesOrderNumber } from '@/features/orders/utils/formatOrderNumbers'
import { useSpotPrices } from '@/features/spots/queries'
import { OrderDrawerHeader } from '@/features/orders/ui/OrderDrawerHeader'
import { useOrderSpots } from '@dorado/client'
import { nameSpots } from '@/features/orders/display'

export default function SalesOrderDrawerHeader({ view }: SalesOrderDrawerHeaderProps) {
  const { order } = view

  const downloadOptions = useSalesOrderDownloads(order)

  const { formatSalesOrderNumber } = useFormatSalesOrderNumber()
  const { data: orderSpots = [] } = useOrderSpots(order.id)
  const { data: spotPrices = [] } = useSpotPrices()
  const namedOrderSpots = nameSpots(orderSpots, spotPrices)

  const Icon = statusConfig[order.status ?? '']?.icon

  return (
    <OrderDrawerHeader
      primary={formatFullDate(order.created_at ?? undefined)}
      secondary={formatSalesOrderNumber(order.number)}
      status={order.status}
      icon={Icon}
      downloads={downloadOptions}
    />
  )
}
