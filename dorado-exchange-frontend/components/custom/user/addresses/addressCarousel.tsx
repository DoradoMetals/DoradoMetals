'use client'

import { Swiper, SwiperSlide } from 'swiper/react'
import { Navigation, Pagination } from 'swiper/modules'
import { Dispatch, useState } from 'react'
import { Address } from '@/types/address'
import { Building2, ChevronsLeft, ChevronsRight, House } from 'lucide-react'
import formatPhoneNumber from '@/utils/formatting/formatPhoneNumber'
import { Button } from '@/components/ui/button'
import { useDeleteAddress, useSetDefaultAddress } from '@/lib/queries/useAddresses'
import { cn } from '@/lib/utils'

import 'swiper/css'
import 'swiper/css/navigation'
import 'swiper/css/pagination'
import { useDrawerStore } from '@/store/drawerStore'

interface AddressCarouselProps {
  addresses: Address[]
  setSelectedAddress: Dispatch<React.SetStateAction<Address>>
}

export const AddressCarousel: React.FC<AddressCarouselProps> = ({
  addresses,
  setSelectedAddress,
}) => {
  const [addressErrors, setAddressErrors] = useState<Record<string, string | null>>({})

  const [isBeginning, setIsBeginning] = useState(true)
  const [isEnd, setIsEnd] = useState(false)

  const deleteAddressMutation = useDeleteAddress()
  const setDefaultAddressMutation = useSetDefaultAddress()

  const { openDrawer } = useDrawerStore()

  return (
    <div className="w-full mx-auto">
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
        slidesPerView={1}
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
          if (addr) setSelectedAddress(addr)
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

                <div className="flex items-center gap-4 mt-4 justify-between">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      className="px-4 min-w-[80px] bg-primary raised-off-page text-white"
                      onClick={() => {
                        setSelectedAddress(address)
                        openDrawer('address')
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      className="bg-card raised-off-page px-4 min-w-[80px] text-primary"
                      onClick={() =>
                        deleteAddressMutation.mutate(address, {
                          onError: (error: any) => {
                            const msg =
                              error?.response?.data?.error ||
                              error?.message ||
                              'Failed to remove address.'

                            const id = address.id!
                            setAddressErrors((prev) => ({
                              ...prev,
                              [id]: msg,
                            }))

                            setTimeout(() => {
                              setAddressErrors((prev) => {
                                const newErrors = { ...prev }
                                delete newErrors[id]
                                return newErrors
                              })
                            }, 5000)
                          },
                          onSuccess: () => {
                            setAddressErrors((prev) => ({
                              ...prev,
                              [address.id!]: null,
                            }))
                          },
                        })
                      }
                    >
                      Remove
                    </Button>
                  </div>

                  {!address.is_default && (
                    <Button
                      variant="link"
                      size="sm"
                      className="text-primary p-0 h-auto"
                      onClick={() => setDefaultAddressMutation.mutate(address)}
                    >
                      Set Default
                    </Button>
                  )}
                </div>
              </div>
            </div>
            {address.id && addressErrors[address.id] && (
              <div className="mt-1 text-xs text-destructive font-normal">
                {addressErrors[address.id]}
              </div>
            )}
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
