import { useAdminPurchaseOrders } from '@/lib/queries/admin/useAdminPurchaseOrders'
import { statusConfig } from '@/types/purchase-order'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Swiper, SwiperSlide } from 'swiper/react'
import { FreeMode } from 'swiper/modules'

import 'swiper/css'
import 'swiper/css/free-mode'

export default function PurchaseOrderCards({
  selectedStatus,
  setSelectedStatus,
}: {
  selectedStatus: string | null
  setSelectedStatus: (status: string | null) => void
}) {
  const { data: purchaseOrders = [] } = useAdminPurchaseOrders()

  const statusCounts = purchaseOrders.reduce<Record<string, number>>((acc, order) => {
    const status = order.purchase_order_status
    acc[status] = (acc[status] || 0) + 1
    return acc
  }, {})

  return (
    <>
      <div className="sm:hidden w-full">
        <Swiper
          modules={[FreeMode]}
          cssMode
          freeMode={{
            enabled: true,
            momentum: true,
            momentumBounce: false,
            sticky: false,
          }}
          slidesPerView="auto"
          spaceBetween={8}
          className="purchase-order-admin-status-swiper [&.purchase-order-admin-status-swiper_.swiper-wrapper]:pl-2"
        >
          {Object.entries(statusConfig).map(([status, config]) => {
            const isSelected = selectedStatus === status
            const Icon = config.icon
            return (
              <SwiperSlide key={status} className="!w-auto py-2">
                <Button
                  variant="ghost"
                  onClick={() => setSelectedStatus(isSelected ? null : status)}
                  className={cn(
                    'text-sm px-4 py-1 whitespace-nowrap raised-off-page rounded-lg transition-colors duration-150 flex items-center justify-between gap-1',
                    isSelected
                      ? `${config?.background_color} text-white`
                      : `bg-card ${config?.text_color}`
                  )}
                >
                  {status}
                  <Icon size={16} />
                </Button>
              </SwiperSlide>
            )
          })}
          <SwiperSlide className="!w-4 !shrink-0" aria-hidden="true" />
        </Swiper>
      </div>

      <div className="hidden sm:grid grid-cols-2 md:grid-cols-4 gap-x-2 gap-y-2 mb-6">
        {Object.entries(statusConfig).map(([status, config]) => {
          const Icon = config.icon
          const count = statusCounts[status] ?? 0
          const isSelected = selectedStatus === status

          return (
            <Button
              variant="ghost"
              key={status}
              onClick={() => setSelectedStatus(isSelected ? null : status)}
              className={cn(
                'hidden sm:flex items-center justify-between rounded-lg p-4 bg-card raised-off-page mt-4 w-full h-full transition-colors hover:bg-highest',
                isSelected && `${config.border_color} border-2`
              )}
            >
              <div className="flex w-full items-center gap-2 justify-between">
                <Icon size={42} className={config.text_color} />
                <div className="flex flex-col ml-auto items-end">
                  <div className="text-2xl text-neutral-900">{count}</div>
                  <h2 className="text-sm text-neutral-600">{status}</h2>
                </div>
              </div>
            </Button>
          )
        })}
      </div>
    </>
  )
}
