'use client'

import Image from 'next/image'
import { ozOptions, Product } from '@/types/product'
import { Button } from '@/components/ui/button'
import { Minus, Plus, Scale } from 'lucide-react'
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

type ProductCardProps = {
  product: Product
  variants: Product[]
}

export default function ProductCard({ product, variants }: ProductCardProps) {
  const [selectedProduct, setSelectedProduct] = useState<Product>(product)

  const items = cartStore((state) => state.items)
  const addItem = cartStore((state) => state.addItem)
  const removeOne = cartStore((state) => state.removeOne)

  const cartItem = items.find((item) => item.product_name === selectedProduct.product_name)
  const quantity = cartItem?.quantity ?? 0
  const { data: spotPrices = [] } = useSpotPrices()

  const spot = spotPrices.find((s) => s.type === product.metal_type)
  const price = getProductPrice(selectedProduct, spot)

  const weightOptions = ozOptions[product.variant_group]

  return (
    <div className="space-y-6 h-auto w-full sm:w-[22rem] max-w-[22rem] group relative flex-col items-center mx-4">
      <div className="h-1/5 rounded-lg bg-background">
        <Carousel className="">
          <CarouselContent>
            <CarouselItem className="pb-4">
              <div className="flex relative aspect-square items-center justify-center overflow-y-hidden">
                <ProductShadow
                  productType={selectedProduct.product_type}
                  offset={selectedProduct.shadow_offset}
                />
                <Image
                  src={selectedProduct.image_front}
                  width={500}
                  height={500}
                  className="relative z-10 pointer-events-none cursor-auto w-full h-auto object-contain focus:outline-none drop-shadow-lg"
                  alt="thumbnail"
                />
              </div>
            </CarouselItem>
            <CarouselItem className="pb-4">
              <div className="flex relative aspect-square items-center justify-center overflow-y-hidden">
                <ProductShadow
                  productType={selectedProduct.product_type}
                  offset={selectedProduct.shadow_offset}
                />
                <Image
                  src={selectedProduct.image_back}
                  width={500}
                  height={500}
                  className="relative z-10 pointer-events-none cursor-auto w-full h-auto object-contain focus:outline-none drop-shadow-lg"
                  alt="thumbnail"
                />
              </div>
            </CarouselItem>
          </CarouselContent>
          {variants.length > 0 && weightOptions && (
            <div className="absolute -bottom-7 right-2.5 z-30">
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
                      className="flex items-center h-8 w-8 rounded-full items-center justify-center z-10 text-xs bg-secondary text-neutral-900"
                    >
                      <Scale size={16} />
                    </Button>
                  }
                >
                  {weightOptions.map((option) => (
                    <FloatingButtonItem key={option.name}>
                      <label
                        htmlFor={option.value}
                        className="h-8 w-10 xs:w-14 sm:w-16 rounded-lg flex items-center justify-center text-xs cursor-pointer border has-[[data-state=checked]]:bg-secondary has-[[data-state=checked]]:border-secondary text-neutral-900"
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
          <div className="flex-col px-6">
            <div className="flex items-center">
              <div className="text-neutral-700 text-base lg:text-lg">
                {selectedProduct.product_name}
              </div>
              <div className="text-neutral-800 text-base lg:text-lg ml-auto">
                <PriceNumberFlow value={price} />
              </div>
            </div>
            <div className="text-neutral-500 text-xs lg:text-sm mr-auto">
              {selectedProduct.mint_name}
            </div>
          </div>
          <div className="bg-secondary w-full rounded-b-lg py-2">
            {quantity === 0 ? (
              <Button
                variant="ghost"
                className="bg-secondary w-full hover:bg-secondary"
                onClick={() => addItem(selectedProduct)}
              >
                Add to Cart
              </Button>
            ) : (
              <div className="flex items-center justify-center">
                <Button variant="ghost" className="" onClick={() => removeOne(selectedProduct)}>
                  <Minus size={20} />
                </Button>
                <NumberFlow value={quantity} className="title-text font-semibold" trend={0} />
                <Button variant="ghost" className="" onClick={() => addItem(selectedProduct)}>
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
