import { SalesOrderDrawerHeaderProps, statusConfig } from '@/shared/types/salesOrders'
import { useSalesOrderDownloads } from '@/shared/hooks/useSalesOrderDownloads'
import { formatFullDate } from '@/shared/utils/formatDates'
import { useFormatSalesOrderNumber } from '@/shared/utils/formatOrderNumbers'
import { useSpotPrices } from '@/shared/hooks/spots/queries'
import { OrderDrawerHeader } from '@/shared/ui/OrderDrawerHeader'
import { useOrderSpots } from '@dorado/client'

export default function SalesOrderDrawerHeader({ view }: SalesOrderDrawerHeaderProps) {
  const { order } = view

  const downloadOptions = useSalesOrderDownloads(order)

  const { formatSalesOrderNumber } = useFormatSalesOrderNumber()
  const { data: orderSpots = [] } = useOrderSpots(order.id)
  const { data: spotPrices = [] } = useSpotPrices()
  const namedOrderSpots = orderSpots

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
