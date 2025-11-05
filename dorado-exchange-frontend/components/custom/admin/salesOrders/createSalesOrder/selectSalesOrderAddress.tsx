'use client'

import { Swiper, SwiperSlide } from 'swiper/react'
import { Navigation, Pagination } from 'swiper/modules'
import { useState } from 'react'
import { Address } from '@/types/address'
import { Building2, ChevronsLeft, ChevronsRight, House } from 'lucide-react'
import formatPhoneNumber from '@/utils/formatPhoneNumber'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import 'swiper/css'
import 'swiper/css/navigation'
import 'swiper/css/pagination'
import { useAdminSalesOrderCheckoutStore } from '@/store/adminSalesOrderCheckoutStore'

interface AdminAddressCarouselProps {
  addresses: Address[]
}

export const AdminAddressCarousel: React.FC<AdminAddressCarouselProps> = ({ addresses }) => {
  const { setData } = useAdminSalesOrderCheckoutStore()

  const [isBeginning, setIsBeginning] = useState(true)
  const [isEnd, setIsEnd] = useState(false)

  return (
    <div className="mx-auto w-full">
      <style>
        {`
    .swiper-slide-shadow-left,
    .swiper-slide-shadow-right {
      display: none !important;
    }
  `}
      </style>
      <Swiper
        loop={false}
        grabCursor={true}
        centeredSlides={true}
        slidesPerView={"auto"}
        navigation={{
          nextEl: '.address-swiper-next',
          prevEl: '.address-swiper-prev',
        }}
        onReachBeginning={() => setIsBeginning(true)}
        onReachEnd={() => setIsEnd(true)}
        onFromEdge={() => {
          setIsBeginning(false)
          setIsEnd(false)
        }}
        spaceBetween={14}
        pagination={{ clickable: true }}
        modules={[Navigation, Pagination]}
        className="
        [&_.swiper-pagination]:!static [&_.swiper-pagination]:mt-2
        [&_.swiper-pagination-bullet]:!bg-neutral-700
        [&_.swiper-pagination-bullet]:!opacity-30
        [&_.swiper-pagination-bullet-active]:!opacity-100
      "
        onSlideChange={(swiper) => {
          const addr = addresses[swiper.realIndex]
          if (addr) setData({ address: addr })
        }}
      >
        {addresses.map((address, index) => (
          <SwiperSlide key={address.id} className="">
            <div className="flex w-full bg-card p-4 transition-all duration-300 rounded-xl raised-off-page">
              <div className="flex flex-col w-full">
                <div className="flex items-start justify-between w-full">
                  <div className="text-xl text-neutral-900">{address.name}</div>
                  <div className="text-secondary">
                    {address.is_residential ? (
                      <House size={24} className="text-neutral-600" />
                    ) : (
                      <Building2 size={24} className="text-neutral-600" />
                    )}
                  </div>
                </div>

                <div className="text-sm text-neutral-600">
                  {formatPhoneNumber(address.phone_number)}
                </div>

                <div className="text-base text-neutral-600 mt-4">
                  <p>
                    {address.line_1}
                    {address.line_2 && `, ${address.line_2}`}
                  </p>
                  <p>{`${address.city}, ${address.state}, ${address.zip}`}</p>
                </div>
              </div>
            </div>
          </SwiperSlide>
        ))}

        <div className="hidden lg:block absolute -bottom-8 -translate-y-1/2 address-swiper-prev z-20">
          <Button
            size="icon"
            variant="ghost"
            className={cn(
              isBeginning
                ? `text-neutral-400 pointer-events-none hover:text-neutral-400`
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
                ? `text-neutral-400 pointer-events-none hover:text-neutral-400`
                : 'text-neutral-900'
            )}
          >
            <ChevronsRight size={32} />
          </Button>
        </div>
      </Swiper>
    </div>
  )
}
