import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'
import { SalesOrderItem } from '@/features/orders/salesOrders/types'
import Image from 'next/image'

export default function DisplaySalesOrderProducts({ items }: { items: SalesOrderItem[] }) {
  return (
    <div className="w-full">
      {items.map((item, index) => (
        <div
          key={item?.product?.product_name}
          className={`flex items-center w-full justify-between gap-2 py-2 ${
            index !== items.length - 1 ? 'border-b border-border' : 'border-none'
          }`}
        >
          <div className="relative w-25 h-25 md:h-30 md:w-30 lg:h-35 lg:w-35 aspect-square -ml-4">
            <Image
              src={item.product?.image_front || ''}
              fill
              className="object-contain"
              alt={item.product?.product_name || ''}
              sizes="(max-width: 640px) 100vw, 33vw"
            />
          </div>

          <div className="flex flex-col lg:mx-auto w-full">
            <div className="flex flex-col gap-1 items-start w-full mt-2">
              <div className="text-base text-neutral-800">
                {item?.product?.product_name}
              </div>
              <div className="text-sm sm:text-base text-neutral-600">
                {item?.product?.mint_name}
              </div>
            </div>

            <div className="flex justify-between items-center mt-3">
              <div className="flex flex-col items-start">
                <div className="text-xs  text-neutral-700">Quantity</div>
                <div className="text-base sm:text-lg text-neutral-800">
                  {item?.quantity}
                </div>
              </div>

              <div className="flex flex-col items-end">
                <div className="text-xs text-neutral-700">Price</div>
                <div className="text-base sm:text-lg text-neutral-800">
                  <PriceNumberFlow value={(item?.price ?? 0) * item?.quantity} />
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
