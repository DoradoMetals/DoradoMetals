import { SalesOrderDrawerHeaderProps, statusConfig } from '@/shared/types/salesOrders'
import { useSalesOrderDownloads } from '@/shared/hooks/useSalesOrderDownloads'
import { formatFullDate } from '@/shared/utils/formatDates'
import { useFormatSalesOrderNumber } from '@/shared/utils/formatOrderNumbers'
import { useSpotPrices } from '@/shared/hooks/spots/queries'
import { OrderDrawerHeader } from '@/shared/ui/OrderDrawerHeader'
import { useOrderSpots } from '@dorado/client'

export default function AdminSalesOrderDrawerHeader({ view }: SalesOrderDrawerHeaderProps) {
  const { order } = view

  const downloadOptions = useSalesOrderDownloads(order, 'admin')

  const { formatSalesOrderNumber } = useFormatSalesOrderNumber()
  const { data: orderSpots = [] } = useOrderSpots(order.id)
  const { data: spotPrices = [] } = useSpotPrices()
  const namedOrderSpots = orderSpots

  const status = statusConfig[order.status ?? '']
  const Icon = status?.icon

  return (
    <OrderDrawerHeader
      primary={formatFullDate(order.created_at ?? undefined)}
      secondary={formatSalesOrderNumber(order.number)}
      status={order.status}
      icon={status ? Icon : undefined}
      downloads={downloadOptions}
    />
  )
}
