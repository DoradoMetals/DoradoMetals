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
    <div className="bg-card h-auto w-full sm:w-[22rem] max-w-[22rem] group relative rounded-lg border-t-2 border-primary shadow-sm focus-within:shadow-2xl focus-within:shadow-primary/[0.1] hover:shadow-2xl hover:shadow-primary/[0.1] transition-all duration-300">
      <div className="flex ml-auto m-0 p-0">
        <div className="ml-auto">
          {variants.length > 0 && weightOptions && (
            <div className="absolute top-.5 right-1 z-30">
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
                      className="flex items-center h-8 w-8 rounded-full items-center justify-center z-10 text-xs text-neutral-700 border border-neutral-700 bg-card hover:bg-card"
                    >
                      <Scale size={16} />
                    </Button>
                  }
                >
                  {weightOptions.map((option) => (
                    <FloatingButtonItem key={option.name}>
                      <label
                        htmlFor={option.value}
                        className="h-8 w-8 xs:w-12 sm:w-14 md:w-16 rounded-lg flex items-center justify-center text-xs cursor-pointer border has-[[data-state=checked]]:text-secondary has-[[data-state=checked]]:border-secondary"
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
        </div>
      </div>
      <div className="flex-col items-center">
        <Carousel className="mb-6 mt-3">
          <CarouselContent>
            <CarouselItem className="p-4">
              <div className="flex aspect-square items-center justify-center">
                <Image
                  src={product.image_front}
                  width={500}
                  height={500}
                  className="pointer-events-none cursor-auto w-full h-full object-contain focus:outline-none drop-shadow-lg"
                  alt="thumbnail"
                />
              </div>
            </CarouselItem>
            <CarouselItem className="p-4">
              <div className="flex aspect-square items-center justify-center">
                <Image
                  src={product.image_back}
                  width={500}
                  height={500}
                  className="pointer-events-none cursor-auto w-full h-full object-contain focus:outline-none drop-shadow-lg"
                  alt="thumbnail"
                />
              </div>
            </CarouselItem>
          </CarouselContent>
          <CarouselNavigation alwaysShow />
          <CarouselIndicator />
        </Carousel>

        <div className="px-5 mb-6">
          <div className="flex-col mb-6">
            <div className="flex items-center">
              <div className="text-neutral-700 text-sm lg:text-base">
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

          {quantity === 0 ? (
            <Button
              variant="default"
              className="bg-card border-1 border-text-neutral-800 hover:border-none hover:bg-primary hover:shadow-lg w-full"
              onClick={() => addItem(selectedProduct)}
            >
              Add to Cart
            </Button>
          ) : (
            <div className="flex items-center justify-center">
              <Button
                variant="ghost"
                className="hover:bg-card"
                onClick={() => removeOne(selectedProduct)}
              >
                <Minus size={20} />
              </Button>
              <NumberFlow value={quantity} className="title-text font-semibold" trend={0} />
              <Button
                variant="ghost"
                className="hover:bg-card"
                onClick={() => addItem(selectedProduct)}
              >
                <Plus size={20} />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
