import { Button } from '@/components/ui/button'
import { useState } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useCreateReview } from '@/lib/queries/useReviews'
import { SalesOrderDrawerContentProps, statusConfig } from '@/types/sales-orders'
import { useUser } from '@/lib/authClient'
import { Rating, RatingButton } from '@/components/ui/rating'
import { useSetReviewCreated } from '@/lib/queries/useSalesOrders'
import { ReviewBlock } from '@/components/ui/review'

export default function CompletedSalesOrder({ order }: SalesOrderDrawerContentProps) {
  const { user } = useUser()
  const createReview = useCreateReview()
  const setCreated = useSetReviewCreated()

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
            <ReviewBlock
              title="How did we do?"
              defaultText=""
              defaultRating={0}
              reviewSubmitted={order.review_created}
              maxLength={600}
              submitLabel="Upload Review"
              onSubmit={async ({ text, rating }) => {
                await createReview.mutateAsync({
                  review_text: text,
                  rating,
                  created_by: user?.name ?? '',
                  updated_by: user?.name ?? '',
                  name: user?.name ?? '',
                  hidden: false,
                })

                await setCreated.mutateAsync({
                  sales_order: order,
                })
              }}
            />
          </div>
        </div>
      </div>
    </>
  )
}
