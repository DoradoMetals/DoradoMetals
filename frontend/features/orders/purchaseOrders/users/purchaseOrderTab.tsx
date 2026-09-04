'use client'

import { useState } from 'react'
import { Button } from '@dorado/components'
import { ChevronDown } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/shared/ui/base/pagination'
import { useRouter } from 'next/navigation'
import { CurrencyDollarIcon } from '@phosphor-icons/react'
import PurchaseOrderCard from './purchaseOrderCard'
import PurchaseOrderDrawer from './purchaseOrderDrawer/purchaseOrderDrawer'
import { PurchaseOrderStatuses, statusConfig } from '@/features/orders/purchaseOrders/types'
import { useGetSession } from '@/features/auth/queries'
import { useOrders } from '@dorado/client'
import { OrderStatusSelector } from '@/features/orders/ui/OrderStatusShared'
import { EmptyState } from '@/shared/ui/EmptyState'
import { SearchX } from 'lucide-react'

export function PurchaseOrdersContent() {
  const { user } = useGetSession()
  const { data: orders = [], isLoading } = useOrders(
    { direction: 'purchase', user_id: user?.id },
    { enabled: !!user?.id, refetchInterval: 10_000 }
  )
  const [activePurchaseOrder, setActivePurchaseOrder] = useState<string | null>(null)
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const router = useRouter()

  const [currentPage, setCurrentPage] = useState(1)
  const ordersPerPage = 5

  const sortedOrders = [...orders].sort((a, b) => {
    const dateA = new Date(a.created_at ?? 0).getTime()
    const dateB = new Date(b.created_at ?? 0).getTime()
    return sortOrder === 'asc' ? dateA - dateB : dateB - dateA
  })

  const filteredOrders = sortedOrders.filter(
    (order) => !selectedStatus || order.status === selectedStatus
  )

  const totalPages = Math.ceil(filteredOrders.length / ordersPerPage)
  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * ordersPerPage,
    currentPage * ordersPerPage
  )

  if (isLoading) {
    return (
      <div className="h-[300px] flex items-center justify-center text-muted-foreground">
        Loading orders...
      </div>
    )
  }

  if (orders.length === 0) {
    return (
      <EmptyState
        icon={CurrencyDollarIcon}
        badge={0}
        title="No Orders Yet!"
        description="Create an order by adding your items and completing checkout."
        className="flex-grow justify-center"
      >
        <Button size="xl" onClick={() => router.push('/sell')}>
          Get a Price Estimate
        </Button>
      </EmptyState>
    )
  }

  return (
    <div className="w-full">
      <AnimatePresence mode="wait">
        {filteredOrders.length === 0 ? (
          <div>
            <OrderStatusSelector
              statuses={PurchaseOrderStatuses}
              statusConfig={statusConfig}
              selectedStatus={selectedStatus}
              setSelectedStatus={setSelectedStatus}
              open={open}
              setOpen={setOpen}
              mobileSwiperClassName="purchase-order-status-swiper [&.purchase-order-status-swiper_.swiper-wrapper]:pl-1"
            />

            <motion.div
              key={`empty-${selectedStatus ?? 'all'}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="py-2 flex flex-col gap-2"
            >
              <EmptyState
                icon={selectedStatus ? statusConfig[selectedStatus].icon : CurrencyDollarIcon}
                badge={<SearchX size={18} />}
                title={`No ${selectedStatus ?? 'Orders'} Orders Found`}
              />
            </motion.div>
          </div>
        ) : (
          <>
            <div className="flex flex-col lg:flex-row lg:justify-between lg:items-end gap-2 w-full">
              <OrderStatusSelector
                statuses={PurchaseOrderStatuses}
                statusConfig={statusConfig}
                selectedStatus={selectedStatus}
                setSelectedStatus={setSelectedStatus}
                open={open}
                setOpen={setOpen}
                mobileSwiperClassName="purchase-order-status-swiper [&.purchase-order-status-swiper_.swiper-wrapper]:pl-1"
              />

              <Button
                variant="tertiary"
                className="p-0 h-4 flex justify-start gap-1 pl-1"
                onClick={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
              >
                <span className="flex items-center p-0">
                  <motion.span
                    key={sortOrder}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15, ease: 'easeInOut' }}
                  >
                    {sortOrder === 'asc' ? 'Oldest' : 'Most Recent'}
                  </motion.span>
                </span>
                <motion.div
                  animate={{ rotate: sortOrder === 'asc' ? 180 : 0 }}
                  transition={{ duration: 0.15 }}
                  className="will-change-transform"
                >
                  <ChevronDown size={16} />
                </motion.div>
              </Button>
            </div>

            {paginatedOrders.map((order) => (
              <motion.div
                key={`${order.id}-${sortOrder}-${selectedStatus ?? 'all'}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: 'easeInOut' }}
                className="py-2 flex flex-col gap-2"
              >
                <PurchaseOrderCard
                  order={order}
                  setActivePurchaseOrder={setActivePurchaseOrder}
                />
              </motion.div>
            ))}

            {totalPages > 1 && (
              <Pagination className="mt-4">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      onClick={(e) => {
                        e.preventDefault()
                        setCurrentPage((p) => Math.max(p - 1, 1))
                      }}
                      disabled={currentPage === 1}
                      className="text-muted-foreground"
                    />
                  </PaginationItem>

                  {[...Array(totalPages)].map((_, i) => (
                    <PaginationItem key={i}>
                      <PaginationLink
                        href="#"
                        isActive={currentPage === i + 1}
                        onClick={(e) => {
                          e.preventDefault()
                          setCurrentPage(i + 1)
                        }}
                      >
                        {i + 1}
                      </PaginationLink>
                    </PaginationItem>
                  ))}

                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      onClick={(e) => {
                        e.preventDefault()
                        setCurrentPage((p) => Math.min(p + 1, totalPages))
                      }}
                      disabled={currentPage === totalPages}
                      className="text-muted-foreground"
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
          </>
        )}
      </AnimatePresence>

      {activePurchaseOrder && (
        <PurchaseOrderDrawer order_id={activePurchaseOrder} user={user} />
      )}
    </div>
  )
}
