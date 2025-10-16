import { Button } from '@/components/ui/button'
import { useState } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useCreateReview } from '@/lib/queries/useReviews'
import { SalesOrderDrawerContentProps, statusConfig } from '@/types/sales-orders'
import { useUser } from '@/lib/authClient'
import { Rating, RatingButton } from '@/components/ui/rating'

export default function CompletedSalesOrder({ order }: SalesOrderDrawerContentProps) {
  const { user } = useUser()
  const createReview = useCreateReview()
  const [review, setReview] = useState('')
  const [rating, setRating] = useState(0)

  const config = statusConfig[order.sales_order_status]

  return (
    <>
      <div className="flex flex-col w-full h-full">
        <div className="flex w-full mb-4">
          <div className="flex flex-col">
            <div className="text-xl text neutral-800">Order Complete!</div>

            <div className="text-sm text-neutral-600 text-left mb-4">
              Your order has been completed! If you need any additional help with your order, please
              call us. Otherwise, please feel free to leave a review of your experience below!
            </div>
            <div className="flex flex-col gap-0 w-full">
              <Textarea
                className="input-floating-label-form min-h-50"
                value={review}
                onChange={(e) => setReview(e.target.value)}
                disabled={order.review_created}
              />
              <div className="flex flex-col items-center gap-3">
                <Rating value={rating} onValueChange={setRating}>
                  {Array.from({ length: 5 }).map((_, index) => (
                    <RatingButton className="text-primary" key={index} size={32} />
                  ))}
                </Rating>
              </div>
              <Button
                variant="link"
                className={cn(config.text_color, 'p-0 ml-auto font-normal')}
                onClick={() => {
                  createReview.mutate({
                    review_text: review,
                    rating: rating,
                    created_by: user?.name ?? '',
                    updated_by: user?.name ?? '',
                    name: user?.name ?? '',
                    hidden: false,
                  })
                }}
                disabled={createReview.isPending || review === '' || order.review_created}
              >
                {createReview.isPending ? 'Loading...' : 'Upload Review'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
