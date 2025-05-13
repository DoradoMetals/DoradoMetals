'use client'

import { useState } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Check, ChevronDown, DollarSign, EyeOff, List, SearchX, X } from 'lucide-react'
import { usePurchaseOrders } from '@/lib/queries/usePurchaseOrder'
import PurchaseOrderDrawer from './purchaseOrderDrawer/purchaseOrderDrawer'
import { User } from '@/types/user'
import { useGetSession } from '@/lib/queries/useAuth'
import PurchaseOrderCard from './purchaseOrderCard'
import { AnimatePresence, motion } from 'framer-motion'

import { Swiper, SwiperSlide } from 'swiper/react'
import { FreeMode } from 'swiper/modules'

import 'swiper/css'
import 'swiper/css/free-mode'

import { cn } from '@/lib/utils'
import { PurchaseOrderStatuses, statusConfig } from '@/types/purchase-order'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandItem, CommandList } from '@/components/ui/command'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CurrencyDollar } from '@phosphor-icons/react'
import getPrimaryIconStroke from '@/utils/getPrimaryIconStroke'

export function OrdersTabs() {
  const { user } = useGetSession()

  return (
    <div>
      <Tabs defaultValue="sold" className="flex h-full w-full items-center justify-center mt-5 p-4">
        <div className="w-full max-w-lg">
          <TabsList className="justify-center w-full gap-2 rounded-none bg-transparent p-0">
            <TabsTrigger value="bought" className="tab-indicator-primary">
              Bought
            </TabsTrigger>
            <TabsTrigger value="sold" className="tab-indicator-primary">
              Sold
            </TabsTrigger>
          </TabsList>
          <div className="separator-inset -mt-[3px]" />
        </div>
        <div className="w-full max-w-lg h-full">
          <TabsContent value="bought">
            <div>No Orders yet</div>
          </TabsContent>

          <TabsContent value="sold">
            {user ? (
              <PurchaseOrdersContent user={user} />
            ) : (
              <div>Please sign in to see orders.</div>
            )}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}

function PurchaseOrdersContent({ user }: { user: User }) {
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
          <CurrencyDollar size={128} color={getPrimaryIconStroke()} strokeWidth={1.5} />
          <div className="absolute -top-6 right-3.5 border border-border text-xl text-primary-gradient rounded-full w-10 h-10 flex items-center justify-center">
            0
          </div>
        </div>

        <div className="flex flex-col items-center justify-center gap-1 mb-5 w-50">
          <h2 className="title-text tracking-wide">No Orders Yet!</h2>
          <p className="tertiary-text">
            Create an order by adding your items and completing checkout.
          </p>
        </div>
        <Link href="/sell" passHref>
          <Button
            variant="default"
            onClick={() => {
              router.push('/sell')
            }}
            className="raised-off-page liquid-gold text-white hover:text-white shine-on-hover px-12"
          >
            Get a Price Estimate
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="p-4 mt-5 w-full">
      <AnimatePresence mode="wait">
        {filteredOrders.length === 0 ? (
          <div>
            <StatusSelector
              selectedStatus={selectedStatus}
              setSelectedStatus={setSelectedStatus}
              open={open}
              setOpen={setOpen}
            />

            <motion.div
              key={`empty-${selectedStatus ?? 'all'}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="py-2 flex flex-col gap-2 text-sm text-neutral-800"
            >
              {renderEmptyStatus(selectedStatus || 'All')}
            </motion.div>
          </div>
        ) : (
          <>
            <div className="flex flex-col lg:flex-row lg:justify-between lg:items-end gap-2 w-full">
              <StatusSelector
                selectedStatus={selectedStatus}
                setSelectedStatus={setSelectedStatus}
                open={open}
                setOpen={setOpen}
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
                <PurchaseOrderCard order={order} setActivePurchaseOrder={setActivePurchaseOrder} />
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

      {activePurchaseOrder && <PurchaseOrderDrawer order_id={activePurchaseOrder} user={user} />}
    </div>
  )
}

function renderEmptyStatus(status: string) {
  const config = statusConfig[status]
  const Icon = config.icon

  return (
    <div className="flex flex-col flex-grow items-center justify-center gap-4 py-20">
      <div className="relative">
        <Icon className={config.text_color} size={128} />
        <SearchX className="absolute -top-2 -right-2 text-neutral-500" size={32} />
      </div>
      <p className="text-lg font-medium text-muted-foreground">No {status} Orders Found</p>
    </div>
  )
}
function StatusSelector({
  selectedStatus,
  setSelectedStatus,
  open,
  setOpen,
}: {
  selectedStatus: string | null
  setSelectedStatus: (s: string | null) => void
  open: boolean
  setOpen: (v: boolean) => void
}) {
  const selectedConfig = selectedStatus ? statusConfig[selectedStatus] : null
  const SelectedIcon = selectedConfig?.icon
  return (
    <div className="flex flex-col lg:flex-row lg:justify-between lg:items-end gap-2 w-full">
      <div className="flex lg:hidden w-full">
        <Swiper
          modules={[FreeMode]}
          cssMode={true}
          freeMode={{
            enabled: true,
            momentum: true,
            momentumBounce: false,
            sticky: false,
          }}
          slidesPerView="auto"
          spaceBetween={6}
          className="w-full z-10 purchase-order-status-swiper flex items-center justify-center [&.purchase-order-status-swiper_.swiper-wrapper]:pl-1"
        >
          {PurchaseOrderStatuses.map((status) => {
            const config = statusConfig[status]
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
          <SwiperSlide className="!w-4 !shrink-0" aria-hidden />
        </Swiper>
      </div>

      <div className="hidden lg:flex">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              className={cn(
                'px-2 hover:bg-transparent raised-off-page w-32 bg-card hover:bg-card flex items-center justify-between font-normal h-8',
                selectedStatus
                  ? `${statusConfig[selectedStatus]?.text_color} hover:${statusConfig[selectedStatus]?.text_color}`
                  : 'text-neutral-700'
              )}
            >
              <div className="flex items-center gap-1">
                {selectedStatus === null ? (
                  <List size={14} className="text-neutral-700" />
                ) : (
                  SelectedIcon && <SelectedIcon size={14} className={selectedConfig?.text_color} />
                )}
                {selectedStatus ?? 'All Orders'}
              </div>
              <ChevronDown size={14} className="ml-1 text-neutral-700" />
            </Button>
          </PopoverTrigger>

          <PopoverContent
            align="start"
            side="bottom"
            className="p-0 w-50"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <Command className="bg-card h-full">
              <CommandList className="h-full">
                <CommandItem
                  onSelect={() => {
                    setSelectedStatus(null)
                    setOpen(false)
                  }}
                  className={cn(
                    'group h-9 px-3 flex items-center justify-between gap-2 rounded-sm transition-colors duration-150',
                    selectedStatus === null
                      ? 'bg-neutral-800 text-neutral-100'
                      : 'text-neutral-800 hover:bg-neutral-800 hover:text-neutral-100'
                  )}
                >
                  <div className="flex items-center gap-2 font-normal">
                    <List
                      size={16}
                      className={cn(
                        'transition-colors',
                        selectedStatus === null
                          ? 'text-neutral-100'
                          : 'text-neutral-800 group-hover:text-neutral-100'
                      )}
                    />
                    <span
                      className={cn(
                        'transition-colors',
                        selectedStatus === null
                          ? 'text-neutral-100'
                          : 'text-neutral-800 group-hover:text-neutral-100'
                      )}
                    >
                      All Orders
                    </span>
                  </div>
                  {selectedStatus === null && (
                    <Check className="h-4 w-4 text-neutral-100 opacity-100" />
                  )}
                </CommandItem>
                {PurchaseOrderStatuses.map((status) => {
                  const config = statusConfig[status]
                  const Icon = config.icon
                  const isSelected = selectedStatus === status

                  return (
                    <CommandItem
                      key={status}
                      onSelect={() => {
                        setSelectedStatus(status)
                        setOpen(false)
                      }}
                      className={cn(
                        'group h-9 px-3 flex items-center justify-between gap-2 transition-colors duration-150 hover:text-white',
                        config.hover_background_color,
                        config.text_color,
                        isSelected ? `${config.background_color} text-white` : ''
                      )}
                    >
                      <div className="flex items-center gap-2 font-normal">
                        <Icon
                          size={16}
                          className={cn(
                            isSelected
                              ? 'text-white'
                              : `${config.text_color} group-hover:text-white`
                          )}
                        />
                        <span>{status}</span>
                      </div>
                    </CommandItem>
                  )
                })}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}
