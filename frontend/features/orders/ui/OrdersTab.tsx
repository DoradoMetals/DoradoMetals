'use client'

import type { ComponentType, ReactNode } from 'react'
import { useState } from 'react'
import { Button, Pagination, EmptyState } from '@dorado/components'
import { ChevronDown, SearchX } from '@dorado/icons'
import { AnimatePresence, motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { useGetSession } from '@/features/auth/queries'
import { OrderStatusSelector } from '@/features/orders/ui/OrderStatusShared'
import { useOrders } from '@dorado/client'
import type { Order, StatusConfig } from '@/features/orders/types'
import type { Direction } from '@dorado/contracts'

const ORDERS_PER_PAGE = 5

export type OrdersTabConfig = {
  direction: Direction
  statuses: readonly string[]
  statusConfig: StatusConfig
  emptyIcon: ComponentType<{ className?: string }>
  emptyCtaLabel: string
  emptyCtaHref: string
  renderCard: (order: Order, setActiveOrderId: (id: string) => void) => ReactNode
  renderDrawer: (activeOrderId: string, user: ReturnType<typeof useGetSession>['user']) => ReactNode
}

export function OrdersTab({
  direction,
  statuses,
  statusConfig,
  emptyIcon: EmptyIcon,
  emptyCtaLabel,
  emptyCtaHref,
  renderCard,
  renderDrawer,
}: OrdersTabConfig) {
  const { user } = useGetSession()
  const { data: orders = [], isLoading } = useOrders(
    { direction, user_id: user?.id },
    { enabled: !!user?.id, refetchInterval: 10_000 }
  )
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null)
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null)
  const router = useRouter()
  const StatusFilterIcon = selectedStatus ? statusConfig[selectedStatus].icon : EmptyIcon

  const [currentPage, setCurrentPage] = useState(1)

  const sortedOrders = [...orders].sort((a, b) => {
    const dateA = new Date(a.created_at ?? 0).getTime()
    const dateB = new Date(b.created_at ?? 0).getTime()
    return sortOrder === 'asc' ? dateA - dateB : dateB - dateA
  })

  const filteredOrders = sortedOrders.filter(
    (order) => !selectedStatus || order.status === selectedStatus
  )

  const totalPages = Math.ceil(filteredOrders.length / ORDERS_PER_PAGE)
  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * ORDERS_PER_PAGE,
    currentPage * ORDERS_PER_PAGE
  )

  if (isLoading) {
    return (
      <div className="h-[300px] flex items-center justify-center">
        <p>Loading orders...</p>
      </div>
    )
  }

  if (orders.length === 0) {
    return (
      <EmptyState
        icon={<EmptyIcon className="text-primary" />}
        badge={0}
        title="No Orders Yet!"
        description="Create an order by adding your items and completing checkout."
        action={
          <Button size="xl" onClick={() => router.push(emptyCtaHref)}>
            {emptyCtaLabel}
          </Button>
        }
        className="flex-grow justify-center"
      />
    )
  }

  return (
    <div className="w-full">
      <AnimatePresence mode="wait">
        {filteredOrders.length === 0 ? (
          <div>
            <OrderStatusSelector
              statuses={statuses}
              statusConfig={statusConfig}
              selectedStatus={selectedStatus}
              setSelectedStatus={setSelectedStatus}
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
                icon={<StatusFilterIcon className="text-primary" />}
                badge={<SearchX size={18} />}
                title={`No ${selectedStatus ?? 'Orders'} Orders Found`}
              />
            </motion.div>
          </div>
        ) : (
          <>
            <div className="flex flex-col lg:flex-row lg:justify-between lg:items-end gap-2 w-full">
              <OrderStatusSelector
                statuses={statuses}
                statusConfig={statusConfig}
                selectedStatus={selectedStatus}
                setSelectedStatus={setSelectedStatus}
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
                {renderCard(order, setActiveOrderId)}
              </motion.div>
            ))}

            {totalPages > 1 && (
              <Pagination
                page={currentPage}
                pageCount={totalPages}
                onPageChange={setCurrentPage}
                className="mt-4"
              />
            )}
          </>
        )}
      </AnimatePresence>

      {activeOrderId && renderDrawer(activeOrderId, user)}
    </div>
  )
}
