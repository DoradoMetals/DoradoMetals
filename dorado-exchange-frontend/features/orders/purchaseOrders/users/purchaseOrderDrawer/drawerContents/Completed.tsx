import { PurchaseOrderDrawerContentProps } from '@/types/purchase-order'
import { useUser } from '@/features/auth/authClient'
import { ReviewBlock } from '@/shared/ui/ReviewInput'
import { useCreateReview } from '@/features/reviews/queries'
import { useSetReviewCreated } from '@/features/orders/purchaseOrders/users/queries'

export default function CompletedPurchaseOrder({ order }: PurchaseOrderDrawerContentProps) {
  const { user } = useUser()
  const createReview = useCreateReview()
  const setCreated = useSetReviewCreated()

  return (
    <>
      <div className="flex flex-col w-full h-full">
        <div className="flex w-full mb-4">
          <div className="flex flex-col">
            
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
