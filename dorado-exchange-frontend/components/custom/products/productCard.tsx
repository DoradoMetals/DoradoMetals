'use client'

import Image from 'next/image'
import { ozOptions, Product } from '@/types/product'
import { Button } from '@/components/ui/button'
import { Equal, Minus, Plus, Scale, X } from 'lucide-react'
import NumberFlow from '@number-flow/react'
import {
  Carousel,
  CarouselContent,
  CarouselNavigation,
  CarouselIndicator,
  CarouselItem,
} from '@/components/ui/carousel'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { FloatingButton, FloatingButtonItem } from '@/components/ui/floating-button'

import { useState } from 'react'
import { cartStore } from '@/store/cartStore'
import PriceNumberFlow from './PriceNumberFlow'
import getProductPrice from '@/utils/getProductPrice'
import { useSpotPrices } from '@/lib/queries/useSpotPrices'
import { ProductShadow } from './productShadow'
import getProductBidPrice from '@/utils/getProductBidPrice'
import { PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Popover } from '@radix-ui/react-popover'

type ProductCardProps = {
  product: Product
  variants: Product[]
}

export default function ProductCard({ product, variants }: ProductCardProps) {
  const [selectedProduct, setSelectedProduct] = useState<Product>(product)
  const [open, setOpen] = useState(false)

  const items = cartStore((state) => state.items)
  const addItem = cartStore((state) => state.addItem)
  const removeOne = cartStore((state) => state.removeOne)

  const cartItem = items.find((item) => item.product_name === selectedProduct.product_name)
  const quantity = cartItem?.quantity ?? 0
  const { data: spotPrices = [] } = useSpotPrices()

  const spot = spotPrices.find((s) => s.type === product.metal_type)
  const price = getProductPrice(selectedProduct, spot)
  const buybackPrice = getProductBidPrice(selectedProduct, spot)
  const weightOptions = ozOptions[product.variant_group]

  return (
    <div className="space-y-6 h-auto w-full sm:w-[22rem] max-w-[22rem] group relative flex-col items-center mx-4">
      <div className="h-1/5 rounded-lg">
        <Carousel className="">
          <CarouselContent>
            <CarouselItem className="pb-4">
              <div className="flex relative aspect-square items-center justify-center">
                <ProductShadow
                  productType={selectedProduct.product_type}
                  offset={selectedProduct.shadow_offset}
                />
                <Image
                  src={selectedProduct.image_front}
                  width={500}
                  height={500}
                  className="relative z-10 pointer-events-none cursor-auto w-full h-full object-contain focus:outline-none drop-shadow-lg"
                  alt="thumbnail"
                />
              </div>
            </CarouselItem>
            <CarouselItem className="pb-4">
              <div className="flex relative aspect-square items-center justify-center">
                <ProductShadow
                  productType={selectedProduct.product_type}
                  offset={selectedProduct.shadow_offset}
                />
                <Image
                  src={selectedProduct.image_back}
                  width={500}
                  height={500}
                  className="relative z-10 pointer-events-none cursor-auto w-full h-full object-contain focus:outline-none drop-shadow-lg"
                  alt="thumbnail"
                />
              </div>
            </CarouselItem>
          </CarouselContent>
          {variants.length > 0 && weightOptions && (
            <div className="absolute -bottom-7 right-3 z-30">
              <RadioGroup
                value={selectedProduct.product_name}
                onValueChange={(val) => {
                  const variant = variants.find((v) => v.product_name === val)
                  if (variant) setSelectedProduct(variant)
                }}
              >
                <FloatingButton
                  triggerContent={
                    <Button
                      variant="ghost"
                      className="flex items-center h-8 w-8 rounded-full items-center justify-center z-10 text-xs bg-secondary text-white hover:bg-secondary hover:text-white hover:shadow-sm"
                    >
                      <Scale size={16} />
                    </Button>
                  }
                >
                  {weightOptions.map((option) => (
                    <FloatingButtonItem key={option.name}>
                      <label
                        htmlFor={option.value}
                        className="h-8 w-10 xs:w-14 sm:w-16 rounded-lg flex items-center justify-center text-xs cursor-pointer border has-[[data-state=checked]]:bg-secondary has-[[data-state=checked]]:border-secondary has-[[data-state=checked]]:text-white text-neutral-900"
                      >
                        <RadioGroupItem
                          id={option.value}
                          value={option.name}
                          className="sr-only"
                          disabled={option.disabled}
                        />
                        {option.value}
                      </label>
                    </FloatingButtonItem>
                  ))}
                </FloatingButton>
              </RadioGroup>
            </div>
          )}
          <CarouselNavigation alwaysShow />
          {variants.length > 0 ? (
            <CarouselIndicator className="pb-6 pt-2" />
          ) : (
            <CarouselIndicator />
          )}
        </Carousel>
      </div>

      <div className="h-4/5 bg-card rounded-lg rounded-b-xl -mt-4 flex flex-col justify-end">
        <div className="pt-6 space-y-8">
          <div className="px-6">
            <div className="flex items-start">
              <div className="flex flex-col mr-auto">
                <div className="text-neutral-700 text-sm lg:text-base">
                  {selectedProduct.product_name}
                </div>
                <div className="text-neutral-500 text-xs lg:text-sm mr-auto">
                  {selectedProduct.mint_name}
                </div>
              </div>

              <div className="flex flex-col items-end gap-1 ml-auto my-0">
                <PriceNumberFlow value={price} />
                <Popover open={open} onOpenChange={setOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      className="text-neutral-700 hover:bg-card hover:text-neutral-700 hover:bg-none-700 p-0 py-0 h-5"
                      onClick={() => setOpen(true)}
                    >
                      <div className="flex items-center justify-center rounded-full h-5 w-5 border-1 border-neutral-700">
                        ?
                      </div>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    side="top"
                    className="p-2 bg-background border-border border-1 shadow-lg w-[14rem]"
                    onOpenAutoFocus={(e) => e.preventDefault()}
                  >
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-col gap-2 border-b-1 border-border pb-2">
                        <div className="flex w-full items-start justify-between pl-8">
                          <div className="text-xs text-neutral-600">{spot?.type} Spot Price</div>
                          <div className="text-sm">
                            <PriceNumberFlow value={spot?.ask_spot ?? 0} />
                          </div>
                        </div>

                        <div className="flex w-full items-start">
                          <X size={16} className="text-neutral-700 px-0" />

                          <div className="flex w-full items-start justify-between pl-4">
                            <div className="text-xs text-neutral-600">Content (oz)</div>
                            <div className="text-sm">{product.content}</div>
                          </div>
                        </div>

                        <div className="flex w-full items-start">
                          <Plus size={16} className="text-neutral-700 px-0" />

                          <div className="flex w-full items-start justify-between pl-4">
                            <div className="text-xs text-neutral-600">Premium</div>
                            <div className="text-sm">
                              <PriceNumberFlow
                                value={product.ask_premium * product.content * spot?.ask_spot!}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex w-full items-start">
                        <Equal size={16} className="text-neutral-700 px-0" />
                        <div className="flex w-full items-start justify-between pl-4">
                          <div className="text-xs text-neutral-600">Total</div>
                          <div className="text-sm text-neutral-900">
                            <PriceNumberFlow value={price} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>

          <div className="bg-secondary w-full rounded-b-lg py-2 text-white">
            {quantity === 0 ? (
              <Button
                variant="ghost"
                className="bg-secondary w-full hover:bg-secondary text-white"
                onClick={() => addItem(selectedProduct)}
              >
                Add to Cart
              </Button>
            ) : (
              <div className="flex items-center justify-center">
                <Button variant="ghost" className="text-white" onClick={() => removeOne(selectedProduct)}>
                  <Minus size={20} />
                </Button>
                <NumberFlow value={quantity} className="text-white text-lg font-semibold" trend={0} />
                <Button variant="ghost" className="text-white" onClick={() => addItem(selectedProduct)}>
                  <Plus size={20} />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// <div className="flex flex-col items-start">
// <div className="text-xs text-neutral-500">Buyback</div>
// <div className="text-neutral-800 text-base lg:text-lg ml-auto">
//   <PriceNumberFlow value={buybackPrice} />
// </div>
// </div>
