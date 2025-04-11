'use client'

import { Swiper, SwiperSlide } from 'swiper/react'
import { Navigation, Pagination, EffectCoverflow } from 'swiper/modules'
import 'swiper/css/bundle'
import { useState } from 'react'
import { Address } from '@/types/address'

import 'swiper/css'
import 'swiper/css/effect-coverflow'
import 'swiper/css/pagination'
import 'swiper/css/navigation'

interface AddressCarouselProps {
  addresses: Address[]
  activeIndex: number
  onChangeIndex: (index: number) => void
}

export const AddressCarousel: React.FC<AddressCarouselProps> = ({
  addresses,
  activeIndex,
  onChangeIndex,
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
        [&_.swiper-pagination]:!static [&_.swiper-pagination]:mt-4
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
          <SwiperSlide key={address.id} className='w-250px'>
            <div className="">
              <div
                className={`w-full bg-card shadow-lg p-3 border transition-all duration-300 rounded-xl ${
                  index === activeIndex ? 'border-primary' : 'border-border'
                }`}
              >
                <div className="flex flex-col space-y-2">
                  <div className="flex justify-between">
                    <div className="text-lg text-neutral-800">{address.name}</div>
                  </div>
                  <div className="flex flex-col">
                    <div className="text-sm text-muted-foreground">
                      <p>
                        {address.line_1}
                        {address.line_2 && `, ${address.line_2}`}
                      </p>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <p>{`${address.city}, ${address.state}, ${address.zip}`}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </SwiperSlide>
        ))}
      </Swiper>
    </div>
  )
}
