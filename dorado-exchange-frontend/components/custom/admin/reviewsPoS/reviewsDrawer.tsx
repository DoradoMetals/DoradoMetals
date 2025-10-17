'use client'

import { useMemo } from 'react'
import Drawer from '@/components/ui/drawer'
import { useDrawerStore } from '@/store/drawerStore'

import { Button } from '@/components/ui/button'
import { FloatingLabelInput } from '@/components/ui/floating-label-input'
import { FloatingLabelTextarea } from '@/components/ui/floating-label-textarea'
import { DisplayToggle } from '@/components/ui/displayToggle'
import { Rating, RatingButton } from '@/components/ui/rating'
import { cn } from '@/lib/utils'
import { EyeIcon, EyeSlashIcon } from '@phosphor-icons/react'

import { useGetSession } from '@/lib/queries/useAuth'
import { useUpdateReview } from '@/lib/queries/useReviews'
import type { Review } from '@/types/reviews'
import { formatFullDate } from '@/utils/dateFormatting'

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
    <Drawer open={isDrawerOpen} setOpen={closeDrawer} className="bg-background">
      <Header review={review} />
      <div className="separator-inset" />
      <EditFields review={review} />
      <div className="separator-inset" />
      <Visibility review={review} />
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
        <div className="text-2xl text-neutral-900">{review.name || 'Unnamed Reviewer'}</div>
        <div
          className={cn(
            'px-2 py-1 border-1 rounded-lg flex items-center gap-1 text-sm font-semibold',
            review.hidden
              ? 'bg-destructive/20 text-destructive border-destructive'
              : 'bg-success/20 text-success border-success'
          )}
        >
          {review.hidden ? <EyeSlashIcon size={16} /> : <EyeIcon size={16} />}
          {review.hidden ? 'Hidden' : 'Public'}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Rating value={Math.round(review.rating)} readOnly>
          {Array.from({ length: 5 }).map((_, i) => (
            <RatingButton key={i} size={24} className="text-primary" />
          ))}
        </Rating>
        <div className="text-sm text-neutral-700">{Number(review.rating).toFixed(2)} / 5</div>
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
      <div className="section-label">Details</div>

      <div className="relative w-full">
        <FloatingLabelInput
          label="Reviewer Name"
          type="text"
          size="sm"
          className="input-floating-label-form h-10"
          defaultValue={review.name ?? ''}
          onBlur={(e) => handleUpdate({ name: e.target.value })}
        />
      </div>

      <div className="relative w-full">
        <FloatingLabelTextarea
          label="Review Text"
          size="sm"
          className="input-floating-label-form min-h-40"
          defaultValue={review.review_text ?? ''}
          onBlur={(e) => handleUpdate({ review_text: e.target.value })}
          placeholder="Input review here..."
        />
      </div>

      <div className="flex flex-col gap-2 items-center justify-center">
        <div className="text-xs sm:text-sm text-neutral-600">Rating</div>
        <Rating
          value={review.rating ?? 0}
          onValueChange={(val) => handleUpdate({ rating: val ?? 0 })}
        >
          {Array.from({ length: 5 }).map((_, i) => (
            <RatingButton key={i} size={48} className="transition-transform text-primary" />
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
      <div className="section-label">Visibility</div>
      <DisplayToggle
        label="Visibility"
        value={!review.hidden}
        onChange={(v) => handleUpdate(!v)}
        className="w-full"
        onLabel="Public"
        offLabel="Hidden"
        onIntent="success"
        offIntent="destructive"
      />

      <div className="text-xs text-neutral-600">Toggle to hide/show this review on your site.</div>
    </div>
  )
}

function Footer({ review }: { review: Review }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1 text-xs text-neutral-600">
        <span className="text-neutral-600">Created on</span>{' '}
        <span className="font-medium text-neutral-800">{formatFullDate(review.updated_at)}</span>
        <span className="text-neutral-600">by</span>
        <span className="font-medium text-neutral-800">{review.created_by || '—'}</span>
      </div>

      <div className="flex items-center gap-1 text-xs text-neutral-600">
        <span className="text-neutral-600">Updated on</span>{' '}
        <span className="font-medium text-neutral-800">{formatFullDate(review.created_at)}</span>
        <span className="text-neutral-600">by</span>
        <span className="font-medium text-neutral-800">{review.updated_by || '—'}</span>
      </div>
    </div>
  )
}
