'use client'

import { Button } from '@/components/ui/button'
import { useRates } from '@/lib/queries/useRates'
import { intakeOptions } from '@/types/intake'
import { payoutOptions } from '@/types/payout'
import { Metal, pctLabel, topRatesByMetal } from '@/types/rates'
import formatPhoneNumber from '@/utils/formatPhoneNumber'
import { ArrowLeftIcon, ArrowRightIcon, ArrowUpRightIcon, PhoneIcon } from '@phosphor-icons/react'
import Image from 'next/image'
import { useMemo, useRef, useState } from 'react'

import { Swiper, SwiperSlide } from 'swiper/react'
import { Navigation, Pagination } from 'swiper/modules'

import type { Swiper as SwiperType } from 'swiper'
import 'swiper/css'
import { usePublicReviews } from '@/lib/queries/useReviews'
import { Rating, RatingButton } from '@/components/ui/rating'
import { cn } from '@/lib/utils'
import { formatFullDate } from '@/utils/dateFormatting'
import { useRouter } from 'next/navigation'

export default function Home() {
  const { data: rates = [] } = useRates()
  const { data: reviews = [] } = usePublicReviews()
  const top4 = useMemo(() => topRatesByMetal(rates), [rates])
  const swiperRef = useRef<SwiperType | null>(null)
  const [isBeginning, setIsBeginning] = useState(true)
  const [isEnd, setIsEnd] = useState(false)
  const updateEdges = (s: SwiperType) => {
    setIsBeginning(s.isBeginning)
    setIsEnd(s.isEnd)
  }

  const router = useRouter()

  return (
    <div className="flex flex-col h-full w-full bg-card items-center justify-center py-2 sm:py-8 gap-5 sm:gap-10 mb-50">
      {/* Hero */}
      <section
        aria-label="Dorado hero"
        className="w-full flex flex-col items-center justify-center"
      >
        <div className="flex items-center justify-center max-w-5xl p-4">
          <div className="flex flex-col items-center w-full gap-8">
            <div className="flex flex-col gap-3">
              <h1 className="text-3xl sm:text-4xl text-neutral-900 font-semibold text-left sm:text-center">
                Precious Metals Trading Made Easy
              </h1>
              <h4 className="text-base sm:text-xl text-neutral-800 text-left sm:text-center">
                Buying and selling precious metals can be stressful. We're here to fix that.
              </h4>
            </div>
            <div className="hidden sm:flex items-center justify-center">
              <Image
                src={'/landing-page.svg'}
                alt="landing-page-svg"
                height={3000}
                width={3000}
              ></Image>
            </div>
            <div className="flex sm:hidden items-center justify-center">
              <Image
                src={'/landing-page-mobile.svg'}
                alt="landing-page-svg"
                height={3000}
                width={3000}
              ></Image>
            </div>
            <Button
              className="bg-primary raised-off-page px-9 sm:px-10 py-6 sm:py-7 text-white text-lg sm:text-xl"
              onClick={() => router.push('/sell')}
            >
              Get An Estimate
            </Button>
          </div>
        </div>
      </section>

      {/* Rates */}
      <section aria-label="Our Current Rates" className="w-full flex flex-col">
        <div
          className="
          bg-primary
          px-6
          pt-4 pb-16 sm:pt-8 sm:pb-34 lg:pt-10 lg:pb-44
          [clip-path:polygon(0_0,100%_0,100%_100%,50%_60%,0_100%)]
          sm:[clip-path:polygon(0_0,100%_0,100%_100%,50%_40%,0_100%)]

        "
        >
          <h2 className="text-center text-white font-semibold tracking-wide text-lg sm:text-2xl">
            Get the highest rates for your precious metals
          </h2>
        </div>
        <div className="flex items-center justify-center -mt-2 sm:-mt-12 w-full mb-8 md:mb-12">
          <div className="flex flex-col items-center w-full max-w-6xl gap-4 md:gap-6">
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-y-8 w-full max-w-5xl">
              {top4.map((r, i) => {
                const metal = ['Gold', 'Silver', 'Platinum', 'Palladium'][i] as Metal
                const value = r?.payout_pct ?? null
                return (
                  <div key={metal} className="flex justify-center">
                    <div className="flex flex-col items-start">
                      <p className="text-base text-neutral-700 pl-1 tracking-wide font-normal">
                        Up to
                      </p>
                      <dt className="sr-only">{metal} payout</dt>
                      <dd className=" text-5xl sm:text-6xl font-bold text-neutral-900">
                        {pctLabel(value)}
                      </dd>
                      <p className="text-base text-neutral-700 pl-1 tracking-wide font-normal">
                        on {metal}
                      </p>
                    </div>
                  </div>
                )
              })}
            </dl>
          </div>
        </div>
        <p className="text-center text-neutral-600 text-sm md:text-lg max-w-2xl mx-auto mb-8 md:mb-12 px-4">
          We buy at rates you won't find anywhere else. Skip the local pawn shop or jewelry store—
          you deserve a fair market value for your metals.
        </p>
        <div className="flex justify-center -mb-5">
          <Button className="bg-highest raised-off-page px-6 sm:px-8 py-5 text-white text-lg z-1 text-primary hover:text-white hover:bg-primary">
            View Full Rates
          </Button>
        </div>

        <div className="h-12 bg-primary" />
      </section>

      {/* Payout Methods */}
      <section aria-label="Payout Methods" className="w-full p-4 lg:py-10">
        <div className="max-w-7xl mx-auto">
          <header className="mb-4 sm:mb-8">
            <h2 className="text-2xl text-neutral-900 sm:text-3xl font-semibold">
              Same Day Payouts
            </h2>
            <p className="text-neutral-700 text-sm sm:text-base mt-2 max-w-3xl">
              Don't like long wait times for payouts? We send it the same day we receive your metal.
            </p>
          </header>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-10">
            {payoutOptions.map((opt) => {
              const Icon = opt.icon
              return (
                <div
                  key={opt.method}
                  className="group relative rounded-xl bg-primary has-[.arrow:hover]:-translate-y-0.5 transition p-4 raised-off-page"
                >
                  <div className="flex items-center justify-between w-full mb-2 md:mb-4 lg:mb-10">
                    <div className="flex items-center gap-2">
                      <Icon className="text-white hidden md:block" size={48} />
                      <Icon className="text-white md:hidden" size={36} />
                      <h3 className="text-white text-xl font-semibold truncate mb-0 pb-0 md:hidden">
                        {opt.label}
                      </h3>
                    </div>

                    <Button
                      type="button"
                      className="arrow inline-flex items-center justify-center hover:cursor-pointer p-0"
                      onClick={() => router.push('/')}
                    >
                      <ArrowUpRightIcon className="text-white hidden md:block" size={20} />
                      <ArrowUpRightIcon className="text-white md:hidden" size={16} />
                    </Button>
                  </div>
                  <div className="flex flex-col items-start gap-1">
                    <h3 className="text-white hidden md:block text-2xl font-semibold truncate mb-0 pb-0">
                      {opt.label}
                    </h3>

                    <p className="text-white text-xs md:text-sm leading-relaxed">{opt.paragraph}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Support Banner */}
      <section aria-label="Support Banner" className="w-full bg-primary py-2">
        <div className="flex items-center justify-center">
          <div className="flex items-center w-full justify-between max-w-7xl px-4">
            <h4 className="text-white text-xl hidden md:block">Need Support? Give us a call.</h4>
            <h4 className="text-white text-sm  md:hidden">Need Support?</h4>
            <a
              href={`tel:+${process.env.NEXT_PUBLIC_DORADO_PHONE_NUMBER}`}
              className="flex items-center gap-1 justify-end"
            >
              <PhoneIcon className="text-white font-semibold hidden md:block" size={36} />
              <PhoneIcon className="text-white font-semibold md:hidden" size={24} weight="bold" />

              <h5 className="text-white font-semibold md:font-normal text-base md:text-2xl">
                {formatPhoneNumber(process.env.NEXT_PUBLIC_DORADO_PHONE_NUMBER ?? '')}
              </h5>
            </a>
          </div>
        </div>
      </section>

      {/* Intake Methods */}
      <section aria-label="Intake Methods" className="w-full p-4 lg:py-10">
        <div className="flex items-center justify-center">
          <div className="flex flex-col gap-10 md:gap-16 items-center justify-center max-w-5xl w-full px-6">
            {intakeOptions.map((opt) => {
              const Icon = opt.icon
              return (
                <div
                  key={opt.method}
                  className="flex items-start justify-center gap-6 sm:gap-8 w-full"
                >
                  <Icon size={96} className="text-primary shrink-0 hidden md:block" />

                  <div className="flex flex-col">
                    <div className="flex items-end gap-2">
                      <Icon size={32} className="text-primary shrink-0 md:hidden" />

                      <h3 className="text-xl sm:text-2xl md:text-3xl md:text-4xl font-semibold text-neutral-900">
                        {opt.label}
                      </h3>
                    </div>

                    <p className="mt-2 text-neutral-700 text-sm sm:text-lg max-w-55 md:max-w-sm">{opt.blurb}</p>
                    <Button variant="ghost" className="self-start p-0 mb-0">
                      <span className="mt-3 inline-flex items-center gap-2 text-neutral-500 text-xs md:text-sm">
                        Learn More
                        <ArrowRightIcon size={16} className="text-neutral-500" />
                      </span>
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Reviews */}
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
    </div>
  )
}
