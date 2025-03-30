'use client'

import Image from 'next/image'
import { ozOptions, Product } from '@/types'
import { Button } from '@/components/ui/button'
import { useAddToCart, useCart, useRemoveFromCart } from '@/lib/queries/useCart'
import { Minus, Plus } from 'lucide-react'
import NumberFlow from '@number-flow/react'
import {
  Carousel,
  CarouselContent,
  CarouselNavigation,
  CarouselIndicator,
  CarouselItem,
} from '@/components/ui/carousel'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useEffect, useState } from 'react'
import ProductPrice from './productPrice'

type ProductCardProps = {
  product: Product
}

export default function ProductCard({ product }: ProductCardProps) {
  const addToCartMutation = useAddToCart()
  const removeFromCartMutation = useRemoveFromCart()
  const { data: cart = [] } = useCart()

  const [selectedWeight, setSelectedWeight] = useState<string | null>('1')
  const isOunceBased = product.product_name in ozOptions
  const weightOptions = ozOptions[product.product_name]

  const updatedProduct: Product = {
    ...product,
    product_name:
      isOunceBased && selectedWeight
        ? `${product.product_name.split(' (')[0]} (${selectedWeight} oz)`
        : product.product_name,
  }

  const cartItem = cart.find((item) => item.product_name === updatedProduct.product_name)
  const quantity = cartItem?.quantity ?? 0

  return (
    <div className="bg-card h-auto w-auto sm:w-[22rem] max-w-[22rem] mx-5 my-5 rounded-lg border-b-3 border-primary shadow-xl relative focus-within:shadow-2xl focus-within:shadow-primary/[0.2] hover:shadow-2xl hover:shadow-primary/[0.2] transition-all duration-300 w-full">
      <div className="flex-col items-center  ">
        <div>
          <Carousel className="mb-6">
            <CarouselContent>
              <CarouselItem className="p-4">
                <div className="flex aspect-square items-center justify-center m-0 p-0">
                  <Image
                    src={product.image_front}
                    width={500}
                    height={500}
                    className="pointer-events-none cursor-auto w-full h-full object-contain focus:outline-none drop-shadow-lg"
                    alt="thumbnail"
                    tabIndex={0}
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
                    tabIndex={0}
                  />
                </div>
              </CarouselItem>
            </CarouselContent>
            <CarouselNavigation alwaysShow />
            <CarouselIndicator />
          </Carousel>
        </div>
        <div className="px-5">
          <div className="flex items-start mb-6">
            <div className="flex-col justify mr-auto">
              <div className="primary-text">{updatedProduct.product_name}</div>
              <div className="tertiary-text">{product.mint_name}</div>
            </div>
            <ProductPrice product={product} />
          </div>
          {weightOptions && (
            <div className="flex items-center gap-2 justify-center w-full mb-6">
              <RadioGroup
                className="flex items-center justify-between w-full"
                value={selectedWeight || ''}
                onValueChange={(val) => setSelectedWeight(val)}
              >
                {weightOptions.map((item) => (
                  <label
                    key={item.value}
                    className=" 
                                peer h-12 w-18
                                relative flex flex-col
                                items-center text-center justify-center
                                cursor-pointer rounded-lg
                                border border-neutral-600
                                text-sm text-neutral-600
                                has-[[data-state=checked]]:text-secondary
                                has-[[data-state=checked]]:border-secondary
                                has-[[data-state=checked]]:border-[1.5px]
                                has-[[data-disabled]]:cursor-not-allowed
                                has-[[data-disabled]]:opacity-50
                             "
                  >
                    <RadioGroupItem
                      id={item.value}
                      value={item.value}
                      className="sr-only after:absolute after:inset-0"
                      disabled={item.disabled}
                    />
                    <p className="leading-none">{item.label}</p>
                  </label>
                ))}
              </RadioGroup>
            </div>
          )}
          {quantity === 0 ? (
            <Button
              variant="default"
              className="w-full mb-8 shadow-lg"
              disabled={addToCartMutation.isPending}
              onClick={() => addToCartMutation.mutate(updatedProduct)}
            >
              Add to Cart
            </Button>
          ) : (
            <div className="flex items-center justify-center mb-8">
              <Button
                variant="ghost"
                className="hover:bg-card"
                disabled={removeFromCartMutation.isPending}
                onClick={() => removeFromCartMutation.mutate(updatedProduct)}
              >
                <Minus size={20} />
              </Button>

              <div className="">
                <NumberFlow
                  value={quantity}
                  transformTiming={{ duration: 750, easing: 'ease-in' }}
                  spinTiming={{ duration: 150, easing: 'ease-out' }}
                  opacityTiming={{ duration: 350, easing: 'ease-out' }}
                  className="title-text text-center font-semibold"
                  trend={0}
                />
              </div>
              <Button
                variant="ghost"
                className="hover:bg-card"
                disabled={addToCartMutation.isPending}
                onClick={() => addToCartMutation.mutate(updatedProduct)}
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
