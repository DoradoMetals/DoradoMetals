'use client'

import type { Review } from '@dorado/contracts'
import { useMemo } from 'react'
import { useDrawerRecord } from '../../hooks/useDrawerRecord'

import { formatFullDate } from '@/shared/utils/formatDates'
import {
  Badge,
  Drawer,
  Rating,
  RatingButton,
  Calendar,
  Field,
  Input,
  RadioGroup,
  RadioOption,
  Textarea,
} from '@dorado/components'
import { Eye, EyeOff } from '@dorado/icons'
import { useUpdateReview } from '@/shared/hooks/reviews/queries'

const machineDate = (d: Date | string | null | undefined) =>
  d ? new Date(d).toISOString() : undefined

export default function ReviewsDrawer({
  reviews,
  review_id,
}: {
  reviews: Review[]
  review_id: string
}) {
  const { open, record: review, close } = useDrawerRecord('reviews', reviews, review_id)
  if (!review) return null

  return (
    <Drawer label="Review" open={open} setOpen={close}>
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
        <Badge intent={review.hidden ? 'danger' : 'success'} size="lg">
          {review.hidden ? <EyeOff size={16} /> : <Eye size={16} />}
          {review.hidden ? 'Hidden' : 'Public'}
        </Badge>
      </div>

      <div className="flex items-center gap-2">
        <Rating value={Math.round(review.rating ?? 0)} readOnly>
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
  const updateReview = useUpdateReview()

  const handleUpdate = (patch: Partial<Pick<Review, 'name' | 'review_text' | 'rating'>>) => {
    updateReview.mutate({ review_id: review.id, patch })
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="eyebrow">Details</p>

      <Input
        label="Reviewer Name"
        type="text"
        defaultValue={review.name ?? ''}
        onBlur={(e) => handleUpdate({ name: e.target.value })}
      />

      <Textarea
        label="Review Text"
        rows={6}
        defaultValue={review.review_text ?? ''}
        onBlur={(e) => handleUpdate({ review_text: e.target.value })}
        placeholder="Input review here..."
      />

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
  const updateReview = useUpdateReview()
  const handleUpdate = (hidden: boolean) =>
    updateReview.mutate({ review_id: review.id, patch: { hidden } })

  return (
    <div className="flex flex-col gap-4">
      <p className="eyebrow">Visibility</p>
      <Field label="Visibility">
        <RadioGroup
          value={review.hidden ? 'hidden' : 'public'}
          onValueChange={(v) => handleUpdate(v === 'hidden')}
          className="flex w-full gap-2"
        >
          <RadioOption value="public" variant="segment" className="flex-1">
            Public
          </RadioOption>
          <RadioOption value="hidden" variant="segment" className="flex-1">
            Hidden
          </RadioOption>
        </RadioGroup>
      </Field>

      <p>Toggle to hide/show this review on your site.</p>
    </div>
  )
}

function Created({ review }: { review: Review }) {
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
