'use client'

import { Button, Carousel, Rating, RatingButton } from '@dorado/components'
import Banner from '@/shared/ui/Banner'
import { formatFullDate } from '@/shared/utils/formatDates'
import { usePublicReviews } from '@/features/reviews/queries'

// <time dateTime> must be machine-readable; the wire hands these back as
// either a Date or an ISO string depending on the source switch.
const machineDate = (d: Date | string | null | undefined) =>
  d ? new Date(d).toISOString() : undefined

export function Reviews() {
  const { data: reviews = [] } = usePublicReviews()
  /* The band and its hairlines are <Banner>'s; the two gutters below are this
     section's own (the header row is `px-8`, the carousel `px-2`), so Banner's
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
      </div>

      <div className="mx-auto max-w-7xl px-2 pb-6 sm:pb-8">
        <Carousel
          label="Customer reviews"
          slideClassName="w-80"
          arrowsClassName="hidden md:inline-flex"
          dotsClassName="md:hidden"
          className="-mb-20"
        >
          {reviews.map((r) => (
            <div key={r.id} className="min-h-56 px-6">
              <article className="bg-highest rounded-lg border border-border p-4 sm:p-5 h-full flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <small>
                    <time dateTime={machineDate(r.created_at)}>
                      {formatFullDate(r.created_at)}
                    </time>
                  </small>
                  <div className="flex items-center gap-1">
                    <Rating value={r.rating ?? 0} readOnly>
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
            </div>
          ))}
        </Carousel>
      </div>
    </Banner>
  )
}
