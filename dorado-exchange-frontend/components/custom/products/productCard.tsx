'use client'

import Image from 'next/image'
import { ozOptions, Product } from '@/types/product'
import { Button } from '@/components/ui/button'
import { useAddToCart, useCart, useRemoveFromCart } from '@/lib/queries/useCart'
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
import ProductPrice from './productPrice'
import { cn } from '@/lib/utils'

type ProductCardProps = {
  product: Product
  variants: Product[]
}

export default function ProductCard({ product, variants }: ProductCardProps) {
  const [selectedProduct, setSelectedProduct] = useState<Product>(product)
  const addToCartMutation = useAddToCart()
  const removeFromCartMutation = useRemoveFromCart()
  const { data: cart = [] } = useCart()

  const cartItem = cart.find((item) => item.product_name === selectedProduct.product_name)
  const quantity = cartItem?.quantity ?? 0

  const weightOptions = ozOptions[product.variant_group]

  return (
    <div className="bg-card h-auto w-auto sm:w-[22rem] max-w-[22rem] group relative rounded-lg border-t-2 border-primary shadow-xl focus-within:shadow-2xl focus-within:shadow-primary/[0.1] hover:shadow-2xl hover:shadow-primary/[0.1] transition-all duration-300 w-full">
      <div className="flex ml-auto m-0 p-0">
        <div className="ml-auto">
          {variants.length > 0 && weightOptions && (
            <div className="absolute top-.5 right-1 z-30">
              {' '}
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
                      className="flex items-center h-8 w-8 rounded-full items-center justify-center z-10 text-xs text-white border border-white hover:bg-muted"
                    >
                      <Scale size={16} />
                    </Button>
                  }
                >
                  {weightOptions.map((option) => (
                    <FloatingButtonItem key={option.name}>
                      <label
                        htmlFor={option.value}
                        className="h-8 w-16 rounded-lg flex items-center justify-center text-xs cursor-pointer border has-[[data-state=checked]]:text-secondary has-[[data-state=checked]]:border-secondary"
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
              <div className="flex aspect-square items-center justify-center m-0 p-0">
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
              <div className="flex aspect-square items-center justify-center m-0 p-0">
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

        <div className="px-5">
          <div className="flex items-start mb-6">
            <div className="flex-col justify mr-auto">
              <div className="primary-text">{selectedProduct.product_name}</div>
              <div className="tertiary-text">{selectedProduct.mint_name}</div>
            </div>
            <ProductPrice product={selectedProduct} />
          </div>

          {quantity === 0 ? (
            <Button
              variant="default"
              className="bg-card border-1 border-text-neutral-800 hover:border-none hover:bg-primary hover:shadow-lg w-full mb-8"
              disabled={addToCartMutation.isPending}
              onClick={() => addToCartMutation.mutate(selectedProduct)}
            >
              Add to Cart
            </Button>
          ) : (
            <div className="flex items-center justify-center mb-8">
              <Button
                variant="ghost"
                className="hover:bg-card"
                disabled={removeFromCartMutation.isPending}
                onClick={() => removeFromCartMutation.mutate(selectedProduct)}
              >
                <Minus size={20} />
              </Button>
              <NumberFlow value={quantity} className="title-text font-semibold" trend={0} />
              <Button
                variant="ghost"
                className="hover:bg-card"
                disabled={addToCartMutation.isPending}
                onClick={() => addToCartMutation.mutate(selectedProduct)}
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
