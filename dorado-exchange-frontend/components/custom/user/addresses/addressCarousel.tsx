'use client'

import { Swiper, SwiperSlide } from 'swiper/react'
import { Pagination, EffectCoverflow } from 'swiper/modules'
import 'swiper/css/bundle'
import { Dispatch } from 'react'
import { Address } from '@/types/address'

import 'swiper/css'
import 'swiper/css/effect-coverflow'
import 'swiper/css/pagination'
import 'swiper/css/navigation'
import { Building, House } from 'lucide-react'
import formatPhoneNumber from '@/utils/formatPhoneNumber'
import { Button } from '@/components/ui/button'
import { useDeleteAddress, useSetDefaultAddress } from '@/lib/queries/useAddresses'

interface AddressCarouselProps {
  addresses: Address[]
  setOpen: Dispatch<React.SetStateAction<boolean>>
  selectedAddress: Address,
  setSelectedAddress: Dispatch<React.SetStateAction<Address>>
}

export const AddressCarousel: React.FC<AddressCarouselProps> = ({
  addresses,
  setOpen,
  selectedAddress,
  setSelectedAddress,
}) => {
  const deleteAddressMutation = useDeleteAddress()
  const setDefaultAddressMutation = useSetDefaultAddress()
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
        const addr = addresses[swiper.realIndex]
        if (addr) setSelectedAddress(addr)
      }}
      >
        {addresses.map((address, index) => (
          <SwiperSlide key={address.id} className="rounded-xl w-full">
            <div
              className={`flex w-full bg-card shadow-lg p-4 border transition-all duration-300 rounded-xl ${
                selectedAddress?.id === address.id ? 'border-secondary' : 'border-border'
              }`}
            >
              <div className="flex flex-col w-full">
                <div className="flex items-start justify-between w-full">
                  <div className="text-xl text-neutral-900">{address.name}</div>
                  <div className="text-secondary">
                    {address.is_residential ? <House size={24} /> : <Building size={24} />}
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

                <div className="flex items-center gap-4 mt-4 justify-between">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="px-4 min-w-[80px]"
                      onClick={() => {
                        setSelectedAddress(address)
                        setOpen(true)
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-secondary border-secondary bg-card hover:bg-secondary hover:shadow-lg hover:text-neutral-900 px-4 min-w-[80px]"
                      onClick={() => deleteAddressMutation.mutate(address)}
                    >
                      Remove
                    </Button>
                  </div>

                  {!address.is_default && (
                    <Button
                      variant="link"
                      size="sm"
                      className="text-secondary p-0 h-auto"
                      onClick={() => setDefaultAddressMutation.mutate(address)}
                    >
                      Set Default
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </SwiperSlide>
        ))}
      </Swiper>
    </div>
  )
}
