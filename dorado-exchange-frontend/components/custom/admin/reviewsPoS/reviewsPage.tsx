'use client'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FloatingLabelInput } from '@/components/ui/floating-label-input'
import { useGetSession } from '@/lib/queries/useAuth'
import { X } from 'lucide-react'
import { useMemo, useState } from 'react'

import { useCreateReview, useReviews } from '@/lib/queries/useReviews'
import { ReviewCard, ReviewStats } from '@/types/reviews'
import { FloatingLabelTextarea } from '@/components/ui/floating-label-textarea'
import { Rating, RatingButton } from '@/components/ui/rating'
import ReviewsCards from './reviewsCards'
import ReviewsTable from './reviewsTable'

export function ReviewsPage() {
  const { user } = useGetSession()

  const { data: reviews = [] } = useReviews()
  const [selectedCard, setSelectedCard] = useState<ReviewCard>(null)

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [reviewText, setReviewText] = useState('')
  const [rating, setRating] = useState(0)
  const [hidden, setHidden] = useState(true)

  const createLead = useCreateReview()

  const stats: ReviewStats = useMemo(() => {
    const totals = {
      totalReviews: reviews.length,
      averageRating: 0,
      hiddenCount: 0,
      publicCount: 0,
      starCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<1 | 2 | 3 | 4 | 5, number>,
    }

    let sum = 0
    let count = 0

    for (const r of reviews) {
      const rt = Math.round(Number(r.rating) || 0)
      if (rt >= 1 && rt <= 5) totals.starCounts[rt as 1 | 2 | 3 | 4 | 5]++
      if (r.hidden) totals.hiddenCount++
      if (Number.isFinite(r.rating)) {
        sum += Number(r.rating)
        count++
      }
    }

    totals.publicCount = Math.max(0, totals.totalReviews - totals.hiddenCount)
    totals.averageRating = count ? Number((sum / count).toFixed(2)) : 0
    return totals
  }, [reviews])

  const handleCreateNewReview = () => {
    try {
      createLead.mutate({
        name: name,
        review_text: reviewText,
        rating: rating ?? 0,
        created_by: user?.name ?? '',
        updated_by: user?.name ?? '',
        hidden: hidden,
      })

      setName('')
      setReviewText('')
      setRating(0)
      setHidden(true)
      setOpen(false)
    } catch (err) {
      console.error('Lead creation failed', err)
    }
  }

  const isValid = name.trim() !== '' && reviewText.trim() !== '' && rating > 0

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="tracking-widest text-xs text-neutral-600 uppercase mr-auto mb-2">
              Create New Review
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col w-full justify-center items-center">
            <div className="flex flex-col w-full max-w-md items-center justify-center gap-6 rounded-lg">
              <div className="relative w-full">
                <FloatingLabelInput
                  label="Reviewer Name"
                  type="text"
                  size="sm"
                  className="input-floating-label-form h-10"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                {name !== '' && (
                  <Button
                    variant="ghost"
                    onClick={() => setName('')}
                    className="absolute right-1 top-1/2 -translate-y-1/2 text-neutral-600 hover:bg-transparent"
                    tabIndex={-1}
                    aria-label="Clear name"
                  >
                    <X size={16} />
                  </Button>
                )}
              </div>

              <div className="relative w-full">
                <FloatingLabelTextarea
                  label="Review Text"
                  inputMode="tel"
                  autoComplete="tel"
                  size="sm"
                  className="input-floating-label-form min-h-40"
                  maxLength={17}
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                />
              </div>

              <div className="flex w-full items-center justify-center">
                <Rating value={rating} onValueChange={setRating}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <RatingButton key={i} size={48} className="transition-transform text-primary" />
                  ))}
                </Rating>
              </div>

              <Button
                variant="default"
                className="liquid-gold raised-off-page text-white hover:text-white p-4 w-full"
                disabled={!isValid}
                onClick={handleCreateNewReview}
              >
                Create Lead
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <ReviewsCards
        selectedCard={selectedCard as any}
        setSelectedCard={setSelectedCard as any}
        stats={stats}
      />

      <ReviewsTable setOpen={setOpen} selectedCard={selectedCard as any} />
    </>
  )
}
