import PriceNumberFlow from '@/components/custom/products/PriceNumberFlow'
import { SalesOrderItem } from '@/types/sales-orders'
import Image from 'next/image'

export default function DisplaySalesOrderProducts({ items }: { items: SalesOrderItem[] }) {
  return (
    <div className="w-full">
      {items.map((item, index) => (
        <div
          key={item?.product?.product_name}
          className={`flex items-center w-full gap-2 py-2 ${
            index !== items.length - 1 ? 'border-b border-border' : 'border-none'
          }`}
        >
          <Image
            src={item.product?.image_front ?? ''}
            width={110}
            height={110}
            className="pointer-events-none cursor-auto object-contain focus:outline-none drop-shadow-lg"
            alt={item?.product?.product_name ?? ''}
          />

          <div className="flex flex-col">
            <div className="flex flex-col gap-1 items-start w-full mt-2">
              <div className="text-neutral-800 text-base">{item?.product?.product_name}</div>
              <div className="text-neutral-600 text-sm">{item?.product?.mint_name}</div>
            </div>

            <div className="flex justify-between items-center mt-3">
              <div className="flex flex-col items-start">
                <div className="text-xs text-neutral-700">Quantity</div>
                <div className="text-lg text-neutral-800">{item?.quantity}</div>
              </div>

              <div className="flex flex-col items-start">
                <div className="text-xs text-neutral-700">Price</div>
                <div className="text-lg text-neutral-800">
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
