'use client'

import { Swiper, SwiperSlide } from 'swiper/react'
import { Navigation, Pagination, EffectCoverflow } from 'swiper/modules'
import 'swiper/css/bundle'
import { Dispatch, useState } from 'react'
import { Address } from '@/types/address'

import 'swiper/css'
import 'swiper/css/effect-coverflow'
import 'swiper/css/pagination'
import 'swiper/css/navigation'
import { Building, House, Star } from 'lucide-react'
import formatPhoneNumber from '@/utils/formatPhoneNumber'
import { Button } from '@/components/ui/button'

interface AddressCarouselProps {
  addresses: Address[]
  activeIndex: number
  onChangeIndex: (index: number) => void
  setOpen: Dispatch<React.SetStateAction<boolean>>
  setSelectedAddress: Dispatch<React.SetStateAction<Address>>
}

export const AddressCarousel: React.FC<AddressCarouselProps> = ({
  addresses,
  activeIndex,
  onChangeIndex,
  setOpen,
  setSelectedAddress,
}) => {
  return (
    <div className="w-full max-w-lg mx-auto">
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
        slidesPerView={1.2}
        effect={'coverflow'}
        coverflowEffect={{
          rotate: 0,
          stretch: 0,
          depth: 100,
          modifier: 1.2,
        }}
        pagination={{ clickable: true }}
        modules={[EffectCoverflow, Pagination]}
        className="
        [&_.swiper-pagination]:!static [&_.swiper-pagination]:mt-2
        [&_.swiper-pagination-bullet]:!bg-neutral-700
        [&_.swiper-pagination-bullet]:!opacity-30
        [&_.swiper-pagination-bullet-active]:!opacity-100
      "
        onSlideChange={(swiper) => {
          const realIndex = swiper.realIndex
          onChangeIndex(realIndex)
        }}
      >
        {addresses.map((address, index) => (
          <SwiperSlide key={address.id} className="rounded-xl">
            <div className="rounded-xl">
              <div
                className={`flex flex-col gap-2 items-start w-full bg-card shadow-lg p-3 border transition-all duration-300 rounded-xl ${
                  index === activeIndex ? 'border-primary' : 'border-border'
                }`}
              >
                <div className="flex w-full items-start justify-between">
                  <div className="flex flex-col">
                    <div className="text-lg text-neutral-800">{address.name}</div>
                    <div className="text-xs text-neutral-600">
                      {formatPhoneNumber(address.phone_number)}
                    </div>
                  </div>
                  <div className="flex items-center pt-1 text-secondary gap-1">
                    {address.is_default ? <Star size={24} /> : null}

                    {address.is_residential ? <House size={24} /> : <Building size={24} />}
                  </div>
                </div>
                <div className="flex mt-4 w-full">
                  <div className="flex flex-col w-full">
                    <div className="text-sm text-neutral-600">
                      <p>
                        {address.line_1}
                        {address.line_2 && `, ${address.line_2}`}
                      </p>
                    </div>
                    <div className="text-sm text-neutral-600">
                      <p>{`${address.city}, ${address.state}, ${address.zip}`}</p>
                    </div>
                  </div>
                  <Button
                    variant="link"
                    size="sm"
                    className="text-neutral-600 p-0 pt-6"
                    onClick={() => {
                      setSelectedAddress(address)
                      setOpen(true)
                    }}
                  >
                    Edit
                  </Button>
                </div>
              </div>
            </div>
          </SwiperSlide>
        ))}
      </Swiper>
    </div>
  )
}
