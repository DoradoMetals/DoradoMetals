import { PurchaseOrderDrawerContentProps, statusConfig } from '@/types/purchase-order'
import { cn } from '@/lib/utils'
import { useCreateReview } from '@/lib/queries/useReviews'
import { useUser } from '@/lib/authClient'
import { ReviewBlock } from '@/components/ui/review'
import { useSetReviewCreated } from '@/lib/queries/usePurchaseOrders'

export default function CompletedPurchaseOrder({ order }: PurchaseOrderDrawerContentProps) {
  const { user } = useUser()
  const createReview = useCreateReview()
  const setCreated = useSetReviewCreated()

  const config = statusConfig[order.purchase_order_status]

  return (
    <>
      <div className="flex flex-col w-full h-full">
        <div className="flex w-full mb-4">
          <div className="flex flex-col">
            <div className="text-xl text neutral-800">Order Complete!</div>

            <div className="text-sm text-neutral-600 text-left mb-4">
              Your order has been completed! If you need any additional help with your order, please
              contact our support team. Otherwise, please feel free to leave a review of your
              experience below!
            </div>
            <ReviewBlock
              title="How did we do?"
              defaultText=""
              defaultRating={0}
              reviewSubmitted={order.review_created}
              maxLength={600}
              headerColor={config.background_color}
              buttonColor={config.background_color}
              buttonHover={config.hover_background_color}
              accentClassName={cn(config.text_color)}
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
                  purchase_order: order,
                })
              }}
            />
          </div>
        </div>
      </div>
    </>
  )
}
