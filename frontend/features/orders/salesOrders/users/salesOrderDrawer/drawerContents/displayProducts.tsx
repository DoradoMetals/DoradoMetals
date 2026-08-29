import PriceNumberFlow from '@/shared/ui/PriceNumberFlow'
import Image from 'next/image'

// PRESENTATIONAL (ruling 14): props in, DOM out - no hooks, no fetches, so it
// renders in isolation. It took SalesOrderItem[] - the composed line with its
// embedded product - until the order wire slimmed; an orders.items row
// carries bullion_id and nothing else about the product, so the CONTAINER
// resolves the catalogue and hands down already-named lines.
export type SalesOrderLine = {
  id: string
  name: string | null
  mint_name: string | null
  image_front: string | null
  quantity: number | null
  price: number | null
}

export default function DisplaySalesOrderProducts({ items }: { items: SalesOrderLine[] }) {
  return (
    <div className="w-full">
      {items.map((item, index) => (
        <div
          key={item.id}
          className={`flex items-center w-full justify-between gap-2 py-2 ${
            index !== items.length - 1 ? 'border-b border-border' : 'border-none'
          }`}
        >
          <div className="relative w-25 h-25 md:h-30 md:w-30 lg:h-35 lg:w-35 aspect-square -ml-4">
            <Image
              src={item.image_front || ''}
              fill
              className="object-contain"
              alt={item.name || ''}
              sizes="(max-width: 640px) 100vw, 33vw"
            />
          </div>

          <div className="flex flex-col lg:mx-auto w-full">
            <div className="flex flex-col gap-1 items-start w-full mt-2">
              <strong>{item.name}</strong>
              <small>{item.mint_name}</small>
            </div>

            <div className="flex justify-between items-center mt-3">
              <div className="flex flex-col items-start">
                <small>Quantity</small>
                <strong className="stat-sm">{item.quantity}</strong>
              </div>

              <div className="flex flex-col items-end">
                <small>Price</small>
                <strong className="stat-sm">
                  <PriceNumberFlow value={(item.price ?? 0) * (item.quantity ?? 0)} />
                </strong>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
