'use client'

import { useMemo } from 'react'
import Drawer from '@/shared/ui/base/drawer'
import { useDrawerStore } from '@/shared/store/drawerStore'

import { FloatingLabelInput } from '@/shared/ui/inputs/FloatingLabelInput'
import { FloatingLabelTextarea } from '@/shared/ui/inputs/FloatingLabelTextarea'
import { SegmentedField } from '@/shared/ui/SegmentedField'
import StatusChip from '@/shared/ui/StatusChip'
import { Rating, RatingButton } from '@/shared/ui/base/rating'
import { EyeIcon, EyeSlashIcon } from '@phosphor-icons/react'

import { useGetSession } from '@/features/auth/queries'
import type { Review } from '@/features/reviews/types'
import { formatFullDate } from '@/shared/utils/formatDates'
import { Calendar } from '@/shared/ui/base/calendar'
import { useUpdateReview } from '@/features/reviews/queries'

// <time dateTime> must be machine-readable; the wire hands these back as
// either a Date or an ISO string depending on the source switch.
const machineDate = (d: Date | string | null | undefined) =>
  d ? new Date(d).toISOString() : undefined

export default function ReviewsDrawer({
  reviews,
  review_id,
}: {
  reviews: Review[]
  review_id: string
}) {
  const { activeDrawer, closeDrawer } = useDrawerStore()
  const isDrawerOpen = activeDrawer === 'reviews'

  const review = useMemo(() => reviews.find((r) => r.id === review_id), [reviews, review_id])
  if (!review) return null

  return (
    <Drawer label="Review" open={isDrawerOpen} setOpen={closeDrawer}>
      <Header review={review} />
      <hr />
      <EditFields review={review} />
      <hr />
      <Visibility review={review} />
      <hr />
      <Created review={review} />
      <div className="mt-auto">
        <Footer review={review} />
      </div>
    </Drawer>
  )
}

function Header({ review }: { review: Review }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between w-full">
        <h2>{review.name || 'Unnamed Reviewer'}</h2>
        <StatusChip positive={!review.hidden} size="lg">
          {review.hidden ? <EyeSlashIcon size={16} /> : <EyeIcon size={16} />}
          {review.hidden ? 'Hidden' : 'Public'}
        </StatusChip>
      </div>

      <div className="flex items-center gap-2">
        <Rating value={Math.round(review.rating)} readOnly>
          {Array.from({ length: 5 }).map((_, i) => (
            <RatingButton key={i} size={24} />
          ))}
        </Rating>
        <p>{Number(review.rating).toFixed(2)} / 5</p>
      </div>
    </div>
  )
}

function EditFields({ review }: { review: Review }) {
  const { user } = useGetSession()
  const updateReview = useUpdateReview()

  const handleUpdate = (patch: Partial<Review>) => {
    const updated: Review = { ...review, ...patch }
    updateReview.mutate({ review: updated, user_name: user?.name ?? '' })
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="eyebrow">Details</p>

      <div className="relative w-full">
        <FloatingLabelInput
          label="Reviewer Name"
          type="text"
          size="sm"
          className="h-10"
          defaultValue={review.name ?? ''}
          onBlur={(e) => handleUpdate({ name: e.target.value })}
        />
      </div>

      <div className="relative w-full">
        <FloatingLabelTextarea
          label="Review Text"
          size="sm"
          className="min-h-40"
          defaultValue={review.review_text ?? ''}
          onBlur={(e) => handleUpdate({ review_text: e.target.value })}
          placeholder="Input review here..."
        />
      </div>

      <div className="flex flex-col gap-2 items-center justify-center">
        <p>Rating</p>
        <Rating
          value={review.rating ?? 0}
          onValueChange={(val) => handleUpdate({ rating: val ?? 0 })}
        >
          {Array.from({ length: 5 }).map((_, i) => (
            <RatingButton key={i} size={48} />
          ))}
        </Rating>
      </div>
    </div>
  )
}

function Visibility({ review }: { review: Review }) {
  const { user } = useGetSession()
  const updateReview = useUpdateReview()
  const handleUpdate = (hidden: boolean) =>
    updateReview.mutate({ review: { ...review, hidden }, user_name: user?.name ?? '' })

  return (
    <div className="flex flex-col gap-4">
      <p className="eyebrow">Visibility</p>
      <SegmentedField
        label="Visibility"
        value={!review.hidden}
        onChange={(v) => handleUpdate(!v)}
        options={[
          { value: true, label: 'Public' },
          { value: false, label: 'Hidden' },
        ]}
      />

      <p>Toggle to hide/show this review on your site.</p>
    </div>
  )
}

function Created({ review }: { review: Review }) {
  const { user } = useGetSession()
  const updateReview = useUpdateReview()

  const handleUpdate = (created_at: Date) =>
    updateReview.mutate({ review: { ...review, created_at }, user_name: user?.name ?? '' })

  const maxDate = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate())
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const minDate = useMemo(() => {
    const d = new Date('2025-03-01T00:00:00Z')
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const firstOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)
  const clampDate = (d: Date, min: Date, max: Date) => (d < min ? min : d > max ? max : d)

  const selectedDate = useMemo<Date>(() => {
    const raw = review.created_at ? new Date(review.created_at) : maxDate
    raw.setHours(0, 0, 0, 0)
    return clampDate(raw, minDate, maxDate)
  }, [review.created_at, minDate, maxDate])

  const startMonth = useMemo(() => firstOfMonth(minDate), [minDate])
  const endMonth = useMemo(() => firstOfMonth(maxDate), [maxDate])

  return (
    <div className="flex flex-col gap-4">
      <p className="eyebrow">Contact Info</p>

      <div className="flex flex-col md:flex-row w-full justify-center md:justify-between gap-3 items-start">
        <Calendar
          mode="single"
          showOutsideDays={false}
          startMonth={startMonth}
          endMonth={endMonth}
          defaultMonth={selectedDate}
          selected={selectedDate}
          onSelect={(newDate) => {
            if (!newDate) return
            const d = new Date(newDate)
            d.setHours(0, 0, 0, 0)
            if (d < minDate || d > maxDate) return
            handleUpdate(d)
          }}
          className="p-2 w-full"
          disabled={[{ before: minDate }, { after: maxDate }]}
        />
      </div>
    </div>
  )
}

function Footer({ review }: { review: Review }) {
  return (
    <div className="flex flex-col gap-2">
      <p>
        <small>
          Created on{' '}
          <strong>
            <time dateTime={machineDate(review.created_at)}>
              {formatFullDate(review.created_at)}
            </time>
          </strong>{' '}
          by <strong>{review.created_by || '—'}</strong>
        </small>
      </p>

      <p>
        <small>
          Updated on{' '}
          <strong>
            <time dateTime={machineDate(review.updated_at)}>
              {formatFullDate(review.updated_at)}
            </time>
          </strong>{' '}
          by <strong>{review.updated_by || '—'}</strong>
        </small>
      </p>
    </div>
  )
}
