'use client'

import { useState } from 'react'
import { Button } from '@/shared/ui/base/button'
import { ChevronDown } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/shared/ui/base/pagination'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CurrencyDollarIcon } from '@phosphor-icons/react'
import PurchaseOrderCard from './purchaseOrderCard'
import PurchaseOrderDrawer from './purchaseOrderDrawer/purchaseOrderDrawer'
import { PurchaseOrderStatuses, statusConfig } from '@/types/purchase-order'
import { useGetSession } from '@/features/auth/queries'
import { usePurchaseOrders } from '@/features/orders/purchaseOrders/users/queries'
import { OrderStatusEmptyState, OrderStatusSelector } from '@/features/orders/ui/orderStatusShared'

export function PurchaseOrdersContent() {
  const { user } = useGetSession()
  const { data: orders = [], isLoading } = usePurchaseOrders()
  const [activePurchaseOrder, setActivePurchaseOrder] = useState<string | null>(null)
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const router = useRouter()

  const [currentPage, setCurrentPage] = useState(1)
  const ordersPerPage = 5

  const sortedOrders = [...orders].sort((a, b) => {
    const dateA = new Date(a.created_at).getTime()
    const dateB = new Date(b.created_at).getTime()
    return sortOrder === 'asc' ? dateA - dateB : dateB - dateA
  })

  const filteredOrders = sortedOrders.filter(
    (order) => !selectedStatus || order.purchase_order_status === selectedStatus
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
      <div className="flex flex-col flex-grow items-center justify-center gap-4 py-20">
        <div className="relative mb-5">
          <CurrencyDollarIcon size={128} className='text-primary' strokeWidth={1.5} />
          <div className="absolute -top-6 right-3.5 border border-border text-xl text-primary rounded-full w-10 h-10 flex items-center justify-center">
            0
          </div>
        </div>

        <div className="flex flex-col items-center justify-center gap-1 mb-5 w-50">
          <h2 className="text-lg text-neutral-800 tracking-wide">No Orders Yet!</h2>
          <p className="text-xs text-neutral-500 text-center">
            Create an order by adding your items and completing checkout.
          </p>
        </div>
        <Link href="/sell" passHref>
          <Button
            variant="default"
            onClick={() => {
              router.push('/sell')
            }}
            className="raised-off-page bg-primary text-white hover:bg-primary/90 px-12"
          >
            Get a Price Estimate
          </Button>
        </Link>
      </div>
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
              className="py-2 flex flex-col gap-2 text-sm text-neutral-800"
            >
              <OrderStatusEmptyState
                statusLabel={selectedStatus ?? 'Orders'}
                Icon={
                  selectedStatus
                    ? statusConfig[selectedStatus].icon
                    : CurrencyDollarIcon
                }
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
                variant="ghost"
                className="p-0 h-4 flex justify-start gap-1 pl-1"
                onClick={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
              >
                <div className="flex items-center text-sm text-neutral-700 font-normal p-0">
                  <motion.span
                    key={sortOrder}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15, ease: 'easeInOut' }}
                  >
                    {sortOrder === 'asc' ? 'Oldest' : 'Most Recent'}
                  </motion.span>
                </div>
                <motion.div
                  animate={{ rotate: sortOrder === 'asc' ? 180 : 0 }}
                  transition={{ duration: 0.15 }}
                  className="text-neutral-700 will-change-transform"
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
                className="py-2 flex flex-col gap-2 text-sm text-neutral-800"
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
                      className="text-neutral-600"
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
                      className="text-neutral-600"
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
