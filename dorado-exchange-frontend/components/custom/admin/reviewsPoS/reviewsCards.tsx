import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ReviewCard, ReviewStats } from '@/types/reviews'
import { Rating, RatingButton } from '@/components/ui/rating'
import getPrimaryIconStroke from '@/utils/getPrimaryIconStroke'
import { EyeSlashIcon, StarIcon } from '@phosphor-icons/react'

export default function ReviewsCards({
  selectedCard,
  setSelectedCard,
  stats,
}: {
  selectedCard: ReviewCard
  setSelectedCard: (card: ReviewCard | null) => void
  stats: ReviewStats
}) {
  const { totalReviews, averageRating, hiddenCount, publicCount, starCounts } = stats

  const currentStar =
    typeof selectedCard === 'string' && /^\d/.test(selectedCard) ? Number(selectedCard[0]) : 0

  const handleStarChange = (val: number) => {
    if (val === currentStar) return setSelectedCard(null)
    setSelectedCard(`${val} Star` as ReviewCard)
  }

  const isAllSelected = selectedCard === null
  const isHiddenSelected = selectedCard === 'Hidden'
  const isAnyStarSelected = currentStar > 0

  return (
    <div className="w-full">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 w-full">
        <Button
          type="button"
          onClick={() => setSelectedCard(null)}
          className={cn(
            'cursor-pointer bg-background rounded-lg p-3 sm:p-4 raised-off-page w-full h-auto hover:bg-card justify-start',
            isAllSelected && 'bg-card'
          )}
          aria-label="Reset review filters"
          title="Reset filters"
        >
          <div className="flex items-center justify-between w-full">
            <StarIcon className="text-primary hidden md:block" size={64} />
            <StarIcon className="text-primary md:hidden" size={48} />

            <div className="flex items-center gap-3">
              <div className="flex flex-col items-start">
                <div className="text-lg sm:text-2xl text-neutral-800">
                  {averageRating?.toFixed?.(2) ?? averageRating}
                </div>
                <div className="text-xs sm:text-sm text-neutral-600">Average Rating</div>
              </div>
            </div>
          </div>
        </Button>

        <Button
          type="button"
          onClick={() => setSelectedCard('Hidden')}
          className={cn(
            'cursor-pointer bg-background rounded-lg p-3 sm:p-4 raised-off-page w-full h-auto hover:bg-card justify-start',
            isHiddenSelected && 'bg-card'
          )}
        >
          <div className="flex items-center justify-between w-full">
            <EyeSlashIcon className="text-primary hidden md:block" size={64} />
            <EyeSlashIcon className="text-primary md:hidden" size={48} />

            <div className="flex items-center gap-3">
              <div className="flex flex-col items-start">
                <div className="text-lg sm:text-2xl text-neutral-800">{hiddenCount}</div>
                <div className="text-xs sm:text-sm text-neutral-600">Hidden</div>
              </div>
            </div>
          </div>
        </Button>

        <div
          className={cn(
            'flex cursor-pointer bg-background rounded-lg p-3 sm:p-4 raised-off-page w-full h-auto hover:bg-card justify-start items-center',
            isAnyStarSelected && 'bg-card'
          )}
        >
          <div className="flex items-center justify-between w-full">
            <Rating value={currentStar} onValueChange={handleStarChange}>
              {Array.from({ length: 5 }).map((_, i) => (
                <RatingButton key={i} size={28} className="transition-transform text-primary" />
              ))}
            </Rating>

            <div className="flex items-center gap-3">
              <div className="flex flex-col items-start">
                <div className="text-lg sm:text-2xl text-neutral-800">
                  {starCounts[currentStar as 1 | 2 | 3 | 4 | 5]}
                </div>
                <div className="text-xs sm:text-sm text-neutral-600">
                  {isAnyStarSelected ? `${currentStar} Star${currentStar === 1 ? '' : 's'}` : 'All'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
