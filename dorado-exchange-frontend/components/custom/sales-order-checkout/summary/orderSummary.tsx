import { Button } from '@/components/ui/button'
import { useSpotPrices } from '@/lib/queries/useSpotPrices'
import { cartStore } from '@/store/cartStore'
import { paymentOptions, SalesOrderTotals } from '@/types/sales-orders'
import getProductPrice from '@/utils/products/getProductPrice'
import { Minus, Plus, Trash2 } from 'lucide-react'
import Image from 'next/image'
import PriceNumberFlow from '../../products/PriceNumberFlow'
import NumberFlow from '@number-flow/react'
import { useSalesOrderCheckoutStore } from '@/store/salesOrderCheckoutStore'
import { QuestionIcon } from '@phosphor-icons/react'
import { useRouter } from 'next/navigation'

export default function OrderSummary({ orderPrices }: { orderPrices: SalesOrderTotals }) {
  const { items, addItem, removeOne, removeAll } = cartStore()
  const { data } = useSalesOrderCheckoutStore()
  const { data: spotPrices = [] } = useSpotPrices()
  const router = useRouter()

  const itemContent = (
    <div className="w-full flex-col">
      <div className="section-label text-primary mb-4">Items</div>

      <div className="flex-col gap-10">
        {items.map((item, index) => {
          const spot = spotPrices.find((s) => s.type === item.metal_type)
          const price = getProductPrice(item, spot)
          const quantity = item.quantity ?? 1

          return (
            <div
              key={item.product_name}
              className={`flex items-center justify-between w-full gap-4 pb-4 ${
                index !== items.length - 1 ? 'border-b border-neutral-300' : 'border-none'
              }`}
            >
              <div className="flex-shrink-0 -ml-4">
                <Image
                  src={item.image_front}
                  width={110}
                  height={110}
                  className="pointer-events-none cursor-auto object-contain focus:outline-none drop-shadow-lg"
                  alt={item.product_name}
                />
              </div>

              <div className="flex flex-col flex-grow min-w-0">
                <div className="flex justify-between items-start w-full mt-2">
                  <div className="flex flex-col">
                    <div className="text-base text-neutral-700">{item.product_name}</div>
                    <div className="text-xs text-neutral-500">{item.mint_name}</div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="hover:bg-card p-0 pb-2"
                    onClick={() => removeAll(item)}
                  >
                    <Trash2 size={16} className="text-neutral-500" />
                  </Button>
                </div>

                <div className="flex justify-between items-center mt-3">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="hover:bg-card p-1"
                      onClick={() => removeOne(item)}
                    >
                      <Minus size={16} />
                    </Button>
                    <NumberFlow
                      value={quantity}
                      transformTiming={{ duration: 750, easing: 'ease-in' }}
                      spinTiming={{ duration: 150, easing: 'ease-out' }}
                      opacityTiming={{ duration: 350, easing: 'ease-out' }}
                      className="text-base text-neutral-700"
                      trend={0}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="hover:bg-card p-1"
                      onClick={() => addItem(item)}
                    >
                      <Plus size={16} />
                    </Button>
                  </div>
                  <div className="text-neutral-800 text-base">
                    <PriceNumberFlow value={price * quantity} />
                  </div>
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
      <div className="separator-inset" />
      <div className="section-label text-primary my-4">Payment Details</div>

      <div className="w-full flex items-center justify-between">
        <div className="text-sm text-neutral-700">Shipping</div>
        <div className="text-base text-neutral-800">
          <PriceNumberFlow value={orderPrices.shippingCharge} />
        </div>
      </div>

      {orderPrices.appliedFunds > 0 && (
        <div className="w-full flex items-center justify-between">
          <div className="text-sm text-neutral-700">Dorado Funds Applied</div>
          <div className="text-base text-neutral-800">
            <PriceNumberFlow value={orderPrices.appliedFunds} />
          </div>
        </div>
      )}
      {orderPrices.subjectToChargesAmount > 0 && (
        <div className="w-full flex items-center justify-between">
          <div className="text-sm text-neutral-700">
            {' '}
            {orderPrices.appliedFunds > 0 ? 'Amount Remaining' : 'Items'}
          </div>
          <div className="text-base text-neutral-800">
            -<PriceNumberFlow value={orderPrices.subjectToChargesAmount} />
          </div>
        </div>
      )}

      {orderPrices.surchargeAmount > 0 && (
        <div className="w-full flex items-center justify-between">
          <div className="text-sm text-neutral-700">
            {`${
              paymentOptions.find((option) => option.method === data.payment_method)?.label
            } Surcharge `}
            {`(${
              paymentOptions.find((option) => option.method === data.payment_method)
                ?.surcharge_label
            })`}
          </div>
          <div className="text-base text-neutral-800">
            <PriceNumberFlow value={orderPrices.surchargeAmount} />
          </div>
        </div>
      )}

      {orderPrices.salesTax > 0 && (
        <div className="w-full flex items-center justify-between">
          <div className="flex items-center gap-1">
            <div className="text-sm text-neutral-700">Sales Tax</div>
            <Button variant="ghost" className="h-4 p-0" onClick={() => router.push('/sales-tax')}>
              <QuestionIcon size={16} className="text-neutral-500" />
            </Button>
          </div>
          <div className="text-base text-neutral-800">
            <PriceNumberFlow value={orderPrices.salesTax} />
          </div>
        </div>
      )}

      <div className="pt-2">
        <div className="separator-inset" />

        <div className="w-full flex items-center justify-between pt-2">
          <div className="text-base text-primary">Order Total</div>
          <div className="text-lg text-neutral-900">
            <PriceNumberFlow value={orderPrices.postChargesAmount} />
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs text-neutral-600 uppercase tracking-widest">Order Summary:</div>
      <div className="flex w-full bg-card raised-off-page rounded-lg p-4">
        <div className="flex flex-col w-full gap-3">
          {itemContent}
          {paymentContent}
        </div>
      </div>
    </div>
  )
}
