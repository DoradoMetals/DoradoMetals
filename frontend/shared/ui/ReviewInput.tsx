'use client'

import * as React from 'react'
import { Button } from '@dorado/components'
import { Smile } from '@dorado/icons'
import { Textarea } from '@/shared/ui/base/textarea'
import { Rating, RatingButton } from '@/shared/ui/base/rating'

/* ============================================================================
   D95 — THE INVISIBLE PAIR WAS IN THE DEFAULT PROPS.
   ----------------------------------------------------------------------------
   This component used to take six colour props and default them to:

     buttonColor        = 'bg-primary'
     headerColor        = 'bg-linear-to-r from-primary via-primary/90 to-primary'
     titleTextColor     = 'text-white'
     subtitleTextcolor  = 'text-white'

   `--primary` is white now, so the header band was white and its title and
   subtitle were white ON it. EVERY consumer that did not override inherited
   that, and both consumers do exactly that. It was invisible to D92's audit
   (the classes are on different lines) and unprotected by base.css's compound
   `.bg-primary.text-white` bridge (they are on different ELEMENTS).

   All six props are DELETED rather than re-pointed. They were appearance
   passed as props, which ruling 20 forbids on its own merits, and neither call
   site - `features/orders/{purchaseOrders,salesOrders}/users/.../Completed.tsx`
   - passed a single one of them. A prop nobody varies is not an API, it is a
   default with extra steps.

   The band is now a flat surface separated by a hairline (ruling 19: no
   gradients, no fills doing a border's job), and its type comes from the
   semantic tags rather than from `text-xl sm:text-2xl` at the element.
   ============================================================================ */

type ReviewBlockProps = {
  title?: string
  subtitle?: string
  defaultText?: string
  defaultRating?: number
  maxLength?: number
  onSubmit: (payload: { text: string; rating: number }) => Promise<void> | void
  submitLabel?: string
  ariaLabels?: {
    textArea?: string
    rating?: string
    submit?: string
  }
  showSuccess?: boolean
  reviewSubmitted?: boolean
}

export function ReviewBlock({
  title = 'Submit Feedback',
  subtitle = 'Help us improve our customer experience.',
  defaultText = '',
  defaultRating = 0,
  maxLength = 1000,
  onSubmit,
  submitLabel = 'Submit',
  ariaLabels,
  showSuccess = true,
  reviewSubmitted = false,
}: ReviewBlockProps) {
  const [text, setText] = React.useState(defaultText)
  const [rating, setRating] = React.useState(defaultRating)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [success, setSuccess] = React.useState(false)

  const remaining = Math.max(0, maxLength - text.length)
  const isDisabled = reviewSubmitted || isSubmitting
  const canSubmit = !isDisabled && text.trim().length > 0 && rating > 0

  async function handleSubmit() {
    if (!canSubmit) return
    setError(null)
    setIsSubmitting(true)
    try {
      await onSubmit({ text: text.trim(), rating })
      if (showSuccess) setSuccess(true)
    } catch (e: any) {
      setError(e?.message || 'Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="w-full rounded-lg flex flex-col bg-card border border-border overflow-hidden">
      {!reviewSubmitted ? (
        <>
          <div className="flex flex-col items-start gap-2 sm:gap-4 p-4 bg-highest border-b border-border">
            <h3>{title}</h3>
            <p>{subtitle}</p>
          </div>

          <div className="flex flex-col items-start gap-4 pt-4 px-4 pb-8">
            <h4>Rate Your Experience</h4>
            <div className="bg-highest rounded-lg w-full border border-border flex flex-col gap-4 p-2">
              <div className="flex items-start gap-2">
                <Smile size={28} className="text-primary" />
                <div className="flex flex-col">
                  <h5>Overall Satisfaction</h5>
                  <p className="mb-3">How was your experience overall?</p>
                  <Rating
                    value={rating}
                    onValueChange={setRating}
                    readOnly={reviewSubmitted}
                    aria-label={ariaLabels?.rating ?? 'Star rating'}
                  >
                    {Array.from({ length: 5 }).map((_, i) => (
                      <RatingButton key={i} size={28} />
                    ))}
                  </Rating>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-start items-start w-full px-4 pb-4 gap-2">
            <div className="flex items-start w-full border-t border-border">
              <h6 className="pt-6">Additional Feedback</h6>
            </div>
            <Textarea
              className="min-h-40"
              value={text}
              onChange={(e) => {
                if (e.target.value.length <= maxLength) setText(e.target.value)
              }}
              placeholder="What worked well? What could be better?"
              aria-label={ariaLabels?.textArea ?? 'Review text area'}
              disabled={isDisabled}
            />

            <div className="flex w-full justify-end">
              <small className="tabular-nums">{remaining} characters remaining</small>
            </div>
          </div>

          <div className="flex justify-between w-full items-end p-4">
            {error ? (
              <p role="alert" className="text-destructive">
                {error}
              </p>
            ) : success ? (
              <p className="text-success">Thanks! Your review has been submitted.</p>
            ) : (
              <div />
            )}

            <div className="flex items-center justify-end">
              <Button
                type="button"
                disabled={!canSubmit}
                aria-label={ariaLabels?.submit ?? 'Submit Review'}
                onClick={handleSubmit}
              >
                {isSubmitting ? 'Submitting…' : submitLabel}
              </Button>
            </div>
          </div>
        </>
      ) : (
        <div className="flex items-center gap-2 p-4">
          <Smile size={28} className="text-primary" />
          <h4>Thanks for submitting a review!</h4>
        </div>
      )}
    </div>
  )
}
