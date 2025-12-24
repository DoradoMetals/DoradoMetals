'use client'

import { Button } from '@/shared/ui/base/button'
import { ArrowLeftIcon, ArrowRightIcon } from '@phosphor-icons/react'
import { useRef, useState } from 'react'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Navigation, Pagination } from 'swiper/modules'
import type { Swiper as SwiperType } from 'swiper'
import 'swiper/css'
import { Rating, RatingButton } from '@/shared/ui/base/rating'
import { cn } from '@/shared/utils/cn'
import { formatFullDate } from '@/shared/utils/formatDates'
import { usePublicReviews } from '@/features/reviews/queries'

export function Reviews() {
  const { data: reviews = [] } = usePublicReviews()
  const swiperRef = useRef<SwiperType | null>(null)
  const [isBeginning, setIsBeginning] = useState(true)
  const [isEnd, setIsEnd] = useState(false)
  const updateEdges = (s: SwiperType) => {
    setIsBeginning(s.isBeginning)
    setIsEnd(s.isEnd)
  }
  return (
    <>
      <section aria-label="Reviews" className="w-full">
        <div className="bg-primary">
          <div className={cn('mx-auto max-w-7xl px-8')}>
            <div className="flex flex-col gap-4 md:flex-row items-start justify-between py-4 sm:py-6">
              <div className="flex flex-col gap-1 md:gap-1 items-start w-full">
                <h2 className="text-white text-xl sm:text-2xl font-semibold">
                  Don't just take our word for it…
                </h2>
                <p className="text-white/80 text-xs sm:text-base">
                  Read real reviews by real customers.
                </p>
              </div>
              <div className="flex w-full justify-start md:justify-end">
                <Button
                  className="border-1 border-white hover:bg-white text-white hover:text-primary"
                  variant={'ghost'}
                >
                  <a href="/reviews" className="text-sm sm:text-base">
                    See All Reviews
                  </a>
                </Button>
              </div>
            </div>

            <div
              className="md:hidden flex items-center justify-center pb-2 reviews-swiper-pagination
                    [&_.swiper-pagination-bullet]:!bg-highest/90
                    [&_.swiper-pagination-bullet]:!opacity-40
                    [&_.swiper-pagination-bullet-active]:!opacity-100
                    [&_.swiper-pagination-bullet]:!w-2.5 [&_.swiper-pagination-bullet]:!h-2.5
                    [&_.swiper-pagination-bullet]:!mx-1"
            />
          </div>

          <div className="relative mx-auto px-2 max-w-7xl pb-6 sm:pb-8">
            <Button
              type="button"
              aria-label="Previous reviews"
              className={cn(
                'hidden md:flex items-center justify-center absolute -left-10 top-1/2 -translate-y-1/2 z-10 reviews-swiper-prev',
                'h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-highest shadow-md hover:shadow-lg hover:bg-highest',
                isBeginning && 'pointer-events-none opacity-40'
              )}
            >
              <ArrowLeftIcon size={18} className="text-neutral-800" />
            </Button>

            <Button
              type="button"
              aria-label="Next reviews"
              className={cn(
                'hidden md:flex items-center justify-center absolute -right-10 top-1/2 -translate-y-1/2 z-10 reviews-swiper-next',
                'h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-highest shadow-md hover:shadow-lg hover:bg-highest',
                isEnd && 'pointer-events-none opacity-40'
              )}
            >
              <ArrowRightIcon size={18} className="text-neutral-800" />
            </Button>

            <Swiper
              onBeforeInit={(s) => (swiperRef.current = s)}
              onSwiper={(s) => {
                swiperRef.current = s
              }}
              modules={[Navigation, Pagination]}
              navigation={{
                nextEl: '.reviews-swiper-next',
                prevEl: '.reviews-swiper-prev',
              }}
              pagination={{
                el: '.reviews-swiper-pagination',
                clickable: true,
              }}
              slidesPerView={1}
              slidesPerGroup={1}
              spaceBetween={10}
              breakpoints={{
                640: { slidesPerView: 2, slidesPerGroup: 2, spaceBetween: 16 },
                1024: { slidesPerView: 3, slidesPerGroup: 3, spaceBetween: 18 },
              }}
              onAfterInit={updateEdges}
              onSlideChange={updateEdges}
              onResize={updateEdges}
              onBreakpoint={updateEdges}
              className="reviews-swiper -mb-20 !pb-1 !overflow-y-visible"
            >
              {reviews.map((r) => (
                <SwiperSlide key={r.id} className="!h-auto min-h-56 px-6">
                  <article className="bg-highest rounded-lg raised-off-page p-4 sm:p-5 h-full flex flex-col">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-[11px] sm:text-xs text-neutral-500">
                        {formatFullDate(r.created_at)}
                      </div>
                      <div className="flex items-center gap-1">
                        <Rating value={r.rating} readOnly>
                          {Array.from({ length: 5 }).map((_, i) => (
                            <RatingButton
                              key={i}
                              size={24}
                              className="transition-transform text-primary"
                            />
                          ))}
                        </Rating>
                      </div>
                    </div>

                    <p className="text-neutral-700 text-sm leading-relaxed line-clamp-5">
                      {r.review_text}
                    </p>

                    <div className="mt-auto pt-4 flex items-center justify-between">
                      <h6 className="text-neutral-900 font-semibold">{r.name}</h6>
                      <a href={`/reviews/${r.id}`} className="text-neutral-500 text-xs underline">
                        See more
                      </a>
                    </div>
                  </article>
                </SwiperSlide>
              ))}
            </Swiper>
          </div>
        </div>
      </section>
    </>
  )
}
