import { useState } from 'react'
import { PurchaseOrderDrawerContentProps } from '@/features/orders/purchaseOrders/types'
import { useUser } from '@/features/auth/authClient'
import { useCreateReview } from '@/features/reviews/queries'
import { useCreateOrderReview } from '@dorado/client'
import { Button, Rating, RatingButton, Textarea } from '@dorado/components'

export default function CompletedPurchaseOrder({ view }: PurchaseOrderDrawerContentProps) {
  const { order } = view

  const { user } = useUser()
  const createReview = useCreateReview()
  const setCreated = useCreateOrderReview()

  const [text, setText] = useState('')
  const [rating, setRating] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reviewSubmitted = !!order.review_created
  const canSubmit = !reviewSubmitted && !isSubmitting && text.trim().length > 0 && rating > 0

  const handleSubmit = async () => {
    if (!canSubmit) return
    setError(null)
    setIsSubmitting(true)
    try {
      await createReview.mutateAsync({
        review_text: text.trim(),
        rating,
        name: user?.name ?? '',
        hidden: false,
      })
      await setCreated.mutateAsync({ id: order.id, direction: 'purchase' })
    } catch (e: any) {
      setError(e?.message || 'Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col w-full h-full">
      <div className="flex w-full mb-4">
        <div className="flex flex-col w-full gap-4 rounded-lg border border-border bg-card p-4">
          <h4>How did we do?</h4>
          <p>Help us improve our customer experience.</p>

          {reviewSubmitted ? (
            <p className="text-success">Thanks! Your review has been submitted.</p>
          ) : (
            <>
              <Rating value={rating} onValueChange={setRating} aria-label="Star rating">
                {Array.from({ length: 5 }).map((_, i) => (
                  <RatingButton key={i} size={28} />
                ))}
              </Rating>

              <Textarea
                className="min-h-32"
                value={text}
                onChange={(e) => {
                  if (e.target.value.length <= 600) setText(e.target.value)
                }}
                placeholder="What worked well? What could be better?"
                aria-label="Review text area"
                disabled={isSubmitting}
              />

              {error ? (
                <p role="alert" className="text-destructive">
                  {error}
                </p>
              ) : null}

              <Button type="button" disabled={!canSubmit} onClick={handleSubmit}>
                {isSubmitting ? 'Submitting…' : 'Upload Review'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
