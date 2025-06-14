import { Button } from '@/components/ui/button'
import { useState } from 'react'
import PriceNumberFlow from '@/components/custom/products/PriceNumberFlow'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useCreateReview } from '@/lib/queries/useReviews'
import { SalesOrderDrawerContentProps, statusConfig } from '@/types/sales-orders'

export default function CompletedSalesOrder({ order }: SalesOrderDrawerContentProps) {
  const createReview = useCreateReview()
  const [review, setReview] = useState('')

  const config = statusConfig[order.sales_order_status]

  return (
    <>
      <div className="flex flex-col w-full h-full">
        <div className="flex w-full mb-4">
          <div className="flex flex-col">
            <div className="text-xl text neutral-800">Order Complete!</div>

            <div className="text-sm text-neutral-600 text-left mb-4">
              Your order has been completed, and <PriceNumberFlow value={order.total_price ?? 0} />{' '}
              has been sent via your method of choice! If you need any help with this order, please
              call us. Otherwise, please feel free to leave a review of your experience below!
            </div>
            <div className="flex flex-col gap-0 w-full">
              <Textarea
                className="input-floating-label-form min-h-50"
                value={review}
                onChange={(e) => setReview(e.target.value)}
                disabled={order.review_created}
              />
              <Button
                variant="link"
                className={cn(config.text_color, 'p-0 ml-auto font-normal')}
                // onClick={() => {
                //   createReview.mutate({ review: review, order: order })
                // }}
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
