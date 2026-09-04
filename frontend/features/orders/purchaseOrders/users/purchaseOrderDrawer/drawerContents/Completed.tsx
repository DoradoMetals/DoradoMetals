import { PurchaseOrderDrawerContentProps } from '@/features/orders/purchaseOrders/types'
import { useUser } from '@/features/auth/authClient'
import { ReviewBlock } from '@/shared/ui/ReviewInput'
import { useCreateReview } from '@/features/reviews/queries'
import { useCreateOrderReview } from '@dorado/client'

export default function CompletedPurchaseOrder({ view }: PurchaseOrderDrawerContentProps) {
  const { order } = view

  const { user } = useUser()
  const createReview = useCreateReview()
  const setCreated = useCreateOrderReview()

  return (
    <>
      <div className="flex flex-col w-full h-full">
        <div className="flex w-full mb-4">
          <div className="flex flex-col">
            
            <ReviewBlock
              title="How did we do?"
              defaultText=""
              defaultRating={0}
              reviewSubmitted={order.review_created ?? undefined}
              maxLength={600}
              submitLabel="Upload Review"
              onSubmit={async ({ text, rating }) => {
                await createReview.mutateAsync({
                  review_text: text,
                  rating,
                  name: user?.name ?? '',
                  hidden: false,
                })

                await setCreated.mutateAsync({ id: order.id, direction: 'purchase' })
              }}
            />
          </div>
        </div>
      </div>
    </>
  )
}
