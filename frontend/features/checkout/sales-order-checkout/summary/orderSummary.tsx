import { Button } from '@/shared/ui/base/button'
import { cartStore } from '@/shared/store/cartStore'
import { paymentOptions } from '@/features/orders/salesOrders/types'
import { Minus, Plus, Trash2 } from 'lucide-react'
import Image from 'next/image'
import NumberFlow from '@number-flow/react'
import { useSalesOrderCheckoutStore } from '@/shared/store/salesOrderCheckoutStore'
import { QuestionIcon } from '@phosphor-icons/react'
import { useRouter } from 'next/navigation'
import type { SalesOrderQuote } from '@dorado/contracts'
import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'
import { Separator } from '@/shared/ui/base/separator'
import { DetailRow } from '@/shared/ui/DetailRow'

// orderPrices is the server's quote, absent until the first one lands - the
// summary renders zeros in the meantime, never a client-computed price.
export default function OrderSummary({ orderPrices }: { orderPrices?: SalesOrderQuote }) {
  const { items, addItem, removeOne, removeAll } = cartStore()
  const { data } = useSalesOrderCheckoutStore()
  const router = useRouter()

  const {
    shipping_charge = 0,
    pre_charges_amount = 0,
    subject_to_charges_amount = 0,
    post_charges_amount = 0,
    charges_amount = 0,
    sales_tax = 0,
  } = orderPrices ?? {}

  const itemContent = (
    <div className="w-full flex-col">
      <p className="eyebrow mb-4">Items</p>

      <div className="flex-col gap-10">
        {items.map((item, index) => {
          // The quote prices one line per cart item, matched by product id.
          const line = orderPrices?.items.find((l) => l.id === item.id)
          const quantity = item.quantity ?? 1

          return (
            <div
              key={item.name}
              className={`flex items-center justify-between w-full gap-4 pb-4 ${
                index !== items.length - 1 ? 'border-b border-border' : 'border-none'
              }`}
            >
              <div className="flex-shrink-0 -ml-4">
                <Image
                  src={item.image_front}
                  width={110}
                  height={110}
                  className="pointer-events-none cursor-auto object-contain focus:outline-none"
                  alt={item.name}
                />
              </div>

              <div className="flex flex-col flex-grow min-w-0">
                <div className="flex justify-between items-start w-full mt-2">
                  <div className="flex flex-col">
                    <strong>{item.name}</strong>
                    <small>{item.mint_name}</small>
                  </div>
                  <Button variant="tertiary" size="iconSm" onClick={() => removeAll(item)}>
                    <Trash2 size={16} />
                  </Button>
                </div>

                <div className="flex justify-between items-center mt-3">
                  <div className="flex items-center gap-2">
                    <Button variant="tertiary" size="iconSm" onClick={() => removeOne(item)}>
                      <Minus size={16} />
                    </Button>
                    <NumberFlow
                      value={quantity}
                      transformTiming={{ duration: 750, easing: 'ease-in' }}
                      spinTiming={{ duration: 150, easing: 'ease-out' }}
                      opacityTiming={{ duration: 350, easing: 'ease-out' }}
                      trend={0}
                    />
                    <Button variant="tertiary" size="iconSm" onClick={() => addItem(item)}>
                      <Plus size={16} />
                    </Button>
                  </div>
                  <strong>
                    <PriceNumberFlow value={line?.line_total ?? 0} />
                  </strong>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  const paymentContent = (
    <div className="w-full flex-col">
      <Separator />
      <p className="eyebrow my-4">Payment Details</p>

      <DetailRow label="Shipping">
        <PriceNumberFlow value={shipping_charge} />
      </DetailRow>

      {pre_charges_amount > 0 && (
        <DetailRow label="Dorado Funds Applied">
          <PriceNumberFlow value={pre_charges_amount} />
        </DetailRow>
      )}
      {subject_to_charges_amount > 0 && (
        <DetailRow label={pre_charges_amount > 0 ? 'Amount Remaining' : 'Items'}>
          -<PriceNumberFlow value={subject_to_charges_amount} />
        </DetailRow>
      )}

      {charges_amount > 0 && (
        <div className="w-full flex items-center justify-between">
          <p>
            {`${
              paymentOptions.find((option) => option.method === data.payment_method)?.label
            } Surcharge `}
            {`(${
              paymentOptions.find((option) => option.method === data.payment_method)
                ?.surcharge_label
            })`}
          </p>
          <strong>
            <PriceNumberFlow value={charges_amount} />
          </strong>
        </div>
      )}

      {sales_tax > 0 && (
        <div className="w-full flex items-center justify-between">
          <div className="flex items-center gap-1">
            <p>Sales Tax</p>
            <Button
              variant="tertiary"
              size="iconXs"
              className="size-4"
              onClick={() => router.push('/sales-tax')}
            >
              <QuestionIcon size={16} />
            </Button>
          </div>
          <strong>
            <PriceNumberFlow value={sales_tax} />
          </strong>
        </div>
      )}

      <div className="pt-2">
        <Separator />

        <DetailRow label="Order Total" variant="total" className="pt-2">
          <PriceNumberFlow value={post_charges_amount} />
        </DetailRow>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col gap-2">
      <p className="eyebrow">Order Summary:</p>
      <div className="flex w-full bg-card rounded-lg p-4">
        <div className="flex flex-col w-full gap-3">
          {itemContent}
          {paymentContent}
        </div>
      </div>
    </div>
  )
}
