import { Button, Divider } from '@dorado/components'
import { CircleHelp, Minus, Plus, Trash2 } from '@dorado/icons'
import { useBasket } from '@/features/checkout/items/queries'
import { useCheckoutItemActions } from '@/features/checkout/items/queries'
import { useDecoratedLines } from '@/features/checkout/items/flair'
import { usePaymentMethods } from '@dorado/client'
import Image from 'next/image'
import NumberFlow from '@number-flow/react'
import { useRouter } from 'next/navigation'
import type { CheckoutView, SalesOrderQuote } from "@dorado/contracts";
import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'
import { DetailRow } from '@/shared/ui/DetailRow'

// orderPrices is the server's quote, absent until the first one lands - the
// summary renders zeros in the meantime, never a client-computed price.
export default function OrderSummary({
  row,
  orderPrices,
}: {
  row?: CheckoutView
  orderPrices?: SalesOrderQuote
}) {
  const { data: saleMethods = [] } = usePaymentMethods('sale')
  const items = useBasket('sale')
  const { addItem, removeOne, removeAll } = useCheckoutItemActions()
  const rows = useDecoratedLines(items)
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
        {rows.map(({ line, index, name, image_front, mint_name }) => {
          // The quote prices one line per basket line, matched by product id.
          const quoted = orderPrices?.items.find((l) => l.id === line.bullion_id)

          return (
            <div
              key={line.id}
              className={`flex items-center justify-between w-full gap-4 pb-4 ${
                index !== rows.length - 1 ? 'border-b border-border' : 'border-none'
              }`}
            >
              {image_front && (
                <div className="flex-shrink-0 -ml-4">
                  <Image
                    src={image_front}
                    width={110}
                    height={110}
                    className="pointer-events-none cursor-auto object-contain focus:outline-none"
                    alt={name}
                  />
                </div>
              )}

              <div className="flex flex-col flex-grow min-w-0">
                <div className="flex justify-between items-start w-full mt-2">
                  <div className="flex flex-col">
                    <strong>{name}</strong>
                    <small>{mint_name}</small>
                  </div>
                  <Button variant="tertiary" size="iconSm" onClick={() => removeAll('sale', line)}>
                    <Trash2 size={16} />
                  </Button>
                </div>

                <div className="flex justify-between items-center mt-3">
                  <div className="flex items-center gap-2">
                    <Button variant="tertiary" size="iconSm" onClick={() => removeOne('sale', line)}>
                      <Minus size={16} />
                    </Button>
                    <NumberFlow
                      value={line.quantity ?? 1}
                      transformTiming={{ duration: 750, easing: 'ease-in' }}
                      spinTiming={{ duration: 150, easing: 'ease-out' }}
                      opacityTiming={{ duration: 350, easing: 'ease-out' }}
                      trend={0}
                      className="tabular-nums"
                    />
                    <Button
                      variant="tertiary"
                      size="iconSm"
                      onClick={() => addItem('sale', { ...line, quantity: 1 })}
                    >
                      <Plus size={16} />
                    </Button>
                  </div>
                  <strong>
                    <PriceNumberFlow value={quoted?.line_total ?? 0} className="tabular-nums" />
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
      <Divider />
      <p className="eyebrow my-4">Payment Details</p>

      <DetailRow label="Shipping">
        <PriceNumberFlow value={shipping_charge} className="tabular-nums" />
      </DetailRow>

      {pre_charges_amount > 0 && (
        <DetailRow label="Dorado Funds Applied">
          <PriceNumberFlow value={pre_charges_amount} className="tabular-nums" />
        </DetailRow>
      )}
      {subject_to_charges_amount > 0 && (
        <DetailRow label={pre_charges_amount > 0 ? 'Amount Remaining' : 'Items'}>
          -<PriceNumberFlow value={subject_to_charges_amount} className="tabular-nums" />
        </DetailRow>
      )}

      {charges_amount > 0 && (
        <div className="w-full flex items-center justify-between">
          <p>
            {/* The method is the ROW's, by id - not a store field holding a
                TYPE the browser looked up by string. */}
            {`${saleMethods.find((m) => m.id === row?.payment_method_id)?.label ?? 'Card'} Surcharge `}
            {`(${saleMethods.find((m) => m.id === row?.payment_method_id)?.surcharge_label ?? ''})`}
          </p>
          <strong>
            <PriceNumberFlow value={charges_amount} className="tabular-nums" />
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
              <CircleHelp size={16} />
            </Button>
          </div>
          <strong>
            <PriceNumberFlow value={sales_tax} className="tabular-nums" />
          </strong>
        </div>
      )}

      <div className="pt-2">
        <Divider />

        <DetailRow label="Order Total" variant="total" className="pt-2">
          <PriceNumberFlow value={post_charges_amount} className="tabular-nums" />
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
