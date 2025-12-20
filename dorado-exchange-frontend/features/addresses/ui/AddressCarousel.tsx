'use client'

import { Swiper, SwiperSlide } from 'swiper/react'
import { Navigation, Pagination } from 'swiper/modules'
import * as React from 'react'
import { ChevronsLeft, ChevronsRight } from 'lucide-react'

import { Address } from '@/features/addresses/types'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { AddressCard } from '@/features/addresses/ui/AddressCard'

import 'swiper/css'
import 'swiper/css/navigation'
import 'swiper/css/pagination'

type SelectedSetter = React.Dispatch<React.SetStateAction<Address>> | ((a: Address) => void)

export interface AddressCarouselProps {
  addresses: Address[]
  setSelectedAddress?: SelectedSetter
  onSelect?: (address: Address) => void

  slidesPerView?: 1 | 'auto'
  centeredSlides?: boolean
  spaceBetween?: number
  cardVariant?: 'default' | 'compact'

  showNav?: boolean
  showPagination?: boolean
  className?: string
  mode?: 'customer' | 'admin'
  onEdit?: (address: Address) => void
  showEdit?: boolean
  showRemove?: boolean
  showSetDefault?: boolean
}

export const AddressCarousel: React.FC<AddressCarouselProps> = ({
  addresses,
  setSelectedAddress,
  onSelect,

  slidesPerView = 1,
  centeredSlides = true,
  spaceBetween = 14,
  cardVariant = 'default',

  showNav = true,
  showPagination = true,
  className,

  mode = 'admin',
  onEdit,
  showEdit = true,
  showRemove = true,
  showSetDefault = true,
}) => {
  const [isBeginning, setIsBeginning] = React.useState(true)
  const [isEnd, setIsEnd] = React.useState(false)

  const modules = React.useMemo(() => {
    const m: any[] = []
    if (showNav) m.push(Navigation)
    if (showPagination) m.push(Pagination)
    return m
  }, [showNav, showPagination])

  const handleSelect = React.useCallback(
    (addr: Address) => {
      setSelectedAddress?.(addr)
      onSelect?.(addr)
    },
    [setSelectedAddress, onSelect]
  )

  const effectiveShowNav = showNav && addresses.length > 1
  const effectiveShowPagination = showPagination && addresses.length > 1

  return (
    <div className={cn('w-full mx-auto', className)}>
      <style>{`
        .swiper-slide-shadow-left,
        .swiper-slide-shadow-right { display: none !important; }
      `}</style>

      <Swiper
        loop={false}
        grabCursor
        centeredSlides={centeredSlides}
        slidesPerView={slidesPerView}
        spaceBetween={spaceBetween}
        modules={modules}
        pagination={effectiveShowPagination ? { clickable: true } : false}
        navigation={
          effectiveShowNav
            ? { nextEl: '.address-swiper-next', prevEl: '.address-swiper-prev' }
            : false
        }
        className={cn(
          effectiveShowPagination &&
            `
            [&_.swiper-pagination]:!static [&_.swiper-pagination]:mt-2
            [&_.swiper-pagination-bullet]:!bg-neutral-700
            [&_.swiper-pagination-bullet]:!opacity-30
            [&_.swiper-pagination-bullet-active]:!opacity-100
          `
        )}
        onSwiper={(swiper) => {
          setIsBeginning(swiper.isBeginning)
          setIsEnd(swiper.isEnd)
          const addr = addresses[swiper.realIndex]
          if (addr) handleSelect(addr)
        }}
        onSlideChange={(swiper) => {
          setIsBeginning(swiper.isBeginning)
          setIsEnd(swiper.isEnd)
          const addr = addresses[swiper.realIndex]
          if (addr) handleSelect(addr)
        }}
      >
        {addresses.map((address) => (
          <SwiperSlide key={address.id}>
            <AddressCard
              address={address}
              variant={cardVariant}
              mode={mode}
              onEdit={onEdit}
              showEdit={showEdit}
              showRemove={showRemove}
              showSetDefault={showSetDefault}
            />
          </SwiperSlide>
        ))}

        {effectiveShowNav && (
          <>
            <div className="hidden lg:block absolute -bottom-8 -translate-y-1/2 address-swiper-prev z-20">
              <Button
                size="icon"
                variant="ghost"
                className={cn(
                  isBeginning
                    ? 'text-neutral-400 pointer-events-none hover:text-neutral-400'
                    : 'text-neutral-900'
                )}
              >
                <ChevronsLeft size={32} />
              </Button>
            </div>

            <div className="hidden lg:block absolute -bottom-8 right-0 -translate-y-1/2 address-swiper-next z-20">
              <Button
                size="icon"
                variant="ghost"
                className={cn(
                  isEnd
                    ? 'text-neutral-400 pointer-events-none hover:text-neutral-400'
                    : 'text-neutral-900'
                )}
              >
                <ChevronsRight size={32} />
              </Button>
            </div>
          </>
        )}
      </Swiper>
    </div>
  )
}
