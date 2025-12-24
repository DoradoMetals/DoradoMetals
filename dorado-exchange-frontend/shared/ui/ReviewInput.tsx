'use client'

import * as React from 'react'
import { Button } from '@/shared/ui/base/button'
import { Textarea } from '@/shared/ui/base/textarea'
import { Rating, RatingButton } from '@/shared/ui/base/rating'
import { cn } from '@/shared/utils/cn'
import { SmileyIcon } from '@phosphor-icons/react'

type ReviewBlockProps = {
  title?: string
  subtitle?: string
  defaultText?: string
  defaultRating?: number
  maxLength?: number
  onSubmit: (payload: { text: string; rating: number }) => Promise<void> | void
  accentClassName?: string
  buttonColor?: string
  buttonHover?: string
  submitLabel?: string
  ariaLabels?: {
    textArea?: string
    rating?: string
    submit?: string
  }
  showSuccess?: boolean
  headerColor?: string
  titleTextColor?: string
  subtitleTextcolor?: string
  reviewSubmitted?: boolean
}

export function ReviewBlock({
  title = 'Submit Feedback',
  subtitle = 'Help us improve our customer experience.',
  defaultText = '',
  defaultRating = 0,
  maxLength = 1000,
  onSubmit,
  accentClassName = 'text-primary',
  buttonColor = 'bg-primary',
  buttonHover = 'hover:bg-primary/90',
  submitLabel = 'Submit',
  ariaLabels,
  showSuccess = true,
  headerColor = 'bg-linear-to-r from-primary via-primary/90 to-primary',
  titleTextColor = 'text-white',
  subtitleTextcolor = 'text-white',
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
    <div className="w-full rounded-xl flex flex-col bg-card raised-off-page">
      {!reviewSubmitted ? (
        <>
          <div
            className={cn(headerColor, 'flex flex-col items-start gap-2 sm:gap-4 p-4 rounded-t-xl')}
          >
            <h3 className={cn('text-xl sm:text-2xl font-semibold', titleTextColor)}>{title}</h3>
            <p className={cn('text-xs sm:text-sm', subtitleTextcolor)}>{subtitle}</p>
          </div>

          <div className={cn('flex flex-col items-start gap-4 pt-4 px-4 pb-8')}>
            <h4 className="text-sm sm:text-base text-neutral-800 font-semibold">
              Rate Your Experience
            </h4>
            <div className="bg-highest rounded-lg w-full border-1 border-border flex flex-col gap-4 p-2">
              <div className="flex items-start gap-2">
                <SmileyIcon size={28} className={cn(accentClassName)} />
                <div className="flex flex-col">
                  <h5 className="text-base sm:text-lg text-neutral-800">Overall Satisfaction</h5>
                  <p className="text-xs sm:text-sm text-neutral-600 mb-3">
                    How was your experience overall?
                  </p>
                  <Rating
                    value={rating}
                    onValueChange={setRating}
                    readOnly={reviewSubmitted}
                    aria-label={ariaLabels?.rating ?? 'Star rating'}
                  >
                    {Array.from({ length: 5 }).map((_, i) => (
                      <RatingButton
                        key={i}
                        size={28}
                        className={cn('transition-transform', accentClassName)}
                      />
                    ))}
                  </Rating>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-start items-start w-full px-4 pb-4 gap-2">
            <div className="flex items-start w-full border-t-1 border-border">
              <h6 className="text-sm sm:text-base text-neutral-800 font-semibold pt-6">
                Additional Feedback
              </h6>
            </div>
            <Textarea
              className="border-border min-h-40 bg-highest"
              value={text}
              onChange={(e) => {
                if (e.target.value.length <= maxLength) setText(e.target.value)
              }}
              placeholder="What worked well? What could be better?"
              aria-label={ariaLabels?.textArea ?? 'Review text area'}
              disabled={isDisabled}
            />

            <div className="flex w-full justify-end">
              <div className="text-xs text-neutral-500 tabular-nums">
                {remaining} characters remaining
              </div>
            </div>
          </div>

          <div className="flex justify-between w-full items-end w-full p-4">
            {error ? (
              <div role="alert" className="text-sm text-destructive">
                {error}
              </div>
            ) : success ? (
              <div className="text-sm text-success">Thanks! Your review has been submitted.</div>
            ) : <div></div>}

            <div className="flex items-center justify-end">
              <Button
                type="button"
                className={cn(buttonColor, buttonHover, 'raised-off-page text-white')}
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
        <>
          <div className="flex items-center gap-2 p-4">
            <SmileyIcon size={28} className={cn(accentClassName)} />
            <h4 className="text-xl text">Thanks for submitting a review!</h4>
          </div>
        </>
      )}
    </div>
  )
}
