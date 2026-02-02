'use client'

import { useEffect, useMemo, useRef } from 'react'
import Image from 'next/image'
import { Swiper, SwiperSlide } from 'swiper/react'
import type { Swiper as SwiperType } from 'swiper/types'
import 'swiper/css'

import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'
import { useAuctionItems, useAuctionCurrentLot } from '@/features/auctions/queries'
import { useSpotPrices } from '@/features/spots/queries'
import { LotCard } from '@/features/auctions/ui/LotCard'

const SLIDES_PER_VIEW = 7
const PAD = Math.floor(SLIDES_PER_VIEW / 2)

export function LiveAuction({ auction_id }: { auction_id: string }) {
  const { data: items = [] } = useAuctionItems(auction_id)
  const { data: current } = useAuctionCurrentLot(auction_id)
  const { data: spots = [] } = useSpotPrices()

  console.log(current)
  const swiperRef = useRef<SwiperType | null>(null)

  const currentIndex = useMemo(() => {
    if (!current?.current_item_id) return -1
    return items.findIndex((i) => i.id === current.current_item_id)
  }, [items, current?.current_item_id])

  const paddedItems = useMemo(() => {
    const left = Array.from({ length: PAD }, () => null as any)
    const right = Array.from({ length: PAD }, () => null as any)
    return [...left, ...items, ...right]
  }, [items])

  useEffect(() => {
    if (!swiperRef.current) return
    if (currentIndex < 0) return

    const target = PAD + currentIndex
    swiperRef.current.slideTo(target, 250)
  }, [currentIndex])

  const currentItem = currentIndex >= 0 ? items[currentIndex] : null

  const spot = currentItem?.bullion?.metal_type
    ? spots.find((s) => s.type === currentItem?.bullion?.metal_type)
    : null

  return (
    <div className="w-full min-h-screen bg-highest pt-10">
      <div className="w-full bg-primary h-20" />

      <div className="w-full -mt-24 px-10">
        <Swiper
          onSwiper={(s) => (swiperRef.current = s)}
          slidesPerView={SLIDES_PER_VIEW}
          spaceBetween={24}
          centeredSlides
          centeredSlidesBounds={false}
          watchSlidesProgress
          initialSlide={Math.max(0, PAD + currentIndex)}
          className="overflow-visible"
        >
          {paddedItems.map((item, paddedIdx) => {
            const realIdx = paddedIdx - PAD

            if (!item) {
              return (
                <SwiperSlide key={`pad-${paddedIdx}`}>
                  <LotCardPlaceholder />
                </SwiperSlide>
              )
            }

            const isCurrent = realIdx === currentIndex
            const kind = isCurrent ? 'current' : realIdx > currentIndex ? 'future' : 'past'

            return (
              <SwiperSlide key={item.id}>
                <LotCard
                  label=""
                  item={item}
                  kind={kind}
                  currentClass="glass-card raised-off-page border-1 !border-primary"
                  futureClass="glass-card raised-off-page"
                  pastClass="glass-card raised-off-page"
                />
              </SwiperSlide>
            )
          })}
        </Swiper>
      </div>

      {currentItem && (
        <div className="max-w-3xl mx-auto py-4">
          <div className="text-center">
            <h1 className="text-4xl mt-4">{currentItem.bullion?.product_name}</h1>

            <div className="text-2xl mt-3 text-neutral-700">
              Bidding Starts At:{' '}
              <span className="font-semibold text-neutral-900">
                <PriceNumberFlow value={Number(currentItem.starting_bid)} />
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 items-center justify-center">
            <div className="flex flex-col items-center h-100 w-100">
              <Image src={currentItem.bullion?.image_front ?? ''} alt="" width={1000} height={1000} className='drop-shadow-xl'/>
              <p className="text-sm text-neutral-500 -mt-8">Obverse</p>
            </div>

            <div className="flex items-center justify-center gap-12">
              <div className="flex-col items-start justify-start text-lg text-neutral-700 gap-6">
                <p className='py-1'>{spot?.type + ' Content:'}</p>
                <p className='py-1'>Weight:</p>
                <p className='py-1'>Purity:</p>
                <p className='py-1'>Thickness:</p>
                <p className='py-1'>Diameter:</p>
              </div>
              <div className="flex-col items-start justify-end text-xl text-neutral-900 gap-6">
                <p className='py-1'>{currentItem.bullion?.content ?? 0} troy oz</p>
                <p className='py-1'>{currentItem.bullion?.gross ?? 0} troy oz</p>
                <p className='py-1'>{currentItem.bullion?.purity ?? 0}</p>
                <p className='py-1'>{currentItem.bullion?.thickness ?? 0} in</p>
                <p className='py-1'>{currentItem.bullion?.diameter ?? 0} in</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 items-center justify-center">
            <div />
            <div className="flex flex-col items-center h-100 w-100">
              <Image src={currentItem.bullion?.image_back ?? ''} alt="" width={1000} height={1000} className='drop-shadow-xl' />
              <p className="text-sm text-neutral-500 -mt-8">Reverse</p>
            </div>
          </div>
        </div>
      )}

      <div className="mx-15 flex justify-between mt-10 text-sm text-neutral-600">
        <div className='text-neutral-800 text-base'>
          Want to see more? Visit <span className="text-primary text-lg font-bold">www.doradometals.com</span>
        </div>
        <div className='text-neutral-800 text-xl'>
          Silver Spot: <span className="text-neutral-900 text-2xl font-bold">${spot?.ask_spot ?? '—'}</span>
        </div>
      </div>
    </div>
  )
}

function LotCardPlaceholder() {
  return (
    <div aria-hidden className="w-full">
      <div className="w-full rounded-lg opacity-0 pointer-events-none select-none">
        <div className="h-[96px]" />
      </div>
    </div>
  )
}
