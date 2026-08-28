'use client'

import { Button } from '@/shared/ui/base/button'
import Banner from '@/shared/ui/Banner'
import { ArrowLeftIcon, ArrowRightIcon } from '@phosphor-icons/react'
import { useRef, useState } from 'react'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Navigation, Pagination } from 'swiper/modules'
import type { Swiper as SwiperType } from 'swiper'
import 'swiper/css'
import { Rating, RatingButton } from '@/shared/ui/base/rating'
import { formatFullDate } from '@/shared/utils/formatDates'
import { usePublicReviews } from '@/features/reviews/queries'

// <time dateTime> must be machine-readable; the wire hands these back as
// either a Date or an ISO string depending on the source switch.
const machineDate = (d: Date | string | null | undefined) =>
  d ? new Date(d).toISOString() : undefined

export function Reviews() {
  const { data: reviews = [] } = usePublicReviews()
  const swiperRef = useRef<SwiperType | null>(null)
  const [isBeginning, setIsBeginning] = useState(true)
  const [isEnd, setIsEnd] = useState(false)
  const updateEdges = (s: SwiperType) => {
    setIsBeginning(s.isBeginning)
    setIsEnd(s.isEnd)
  }
  /* The band and its hairlines are <Banner>'s; the two gutters below are this
     section's own (the header row is `px-8`, the swiper `px-2`), so Banner's
     single default gutter is neutralised rather than fought. */
  return (
    <Banner label="Reviews" className="py-0" contentClassName="max-w-none px-0">
          <div className="mx-auto max-w-7xl px-8">
            <div className="flex flex-col gap-4 md:flex-row items-start justify-between py-4 sm:py-6">
              <div className="flex flex-col gap-1 md:gap-1 items-start w-full">
                <h2>Don't just take our word for it…</h2>
                <p>Read real reviews by real customers.</p>
              </div>
              <div className="flex w-full justify-start md:justify-end">
                <Button asChild variant="secondary">
                  <a href="/reviews">See All Reviews</a>
                </Button>
              </div>
            </div>

            <div
              className="md:hidden flex items-center justify-center pb-2 reviews-swiper-pagination
                    [&_.swiper-pagination-bullet]:!bg-muted-foreground
                    [&_.swiper-pagination-bullet]:!opacity-40
                    [&_.swiper-pagination-bullet-active]:!opacity-100
                    [&_.swiper-pagination-bullet]:!w-2.5 [&_.swiper-pagination-bullet]:!h-2.5
                    [&_.swiper-pagination-bullet]:!mx-1"
            />
          </div>

          <div className="relative mx-auto px-2 max-w-7xl pb-6 sm:pb-8">
            <Button
              type="button"
              variant="secondary"
              size="icon"
              aria-label="Previous reviews"
              disabled={isBeginning}
              className="hidden md:flex absolute -left-10 top-1/2 -translate-y-1/2 z-10 reviews-swiper-prev"
            >
              <ArrowLeftIcon size={18} />
            </Button>

            <Button
              type="button"
              variant="secondary"
              size="icon"
              aria-label="Next reviews"
              disabled={isEnd}
              className="hidden md:flex absolute -right-10 top-1/2 -translate-y-1/2 z-10 reviews-swiper-next"
            >
              <ArrowRightIcon size={18} />
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
                  <article className="bg-highest rounded-lg border border-border p-4 sm:p-5 h-full flex flex-col">
                    <div className="flex items-center justify-between mb-3">
                      <small>
                        <time dateTime={machineDate(r.created_at)}>
                          {formatFullDate(r.created_at)}
                        </time>
                      </small>
                      <div className="flex items-center gap-1">
                        <Rating value={r.rating} readOnly>
                          {Array.from({ length: 5 }).map((_, i) => (
                            <RatingButton key={i} size={24} />
                          ))}
                        </Rating>
                      </div>
                    </div>

                    <p className="line-clamp-5">{r.review_text}</p>

                    <div className="mt-auto pt-4 flex items-center justify-between">
                      <h6>{r.name}</h6>
                      <p>
                        <small>
                          <a href={`/reviews/${r.id}`}>See more</a>
                        </small>
                      </p>
                    </div>
                  </article>
                </SwiperSlide>
              ))}
            </Swiper>
          </div>
    </Banner>
  )
}
